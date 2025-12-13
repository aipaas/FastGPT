import type { Processor } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import * as fs from 'fs/promises';
import type { RerankTrainTaskJobData } from './mq';
import { MongoRerankTrainTask } from './schema';
import {
  getRerankTrainTask,
  updateTaskStatus,
  updateCheckpointStage,
  updateCheckpointData
} from './controller';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { MongoRerankTrainsetData } from '../data/schema';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';
import {
  createAicpOptimizationTask,
  queryAicpTaskStatus,
  generateEvalDataset,
  evaluateRerank,
  AicpTaskStatus
} from '../external';
import { createRerankModelConfig } from '../model/controller';
import { addLog } from '../../../../common/system/log';

/**
 * 训练任务处理器
 *
 * 执行完整的 Rerank 模型训练流程：
 * 1. Preparing - 数据准备
 * 2. Finetuning - 模型微调（AICP）
 * 3. Registering - 模型注册
 * 4. Evaluating - 效果评测
 */
export const rerankTrainTaskProcessor: Processor<RerankTrainTaskJobData> = async (job) => {
  const { taskId, isRetry } = job.data;

  const task = await getRerankTrainTask(taskId);
  if (!task) {
    throw new UnrecoverableError('Task not found');
  }

  const currentStage = isRetry && task.checkpoint.stage ? task.checkpoint.stage : null;

  try {
    // 更新状态为 running
    if (task.status === RerankTrainTaskStatusEnum.pending) {
      await updateTaskStatus(taskId, RerankTrainTaskStatusEnum.running);
    }

    // 阶段1: 数据准备
    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.preparing)) {
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.preparing);
      const prepareResult = await runPrepareStage(task);
      await updateCheckpointData(taskId, 'preparing', {
        trainDatasetIds: prepareResult.trainDatasetIds,
        trainDatasetFilePath: prepareResult.trainDatasetFilePath
      });
    }

    // 阶段2: 模型微调
    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.finetuning)) {
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.finetuning);
      const finetuneResult = await runFinetuneStage(task);
      await updateCheckpointData(taskId, 'finetuning', {
        aicpTaskId: finetuneResult.aicpTaskId,
        tunedModelEndpoint: finetuneResult.tunedModelEndpoint
      });
    }

    // 阶段3: 模型注册
    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.registering)) {
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.registering);
      const registerResult = await runRegisterStage(task);
      await updateCheckpointData(taskId, 'registering', {
        tunedModelConfigId: registerResult.tunedModelConfigId
      });
    }

    // 阶段4: 效果评测（拆分为 4 个子步骤）
    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.evaluating)) {
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.evaluating);

      // 重新获取任务以获取最新的 checkpoint 数据
      const updatedTask = await getRerankTrainTask(taskId);
      if (!updatedTask) {
        throw new UnrecoverableError('Task not found after checkpoint update');
      }

      const checkpointData = updatedTask.checkpoint.data || {};
      const evaluatingData = checkpointData.evaluating || {};

      // 验证注册阶段数据
      if (!checkpointData.registering?.tunedModelConfigId) {
        throw new UnrecoverableError('Tuned model config ID not found in checkpoint');
      }

      // 子步骤1: 生成基础模型评测数据集
      if (!evaluatingData.baseModelEvalDatasetId) {
        const baseEvalDatasetId = await runGenerateBaseEvalDataset(updatedTask);
        await updateCheckpointData(
          taskId,
          'evaluating',
          { baseModelEvalDatasetId: baseEvalDatasetId },
          true
        );
      }

      // 子步骤2: 生成微调模型评测数据集
      if (!evaluatingData.tunedModelEvalDatasetId) {
        const tunedEvalDatasetId = await runGenerateTunedEvalDataset(updatedTask);
        await updateCheckpointData(
          taskId,
          'evaluating',
          { tunedModelEvalDatasetId: tunedEvalDatasetId },
          true
        );
      }

      // 重新获取更新后的数据
      const taskAfterEvalDatasets = await getRerankTrainTask(taskId);
      if (!taskAfterEvalDatasets) {
        throw new UnrecoverableError('Task not found');
      }
      const evalData = taskAfterEvalDatasets.checkpoint.data?.evaluating || {};

      // 子步骤3: 获取基础模型评测结果
      if (!evalData.baseModelEvalResult) {
        const baseModelEvalResult = await runEvaluateBaseModel(
          taskAfterEvalDatasets,
          evalData.baseModelEvalDatasetId!,
          taskAfterEvalDatasets.baseModelConfigId
        );
        await updateCheckpointData(taskId, 'evaluating', { baseModelEvalResult }, true);
      }

      // 子步骤4: 获取微调模型评测结果
      if (!evalData.tunedModelEvalResult) {
        const taskBeforeTunedEval = await getRerankTrainTask(taskId);
        if (!taskBeforeTunedEval) {
          throw new UnrecoverableError('Task not found');
        }
        const evalDataBeforeTuned = taskBeforeTunedEval.checkpoint.data?.evaluating || {};

        const tunedModelEvalResult = await runEvaluateTunedModel(
          taskBeforeTunedEval,
          evalDataBeforeTuned.tunedModelEvalDatasetId!,
          checkpointData.registering.tunedModelConfigId
        );
        await updateCheckpointData(taskId, 'evaluating', { tunedModelEvalResult }, true);
      }

      // 保存最终结果
      const finalTask = await getRerankTrainTask(taskId);
      if (!finalTask) {
        throw new UnrecoverableError('Task not found');
      }
      const finalCheckpoint = finalTask.checkpoint.data || {};
      const finalEvaluating = finalCheckpoint.evaluating || {};

      await MongoRerankTrainTask.updateOne(
        { _id: taskId },
        {
          result: {
            trainDatasetIds: finalCheckpoint.preparing?.trainDatasetIds || [],
            trainDatasetFilePath: finalCheckpoint.preparing?.trainDatasetFilePath || '',
            tunedModelConfigId: finalCheckpoint.registering?.tunedModelConfigId || '',
            baseModelEvalDatasetId: finalEvaluating.baseModelEvalDatasetId!,
            tunedModelEvalDatasetId: finalEvaluating.tunedModelEvalDatasetId!,
            baseModelEvalResult: finalEvaluating.baseModelEvalResult!,
            tunedModelEvalResult: finalEvaluating.tunedModelEvalResult!
          }
        }
      );
    }

    // 完成
    await updateTaskStatus(taskId, RerankTrainTaskStatusEnum.completed);

    addLog.info('Rerank train task completed', { taskId });
  } catch (error) {
    addLog.error('Rerank train task failed', error);

    if (error instanceof UnrecoverableError) {
      await MongoRerankTrainTask.updateOne(
        { _id: taskId },
        {
          status: RerankTrainTaskStatusEnum.failed,
          errorMsg: (error as Error).message,
          updateTime: new Date()
        }
      );
      throw error;
    }
    throw error;
  }
};

/**
 * 判断是否应该运行某个阶段
 */
function shouldRunStage(
  currentStage: `${RerankTaskCheckpointStageEnum}` | null,
  targetStage: `${RerankTaskCheckpointStageEnum}`
): boolean {
  if (currentStage === null) return true;

  const stageOrder: RerankTaskCheckpointStageEnum[] = [
    RerankTaskCheckpointStageEnum.preparing,
    RerankTaskCheckpointStageEnum.finetuning,
    RerankTaskCheckpointStageEnum.registering,
    RerankTaskCheckpointStageEnum.evaluating
  ];

  // 将字符串转换为枚举进行比较
  const currentStageEnum = currentStage as RerankTaskCheckpointStageEnum;
  const targetStageEnum = targetStage as RerankTaskCheckpointStageEnum;

  return stageOrder.indexOf(targetStageEnum) >= stageOrder.indexOf(currentStageEnum);
}

/**
 * 阶段1: 数据准备
 * 组织训练数据为 JSONL 格式，准备上传到 AICP
 */
async function runPrepareStage(task: RerankTrainTaskSchemaType): Promise<{
  trainDatasetIds: string[];
  trainDatasetFilePath: string;
}> {
  addLog.info('Run prepare stage', { taskId: String(task._id) });

  // 获取应用训练数据
  const trainData = await MongoRerankTrainsetData.find({
    appId: task.appId
  }).lean();

  if (trainData.length === 0) {
    throw new UnrecoverableError('No train data available');
  }

  // 转换为 JSONL 格式
  // 每行一个 JSON 对象：{"queries": ["..."], "pos": ["..."], "neg": ["..."]}
  const jsonlLines = trainData.map((data) => {
    return JSON.stringify({
      queries: data.queries,
      pos: data.positiveDocs,
      neg: data.negativeDocs
    });
  });

  const jsonlContent = jsonlLines.join('\n');

  // 写入临时文件
  const tmpFilePath = `/tmp/rerank_train_${task._id}_${Date.now()}.jsonl`;
  await fs.writeFile(tmpFilePath, jsonlContent, 'utf-8');

  // 记录实际使用的训练数据ID
  const trainDatasetIds = trainData.map((data) => String(data._id));

  addLog.info('Prepared train data', {
    taskId: String(task._id),
    dataCount: trainData.length,
    trainDatasetIds: trainDatasetIds.length,
    filePath: tmpFilePath
  });

  return {
    trainDatasetIds,
    trainDatasetFilePath: tmpFilePath
  };
}

/**
 * 阶段2: 模型微调
 * 调用 AICP 训推平台，上传 JSONL 数据集，AICP 自动完成微调并部署到推理服务
 */
async function runFinetuneStage(task: RerankTrainTaskSchemaType): Promise<{
  aicpTaskId: string;
  tunedModelEndpoint: {
    ip: string;
    port: string;
    model: string;
    api_key: string;
  };
}> {
  addLog.info('Run finetune stage', { taskId: String(task._id) });

  const checkpointData = task.checkpoint.data || {};
  if (!checkpointData.preparing?.trainDatasetFilePath) {
    throw new UnrecoverableError('Dataset file path not found in checkpoint');
  }

  // 从任务根字段读取 baseModelEndpoint
  if (!task.baseModelEndpoint) {
    throw new UnrecoverableError('Base model endpoint not found in task');
  }

  const baseModelEndpoint = task.baseModelEndpoint;

  // 读取 JSONL 文件
  const datasetFile = await fs.readFile(checkpointData.preparing.trainDatasetFilePath);

  // 调用 AICP 训推平台创建优化任务
  const createResponse = await createAicpOptimizationTask({
    datasetFile,
    taskType: 'rerank',
    parameters: {
      learning_rate: 0.0001,
      epochs: 3,
      batch_size: 32
    }
  });

  const aicpTaskId = createResponse.task_id;

  addLog.info('Created AICP optimization task', {
    taskId: String(task._id),
    aicpTaskId
  });

  // 轮询训练状态，直到 completed
  let completed = false;
  let endpoint:
    | {
        ip: string;
        port: string;
        model: string;
        api_key: string;
      }
    | undefined = undefined;
  const maxPolls = 2000; // 最多轮询 2000 次
  let pollCount = 0;

  while (!completed && pollCount < maxPolls) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 每 5 秒轮询一次

    const statusResponse = await queryAicpTaskStatus({
      taskId: aicpTaskId
    });

    addLog.info('AICP task status', {
      taskId: String(task._id),
      aicpTaskId,
      status: statusResponse.status,
      progress: statusResponse.progress
    });

    if (statusResponse.status === AicpTaskStatus.completed) {
      // AICP 已自动完成训练和部署，返回 endpoint 信息
      completed = true;
      endpoint = statusResponse.endpoint;

      if (!endpoint) {
        throw new Error('AICP task completed but endpoint not returned');
      }
    } else if (statusResponse.status === AicpTaskStatus.failed) {
      throw new Error(`AICP task failed: ${statusResponse.error}`);
    }

    pollCount++;
  }

  if (!completed) {
    throw new Error('AICP task polling timeout (exceeded maximum polling duration)');
  }

  // 此时 endpoint 必须存在，否则在前面已经抛出异常
  if (!endpoint) {
    throw new Error('AICP task completed but endpoint not available');
  }

  addLog.info('Finetune stage completed (AICP auto-deployed to serving)', {
    taskId: String(task._id),
    baseModelConfigId: task.baseModelConfigId,
    baseModelEndpoint: task.baseModelEndpoint,
    tunedModelEndpoint: endpoint
  });

  return {
    aicpTaskId,
    tunedModelEndpoint: endpoint
  };
}

/**
 * 阶段3: 模型注册
 * 在 FastGPT 模型管理中注册微调后的 Rerank 模型配置
 */
async function runRegisterStage(task: RerankTrainTaskSchemaType): Promise<{
  tunedModelConfigId: string;
}> {
  addLog.info('Run register stage', { taskId: String(task._id) });

  const checkpointData = task.checkpoint.data || {};
  if (!checkpointData.finetuning?.tunedModelEndpoint) {
    throw new UnrecoverableError('Tuned model endpoint not found in checkpoint');
  }

  // 从任务根级别读取 baseModelConfigId
  if (!task.baseModelConfigId) {
    throw new UnrecoverableError('Base model config ID not found in task');
  }

  const tunedEndpoint = checkpointData.finetuning.tunedModelEndpoint;
  const baseModelConfigId = task.baseModelConfigId;

  // 创建微调后模型配置
  const tunedModelRequestUrl = `http://${tunedEndpoint.ip}:${tunedEndpoint.port}`;
  const tunedModelId = `aicp-rerank-finetuned-${task._id}-${Date.now()}`;
  const tunedModelConfigId = await createRerankModelConfig({
    model: tunedModelId,
    name: `${task.name} - 微调后`,
    modelAddress: tunedModelRequestUrl,
    isActive: true,
    charsPointsPrice: 0
  });

  addLog.info('Registered fine-tuned model config in FastGPT', {
    taskId: String(task._id),
    modelConfigId: tunedModelConfigId,
    endpoint: tunedEndpoint
  });

  addLog.info('Register stage completed', {
    taskId: String(task._id),
    baseModelConfigId,
    tunedModelConfigId
  });

  return {
    tunedModelConfigId
  };
}

/**
 * 子步骤1: 生成基础模型评测数据集
 */
async function runGenerateBaseEvalDataset(task: RerankTrainTaskSchemaType): Promise<string> {
  addLog.info('Run generate base eval dataset', { taskId: String(task._id) });

  // 使用 DiTing 服务生成评测数据集
  const response = await generateEvalDataset({
    appId: String(task.appId),
    sampleSize: 200
  });

  if (!response.success) {
    throw new Error(`Failed to generate base model eval dataset: ${response.error}`);
  }

  addLog.info('Generated base eval dataset', {
    taskId: String(task._id),
    datasetId: response.datasetId
  });

  return response.datasetId;
}

/**
 * 子步骤2: 生成微调模型评测数据集
 */
async function runGenerateTunedEvalDataset(task: RerankTrainTaskSchemaType): Promise<string> {
  addLog.info('Run generate tuned eval dataset', { taskId: String(task._id) });

  // 使用 DiTing 服务生成评测数据集
  const response = await generateEvalDataset({
    appId: String(task.appId),
    sampleSize: 200
  });

  if (!response.success) {
    throw new Error(`Failed to generate tuned model eval dataset: ${response.error}`);
  }

  addLog.info('Generated tuned eval dataset', {
    taskId: String(task._id),
    datasetId: response.datasetId
  });

  return response.datasetId;
}

/**
 * 子步骤3: 获取基础模型评测结果
 */
async function runEvaluateBaseModel(
  task: RerankTrainTaskSchemaType,
  baseEvalDatasetId: string,
  baseModelConfigId: string
): Promise<Record<string, unknown>> {
  addLog.info('Run evaluate base model', { taskId: String(task._id) });

  // 使用 DiTing 服务评测
  const response = await evaluateRerank({
    evalDatasetId: baseEvalDatasetId,
    modelConfigId: baseModelConfigId
  });

  if (!response.success) {
    throw new Error('Base model evaluation failed');
  }

  addLog.info('Base model evaluated', {
    taskId: String(task._id),
    ndcg: response.result.ndcg
  });

  return response.result;
}

/**
 * 子步骤4: 获取微调模型评测结果
 */
async function runEvaluateTunedModel(
  task: RerankTrainTaskSchemaType,
  tunedEvalDatasetId: string,
  tunedModelConfigId: string
): Promise<Record<string, unknown>> {
  addLog.info('Run evaluate tuned model', { taskId: String(task._id) });

  // 使用 DiTing 服务评测
  const response = await evaluateRerank({
    evalDatasetId: tunedEvalDatasetId,
    modelConfigId: tunedModelConfigId
  });

  if (!response.success) {
    throw new Error('Tuned model evaluation failed');
  }

  addLog.info('Tuned model evaluated', {
    taskId: String(task._id),
    ndcg: response.result.ndcg
  });

  return response.result;
}

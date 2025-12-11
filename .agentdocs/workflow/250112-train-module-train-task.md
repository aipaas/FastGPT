# Workflow: 训练任务管理

**任务ID**: 250112-train-module-train-task
**创建时间**: 2025-01-12
**状态**: 待开始
**依赖**: 250112-train-module-trainset-data
**后续**: 250112-train-module-integration

## 任务目标

实现 Rerank 模型训练任务的完整管理功能，包括：
1. RerankTrainTask Schema 定义
2. 训练任务控制器
3. 训练任务队列和处理器（核心训练流程）
4. 训练任务 CRUD API（创建、列表、详情、重试、取消、删除）

## 背景说明

训练任务是训练模块的**核心执行流程**，管理 Rerank 模型从数据准备到训练完成的完整生命周期：

### 训练流程（4 个阶段）
1. **Preparing（数据准备）**：组织训练数据，创建训练数据集（JSONL 格式）
2. **Finetuning（模型微调）**：调用 Sangfor AICP 训推平台，执行模型微调并自动部署到推理服务
3. **Registering（模型注册）**：通过 FastGPT 模型管理，注册 AICP 渠道微调后的模型配置（使用上一阶段返回的 endpoint）
4. **Evaluating（效果评测）**：通过调用当前应用的知识库搜索节点生成评测数据集（base model 一次，fine-tuned model 一次），评测微调前后效果

### 关键特性
- **Checkpoint 断点续跑**：每个阶段完成后保存检查点，失败后可从断点恢复
- **异步执行**：通过 BullMQ 队列异步执行，避免长时间阻塞
- **状态管理**：pending → running → completed/failed/cancelled
- **重试机制**：支持失败重试，最多 3 次

## 实施方案

### 1. 目录结构
```
packages/service/core/train/rerank/task/
├── schema.ts                   # RerankTrainTask Schema
├── controller.ts               # 训练任务控制器
├── mq.ts                       # BullMQ 队列配置
└── processor.ts                # Worker 处理器（核心训练流程）

projects/app/src/pages/api/core/train/rerank/task/
├── create.ts                   # 创建训练任务
├── list.ts                     # 训练任务列表
├── detail.ts                   # 训练任务详情
├── retry.ts                    # 重试训练任务
├── cancel.ts                   # 取消训练任务
└── delete.ts                   # 删除训练任务
```

### 2. Schema 定义

```typescript
// packages/service/core/train/rerank/task/schema.ts

import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';

const RerankTrainTaskSchema = new connectionMongo.Schema({
  appId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'app',
    required: true
  },
  teamId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'team',
    required: true
  },
  tmbId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'team_member',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  baseModelConfigId: {
    type: String,
    required: true
  },
  baseModelEndpoint: {
    type: {
      ip: String,
      port: String,
      model: String,
      api_key: String
    },
    required: true
  },
  status: {
    type: String,
    enum: Object.values(RerankTrainTaskStatusEnum),
    default: RerankTrainTaskStatusEnum.pending
  },
  checkpoint: {
    type: {
      stage: {
        type: String,
        enum: [...Object.values(RerankTaskCheckpointStageEnum), null],
        default: null
      },
      data: {
        // 阶段1: 数据准备
        preparing: {
          trainDatasetIds: [String],
          trainDatasetFilePath: String
        },
        // 阶段2: 模型微调
        finetuning: {
          aicpTaskId: String,
          tunedModelEndpoint: {
            ip: String,
            port: String,
            model: String,
            api_key: String
          }
        },
        // 阶段3: 模型注册
        registering: {
          tunedModelConfigId: String
        },
        // 阶段4: 效果评测（拆分为 4 个子步骤，支持细粒度断点续传）
        evaluating: {
          baseModelEvalDatasetId: String,          // 子步骤1
          tunedModelEvalDatasetId: String,         // 子步骤2
          baseModelEvalResult: connectionMongo.Schema.Types.Mixed,    // 子步骤3
          tunedModelEvalResult: connectionMongo.Schema.Types.Mixed    // 子步骤4
        }
      },
      stageStartTime: {
        preparing: Date,
        finetuning: Date,
        registering: Date,
        evaluating: Date
      }
    },
    default: {
      stage: null,
      data: {},
      stageStartTime: {}
    }
  },
  result: {
    type: {
      trainDatasetIds: [String],
      trainDatasetFilePath: String,
      tunedModelConfigId: String,
      baseModelEvalDatasetId: String,
      tunedModelEvalDatasetId: String,
      baseModelEvalResult: connectionMongo.Schema.Types.Mixed,
      tunedModelEvalResult: connectionMongo.Schema.Types.Mixed
    }
  },
  errorMsg: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0
  },
  jobId: {
    type: String
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  finishTime: {
    type: Date
  }
});

// 索引
RerankTrainTaskSchema.index({ appId: 1, createTime: -1 });
RerankTrainTaskSchema.index({ teamId: 1, status: 1 });
RerankTrainTaskSchema.index({ status: 1, updateTime: 1 });
RerankTrainTaskSchema.index({ jobId: 1 });
RerankTrainTaskSchema.index({ 'checkpoint.stage': 1, status: 1 });

try {
  export const MongoRerankTrainTask: Model<RerankTrainTaskSchemaType> = getMongoModel(
    'rerank_train_task',
    RerankTrainTaskSchema
  );
} catch (error) {
  console.error(error);
}
```

### 3. 控制器函数

```typescript
// packages/service/core/train/rerank/task/controller.ts

import { MongoRerankTrainTask } from './schema';
import { MongoRerankTrainset } from '../trainset/schema';
import { MongoRerankTrainsetData } from '../data/schema';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '@fastgpt/service/common/system/log';

/**
 * 创建训练任务（仅创建记录，不启动）
 */
export async function createRerankTrainTask(params: {
  appId: string;
  teamId: string;
  tmbId: string;
  name?: string;
}): Promise<string> {
  const { appId, teamId, tmbId, name } = params;

  // 1. 从 App 工作流中提取当前使用的 rerank 模型配置
  const app = await MongoApp.findById(appId);
  if (!app) {
    throw new Error('Application not found');
  }

  const rerankNode = app.modules.find(
    m => m.flowNodeType === 'rerankNode' ||
         (m.flowNodeType === 'datasetSearchNode' && m.rerankConfig?.modelId)
  );

  if (!rerankNode) {
    throw new Error('No rerank node found in application workflow');
  }

  const baseModelConfigId = String(rerankNode.moduleId || rerankNode.rerankConfig?.modelId);
  if (!baseModelConfigId) {
    throw new Error('Base model config ID not found in rerank node');
  }

  // 2. 查询模型配置获取 endpoint 信息
  const baseModelConfig = await MongoAIModel.findById(baseModelConfigId);
  if (!baseModelConfig) {
    throw new Error('Base rerank model config not found');
  }

  // 解析 endpoint 信息
  const baseUrl = baseModelConfig.baseUrl || '';
  const urlParts = baseUrl.replace(/^https?:\/\//, '').split(':');
  const baseModelEndpoint = {
    ip: urlParts[0] || 'localhost',
    port: urlParts[1]?.split('/')[0] || '80',
    model: baseModelConfig.model || 'bge-reranker-v2-m3',
    api_key: baseModelConfig.apiKey || ''
  };

  addLog.info('Extracted base model config from App workflow', {
    appId,
    baseModelConfigId,
    baseModelEndpoint
  });

  // 3. 创建训练任务记录
  const [{ _id }] = await MongoRerankTrainTask.create([
    {
      appId,
      teamId,
      tmbId,
      name: name || `Rerank训练-${new Date().toLocaleDateString()}`,
      baseModelConfigId,
      baseModelEndpoint,
      status: RerankTrainTaskStatusEnum.pending,
      checkpoint: {
        stage: null,
        data: {},
        stageStartTime: {}
      },
      retryCount: 0
    }
  ]);

  addLog.info('Created rerank train task', {
    appId,
    taskId: String(_id)
  });

  return String(_id);
}

/**
 * 更新任务状态
 */
export async function updateTaskStatus(
  taskId: string,
  status: `${RerankTrainTaskStatusEnum}`
): Promise<void> {
  const updateData: any = {
    status,
    updateTime: new Date()
  };

  if (status === RerankTrainTaskStatusEnum.completed || status === RerankTrainTaskStatusEnum.cancelled) {
    updateData.finishTime = new Date();
  }

  await MongoRerankTrainTask.updateOne({ _id: taskId }, updateData);

  addLog.info('Updated task status', { taskId, status });
}

/**
 * 更新检查点阶段
 */
export async function updateCheckpointStage(
  taskId: string,
  stage: `${RerankTaskCheckpointStageEnum}`
): Promise<void> {
  await MongoRerankTrainTask.updateOne(
    { _id: taskId },
    {
      'checkpoint.stage': stage,
      [`checkpoint.stageStartTime.${stage}`]: new Date(),
      updateTime: new Date()
    }
  );

  addLog.info('Updated checkpoint stage', { taskId, stage });
}

/**
 * 更新检查点数据（细粒度更新）
 *
 * 用于更新特定阶段的 checkpoint 数据，支持两种模式：
 * 1. 整体更新：替换整个阶段的数据
 * 2. 部分更新：只更新阶段内的某些字段（用于评估阶段的 4 个子步骤）
 *
 * @example 整体更新
 * await updateCheckpointData(taskId, 'preparing', {
 *   trainDatasetIds: [...],
 *   trainDatasetFilePath: '...'
 * });
 *
 * @example 部分更新（评估阶段）
 * await updateCheckpointData(taskId, 'evaluating', {
 *   baseModelEvalDatasetId: '...'
 * }, true);
 */
export async function updateCheckpointData(
  taskId: string,
  stage: 'preparing' | 'finetuning' | 'registering' | 'evaluating',
  data: any,
  merge: boolean = false  // 是否合并更新（保留其他字段）
): Promise<void> {
  if (merge) {
    // 部分更新：使用点表示法更新单个字段
    const updateFields: any = { updateTime: new Date() };
    for (const [key, value] of Object.entries(data)) {
      updateFields[`checkpoint.data.${stage}.${key}`] = value;
    }
    await MongoRerankTrainTask.updateOne({ _id: taskId }, updateFields);
  } else {
    // 整体更新：替换整个阶段数据
    await MongoRerankTrainTask.updateOne(
      { _id: taskId },
      {
        [`checkpoint.data.${stage}`]: data,
        updateTime: new Date()
      }
    );
  }

  addLog.info('Updated checkpoint data', { taskId, stage, merge, keys: Object.keys(data) });
}

/**
 * 获取训练任务
 */
export async function getRerankTrainTask(taskId: string): Promise<RerankTrainTaskSchemaType | null> {
  return MongoRerankTrainTask.findById(taskId).lean();
}

/**
 * 删除训练任务
 */
export async function deleteRerankTrainTask(taskId: string): Promise<void> {
  await MongoRerankTrainTask.deleteOne({ _id: taskId });

  addLog.info('Deleted rerank train task', { taskId });
}
```

### 4. 队列配置

```typescript
// packages/service/core/train/rerank/task/mq.ts

import { getQueue } from '@fastgpt/service/common/system/mq';

export const RerankTrainTaskQueueName = 'rerankTrainTask';

export type RerankTrainTaskJobData = {
  taskId: string;
  teamId: string;
  tmbId: string;
  isRetry?: boolean;
};

export const rerankTrainTaskQueue = getQueue<RerankTrainTaskJobData>(RerankTrainTaskQueueName, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 7 * 24 * 60 * 60 },
    removeOnFail: false  // 失败任务保留，便于排查
  }
});
```

### 5. 处理器实现（核心）

```typescript
// packages/service/core/train/rerank/task/processor.ts

import type { Processor } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import type { RerankTrainTaskJobData } from './mq';
import {
  MongoRerankTrainTask,
  getRerankTrainTask,
  updateTaskStatus,
  updateCheckpointStage,
  updateCheckpointData
} from './controller';
import { MongoRerankTrainsetData } from '../data/schema';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';
import {
  callCreateAicpOptimizationTask,
  callQueryAicpTaskStatus,
  callDiTingGenerateEvalDataset,
  callDiTingEvaluateRerank,
  AicpTaskStatus
} from '../external';
import { createRerankModelConfig } from '../model/controller';
import { addLog } from '@fastgpt/service/common/system/log';

/**
 * 训练任务处理器
 */
export const rerankTrainTaskProcessor: Processor<RerankTrainTaskJobData> = async (job) => {
  const { taskId, isRetry } = job.data;

  const task = await getRerankTrainTask(taskId);
  if (!task) {
    throw new UnrecoverableError('Task not found');
  }

  const currentStage = isRetry && task.checkpoint.stage ? task.checkpoint.stage : null;

  try {
    if (task.status === RerankTrainTaskStatusEnum.pending) {
      await updateTaskStatus(taskId, RerankTrainTaskStatusEnum.running);
    }

    // 阶段1: 数据准备
    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.preparing)) {
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.preparing);
      const prepareResult = await runPrepareStage(task);
      await MongoRerankTrainTask.updateOne(
        { _id: taskId },
        {
          'checkpoint.data.preparing': {
            trainDatasetIds: prepareResult.trainDatasetIds,
            trainDatasetFilePath: prepareResult.trainDatasetFilePath
          }
        }
      );
    }

    // 阶段2: 模型微调（AICP 执行微调并自动部署到推理服务）
    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.finetuning)) {
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.finetuning);
      const finetuneResult = await runFinetuneStage(task);
      await MongoRerankTrainTask.updateOne(
        { _id: taskId },
        {
          'checkpoint.data.finetuning': {
            aicpTaskId: finetuneResult.aicpTaskId,
            tunedModelEndpoint: finetuneResult.tunedModelEndpoint
          }
        }
      );
    }

    // 阶段3: 模型注册（在 FastGPT 中注册模型配置）
    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.registering)) {
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.registering);
      const registerResult = await runRegisterStage(task);
      await MongoRerankTrainTask.updateOne(
        { _id: taskId },
        {
          'checkpoint.data.registering': {
            tunedModelConfigId: registerResult.tunedModelConfigId
          }
        }
      );
    }

    // 阶段4: 效果评测（拆分为 4 个子步骤，支持断点续传）
    if (shouldRunStage(currentStage, RerankTaskCheckpointStageEnum.evaluating)) {
      await updateCheckpointStage(taskId, RerankTaskCheckpointStageEnum.evaluating);

      const checkpointData = task.checkpoint.data || {};
      const evaluatingData = checkpointData.evaluating || {};

      // 验证注册阶段数据
      if (!checkpointData.registering?.baseModelConfigId || !checkpointData.registering?.tunedModelConfigId) {
        throw new UnrecoverableError('Model config IDs not found in checkpoint');
      }

      // 子步骤1: 生成基础模型评测数据集（如果未生成）
      if (!evaluatingData.baseModelEvalDatasetId) {
        const baseEvalDatasetId = await runGenerateBaseEvalDataset(task);
        await updateCheckpointData(taskId, 'evaluating', { baseModelEvalDatasetId }, true);
        evaluatingData.baseModelEvalDatasetId = baseEvalDatasetId;
      }

      // 子步骤2: 生成微调模型评测数据集（如果未生成）
      if (!evaluatingData.tunedModelEvalDatasetId) {
        const tunedEvalDatasetId = await runGenerateTunedEvalDataset(task);
        await updateCheckpointData(taskId, 'evaluating', { tunedModelEvalDatasetId }, true);
        evaluatingData.tunedModelEvalDatasetId = tunedEvalDatasetId;
      }

      // 子步骤3: 获取基础模型评测结果（如果未评测）
      if (!evaluatingData.baseModelEvalResult) {
        const baseModelEvalResult = await runEvaluateBaseModel(
          task,
          evaluatingData.baseModelEvalDatasetId!,
          task.baseModelConfigId  // 从任务根字段读取
        );
        await updateCheckpointData(taskId, 'evaluating', { baseModelEvalResult }, true);
        evaluatingData.baseModelEvalResult = baseModelEvalResult;
      }

      // 子步骤4: 获取微调模型评测结果（如果未评测）
      if (!evaluatingData.tunedModelEvalResult) {
        const tunedModelEvalResult = await runEvaluateTunedModel(
          task,
          evaluatingData.tunedModelEvalDatasetId!,
          checkpointData.registering.tunedModelConfigId
        );
        await updateCheckpointData(taskId, 'evaluating', { tunedModelEvalResult }, true);
        evaluatingData.tunedModelEvalResult = tunedModelEvalResult;
      }

      // 保存最终结果
      await MongoRerankTrainTask.updateOne(
        { _id: taskId },
        {
          result: {
            trainDatasetIds: checkpointData.preparing?.trainDatasetIds || [],
            trainDatasetFilePath: checkpointData.preparing?.trainDatasetFilePath || '',
            tunedModelConfigId: checkpointData.registering?.tunedModelConfigId || '',
            baseModelEvalDatasetId: evaluatingData.baseModelEvalDatasetId!,
            tunedModelEvalDatasetId: evaluatingData.tunedModelEvalDatasetId!,
            baseModelEvalResult: evaluatingData.baseModelEvalResult!,
            tunedModelEvalResult: evaluatingData.tunedModelEvalResult!
          }
        }
      );
    }

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

  return stageOrder.indexOf(targetStage as any) >= stageOrder.indexOf(currentStage as any);
}

/**
 * 阶段1: 数据准备
 * 组织训练数据为 JSONL 格式，准备上传到 AICP
 */
async function runPrepareStage(task: any): Promise<{
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
  const jsonlLines = trainData.map(data => {
    return JSON.stringify({
      queries: data.queries,      // 保持与 Schema 一致，使用 queries 数组
      pos: data.positiveDocs,
      neg: data.negativeDocs
    });
  });

  const jsonlContent = jsonlLines.join('\n');

  // 写入临时文件
  // 注意：实际实现需要 import * as fs from 'fs/promises';
  const tmpFilePath = `/tmp/rerank_train_${task._id}_${Date.now()}.jsonl`;
  await fs.promises.writeFile(tmpFilePath, jsonlContent, 'utf-8');

  // 记录实际使用的训练数据ID（用于追溯）
  const trainDatasetIds = trainData.map(data => String(data._id));

  addLog.info('Prepared train data', {
    taskId: String(task._id),
    dataCount: trainData.length,
    trainDatasetIds: trainDatasetIds.length,
    filePath: tmpFilePath
  });

  return {
    trainDatasetIds,              // 实际使用的训练数据ID列表
    trainDatasetFilePath: tmpFilePath
  };
}

/**
 * 阶段2: 模型微调
 * 调用 AICP 训推平台，上传 JSONL 数据集，AICP 自动完成微调并部署到推理服务
 */
async function runFinetuneStage(task: any): Promise<{
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

  // 从任务根字段读取 baseModelEndpoint（在任务创建时已从 App 工作流提取并解析）
  if (!task.baseModelEndpoint) {
    throw new UnrecoverableError('Base model endpoint not found in task');
  }

  const baseModelEndpoint = task.baseModelEndpoint;

  // 读取 JSONL 文件
  const datasetFile = await fs.promises.readFile(checkpointData.preparing.trainDatasetFilePath);

  // 调用 AICP 训推平台创建优化任务（上传 multipart/form-data）
  const createResponse = await callCreateAicpOptimizationTask({
    datasetFile,  // 使用实际读取的文件内容
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

  // 轮询训练状态，直到 completed（AICP 自动完成训练和部署）
  let completed = false;
  let endpoint: any = null;
  const maxPolls = 2000;  // 最多轮询 2000 次（约 2.8 小时），足够基础微调完成
  let pollCount = 0;

  while (!completed && pollCount < maxPolls) {
    await new Promise(resolve => setTimeout(resolve, 5000));  // 每 5 秒轮询一次

    const statusResponse = await callQueryAicpTaskStatus({
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
 * 在 FastGPT 模型管理中注册微调后的 Rerank 模型配置（使用 AICP endpoint）
 */
async function runRegisterStage(task: any): Promise<{
  tunedModelConfigId: string;
}> {
  addLog.info('Run register stage', { taskId: String(task._id) });

  const checkpointData = task.checkpoint.data || {};
  if (!checkpointData.finetuning?.tunedModelEndpoint) {
    throw new UnrecoverableError('Tuned model endpoint not found in checkpoint');
  }

  // 从任务根级别读取 baseModelConfigId（在任务创建时已从 App 工作流提取）
  if (!task.baseModelConfigId) {
    throw new UnrecoverableError('Base model config ID not found in task');
  }

  const tunedEndpoint = checkpointData.finetuning.tunedModelEndpoint;
  const baseModelConfigId = task.baseModelConfigId;

  // 创建微调后模型配置 - 通过 FastGPT 模型管理注册 AICP 渠道模型
  const tunedModelRequestUrl = `http://${tunedEndpoint.ip}:${tunedEndpoint.port}`;
  const tunedModelId = `aicp-rerank-finetuned-${task._id}-${Date.now()}`;
  const tunedModelConfigId = await createRerankModelConfig({
    model: tunedModelId,
    name: `${task.name} - 微调后`,
    modelAddress: tunedModelRequestUrl,
    isActive: true,   // 微调后的模型默认激活
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
 * 阶段4: 效果评测
 * 拆分为 4 个子步骤，支持细粒度断点续传
 */

/**
 * 子步骤1: 生成基础模型评测数据集
 */
async function runGenerateBaseEvalDataset(task: any): Promise<string> {
  addLog.info('Run generate base eval dataset', { taskId: String(task._id) });

  // TODO: 实现通过调用应用知识库搜索节点生成评测数据集的逻辑
  //
  // 实现思路：
  // 1. 获取应用的工作流配置，找到知识库搜索节点
  // 2. 从训练数据中随机抽样 100-200 条 query 作为评测查询集
  // 3. 使用基础模型（baseModelConfigId）运行知识库搜索节点
  //    - 对每个查询，记录返回的文档排序结果
  //    - 保存为基础模型评测数据集

  // 临时实现：使用 DiTing 服务生成
  const response = await callDiTingGenerateEvalDataset({
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
async function runGenerateTunedEvalDataset(task: any): Promise<string> {
  addLog.info('Run generate tuned eval dataset', { taskId: String(task._id) });

  // TODO: 实现通过调用应用知识库搜索节点生成评测数据集的逻辑
  //
  // 实现思路：
  // 1. 使用与基础模型相同的评测查询集
  // 2. 替换知识库搜索节点的 rerank 模型为微调后模型（tunedModelConfigId）
  // 3. 运行知识库搜索节点，记录返回的文档排序结果
  // 4. 保存为微调模型评测数据集

  // 临时实现：使用 DiTing 服务生成
  const response = await callDiTingGenerateEvalDataset({
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
  task: any,
  baseEvalDatasetId: string,
  baseModelConfigId: string
): Promise<Record<string, any>> {
  addLog.info('Run evaluate base model', { taskId: String(task._id) });

  // TODO: 实现真实的评测逻辑
  // 计算评测指标：NDCG, MRR, Precision, Recall 等

  // 临时实现：使用 DiTing 服务评测
  const response = await callDiTingEvaluateRerank({
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
  task: any,
  tunedEvalDatasetId: string,
  tunedModelConfigId: string
): Promise<Record<string, any>> {
  addLog.info('Run evaluate tuned model', { taskId: String(task._id) });

  // TODO: 实现真实的评测逻辑
  // 计算评测指标：NDCG, MRR, Precision, Recall 等

  // 临时实现：使用 DiTing 服务评测
  const response = await callDiTingEvaluateRerank({
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
```

### 6. API 实现

由于篇幅限制，这里只展示关键 API。其他 API（list、detail、retry、cancel、delete）请参考设计文档中的示例实现。

#### 6.1 创建训练任务
```typescript
// projects/app/src/pages/api/core/train/rerank/task/create.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { rerankTrainTaskQueue } from '@fastgpt/service/core/train/rerank/task/mq';
import {
  RerankTrainsetStatusEnum,
  RerankTrainTaskStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  CreateRerankTrainTaskBody,
  CreateRerankTrainTaskResponse
} from '@fastgpt/global/core/train/rerank/api';
import { addAuditLog } from '@fastgpt/service/support/auditLog';
import { AuditEventEnum } from '@fastgpt/global/support/auditLog/constant';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateRerankTrainTaskResponse>
): Promise<CreateRerankTrainTaskResponse> {
  const { appId, name } = req.body as CreateRerankTrainTaskBody;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. 认证应用写权限
  const { app, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  // 2. 检查应用训练集是否存在且就绪
  const trainset = await MongoRerankTrainset.findOne({ appId }).lean();
  if (!trainset) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotExist);
  }
  if (trainset.status !== RerankTrainsetStatusEnum.ready) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotReady);
  }
  if (trainset.dataCount === 0) {
    return Promise.reject(RerankTrainErrEnum.noTrainDataAvailable);
  }

  // 3. 检查是否有进行中的任务
  const runningTask = await MongoRerankTrainTask.findOne({
    appId,
    status: {
      $in: [RerankTrainTaskStatusEnum.pending, RerankTrainTaskStatusEnum.running]
    }
  }).lean();

  if (runningTask) {
    return Promise.reject(RerankTrainErrEnum.taskAlreadyRunning);
  }

  // 4. 创建任务
  const taskId = await createRerankTrainTask({
    appId,
    teamId,
    tmbId,
    name
  });

  // 5. 加入任务队列
  const job = await rerankTrainTaskQueue.add(
    `train-${taskId}`,
    { taskId, teamId, tmbId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );

  // 6. 更新 jobId
  await MongoRerankTrainTask.updateOne({ _id: taskId }, { jobId: job.id as string });

  // 7. 审计日志
  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.CREATE_RERANK_TRAIN_TASK,
    params: { appName: app.name, taskId }
  });

  return {
    taskId,
    status: RerankTrainTaskStatusEnum.pending
  };
}

export default NextAPI(handler);
```

### 7. Worker 注册

```typescript
// packages/service/common/system/mq/worker.ts (修改)

import { rerankTrainTaskQueue } from '../../../core/train/rerank/task/mq';
import { rerankTrainTaskProcessor } from '../../../core/train/rerank/task/processor';

// ... 其他 worker 注册

// 注册训练任务 worker
const rerankTrainTaskWorker = new Worker(
  rerankTrainTaskQueue.name,
  rerankTrainTaskProcessor,
  {
    connection: redisConnection,
    concurrency: 1  // 训练任务并发数设为 1，避免资源竞争
  }
);

rerankTrainTaskWorker.on('completed', (job) => {
  addLog.info('Rerank train task job completed', {
    jobId: job.id
  });
});

rerankTrainTaskWorker.on('failed', (job, err) => {
  addLog.error('Rerank train task job failed', {
    jobId: job?.id,
    error: err.message
  });
});
```

## TODO 清单

- [ ] 创建 `packages/service/core/train/rerank/task/` 目录
- [ ] 实现 RerankTrainTask Schema (`schema.ts`)
- [ ] 实现控制器函数 (`controller.ts`)
- [ ] 实现队列配置 (`mq.ts`)
- [ ] 实现处理器 (`processor.ts`)
  - [ ] 主处理器流程
  - [ ] 阶段判断逻辑
  - [ ] 阶段1: 数据准备
  - [ ] 阶段2: 模型微调（轮询 AICP）
  - [ ] 阶段3: 模型注册
  - [ ] 阶段4: 效果评测
- [ ] 创建 `projects/app/src/pages/api/core/train/rerank/task/` 目录
- [ ] 实现创建训练任务 API (`create.ts`)
- [ ] 实现训练任务列表 API (`list.ts`)
- [ ] 实现训练任务详情 API (`detail.ts`)
- [ ] 实现重试训练任务 API (`retry.ts`)
- [ ] 实现取消训练任务 API (`cancel.ts`)
- [ ] 实现删除训练任务 API (`delete.ts`)
- [ ] 在 Worker 启动文件中注册处理器
- [ ] 编写单元测试
- [ ] 运行 `pnpm lint` 确保代码风格正确
- [ ] Git 提交变更

## 验证标准

- [ ] Schema 定义完整，checkpoint 结构正确
- [ ] Checkpoint 断点续跑逻辑正确
- [ ] 训练流程 4 个阶段顺序执行（preparing → finetuning → registering → evaluating）
- [ ] 轮询 AICP 任务状态不会导致死循环
- [ ] 失败重试从正确的 checkpoint 恢复
- [ ] API 正确检查前置条件（训练集就绪、无进行中任务等）
- [ ] Worker 正确注册并能响应队列任务
- [ ] 单元测试覆盖主要功能
- [ ] Lint 检查通过

## 关键决策记录

1. **阶段命名精确化**：
   - `finetuning`（模型微调）：强调 AICP 执行微调并自动部署到推理服务
   - `registering`（模型注册）：明确这个阶段只是在 FastGPT 中注册配置，不涉及真正的模型部署

2. **Checkpoint 数据按阶段组织**：
   - 每个阶段的 checkpoint 数据独立存储在 `data.preparing`、`data.finetuning`、`data.registering`、`data.evaluating` 下
   - 避免平铺所有字段，提高代码可读性和维护性
   - 便于断点续跑时精确定位当前阶段需要的数据

3. **命名统一为 base/tuned**：
   - 基础模型：`baseModel*`（原 `beforeModel*`）
   - 微调模型：`tunedModel*`（原 `afterModel*`）
   - 更准确地反映两个模型的实际关系

4. **完整的 endpoint 信息**：
   - 基础模型和微调模型都保存完整的 endpoint 信息（ip, port, model, api_key）
   - 基础模型 endpoint 从当前应用配置中获取
   - 微调模型 endpoint 从 AICP 返回值中获取

5. **评测数据集分离**：
   - 基础模型和微调模型各自生成独立的评测数据集
   - 分别存储 `baseModelEvalDatasetId` 和 `tunedModelEvalDatasetId`
   - 便于独立分析每个模型的表现

6. **AICP 自动部署**：Finetuning 阶段调用 AICP API，AICP 自动完成微调和部署到推理服务，返回 endpoint 信息

7. **JSONL 数据格式**：训练数据准备阶段将数据转换为 JSONL 格式（每行一个 JSON 对象）

8. **FastGPT 模型注册**：Registering 阶段只在 FastGPT 模型管理中注册微调后的模型配置，不调用 AICP 部署接口

9. **状态轮询**：Finetuning 阶段每 5 秒轮询一次 AICP 任务状态，最多 120 次（10 分钟超时）

10. **并发控制**：训练任务 worker 并发数设为 1，避免资源竞争

11. **错误分类**：UnrecoverableError 不重试，其他错误重试最多 3 次

12. **前置检查**：创建任务前检查训练集状态、数据量、无进行中任务

13. **评测数据生成**：通过调用应用的知识库搜索节点生成评测数据集（TODO: 待实现具体逻辑）

14. **临时文件管理**：数据准备阶段生成的 JSONL 文件存储在临时目录，需要在任务完成后清理

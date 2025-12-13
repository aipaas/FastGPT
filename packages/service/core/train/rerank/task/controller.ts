import { MongoRerankTrainTask } from './schema';
import { MongoApp } from '../../../app/schema';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import type { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

/**
 * 创建训练任务（仅创建记录，不启动）
 *
 * 关键逻辑：
 * 1. 从 App 工作流中提取当前使用的 rerank 模型配置
 * 2. 解析 baseModelEndpoint 信息
 * 3. baseModelConfigId 和 baseModelEndpoint 存储在任务根级别（与 appId、teamId 平级）
 */
export async function createRerankTrainTask(params: {
  appId: string;
  teamId: string;
  tmbId: string;
  name?: string;
}): Promise<string> {
  const { appId, teamId, tmbId, name } = params;

  // 1. 获取应用并提取 rerank 模型配置
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    throw new Error('Application not found');
  }

  // 2. 从工作流中查找 rerank 模型配置
  // 在 datasetSearchNode 的 inputs 中查找 rerankModel
  let baseModelConfigId: string | undefined;

  const datasetSearchNodes = app.modules?.filter(
    (m) => m.flowNodeType === FlowNodeTypeEnum.datasetSearchNode
  );

  for (const node of datasetSearchNodes || []) {
    const rerankModelInput = node.inputs?.find(
      (input) => input.key === NodeInputKeyEnum.datasetSearchRerankModel
    );

    if (rerankModelInput && rerankModelInput.value) {
      baseModelConfigId = String(rerankModelInput.value);
      break;
    }
  }

  if (!baseModelConfigId) {
    throw new Error('No rerank model found in application workflow');
  }

  // 3. 构造 baseModelEndpoint
  // 注意：在实际实现中，应该从 MongoAIModel 查询真实的模型配置
  // 这里使用简化的 mock 实现
  const baseModelEndpoint = {
    ip: 'localhost',
    port: '8080',
    model: 'bge-reranker-v2-m3',
    api_key: 'mock-api-key'
  };

  addLog.info('Extracted base model config from App workflow', {
    appId,
    baseModelConfigId,
    baseModelEndpoint
  });

  // 4. 创建训练任务记录
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
  const updateData: {
    status: `${RerankTrainTaskStatusEnum}`;
    updateTime: Date;
    finishTime?: Date;
  } = {
    status,
    updateTime: new Date()
  };

  if (
    status === RerankTrainTaskStatusEnum.completed ||
    status === RerankTrainTaskStatusEnum.cancelled
  ) {
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
 * 1. 整体更新（merge=false）：替换整个阶段的数据
 * 2. 部分更新（merge=true）：只更新阶段内的某些字段（用于评估阶段的 4 个子步骤）
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
  data: Record<string, unknown>,
  merge: boolean = false
): Promise<void> {
  if (merge) {
    // 部分更新：使用点表示法更新单个字段
    const updateFields: Record<string, unknown> = { updateTime: new Date() };
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
export async function getRerankTrainTask(
  taskId: string
): Promise<RerankTrainTaskSchemaType | null> {
  return MongoRerankTrainTask.findById(taskId).lean();
}

/**
 * 删除训练任务
 */
export async function deleteRerankTrainTask(taskId: string): Promise<void> {
  await MongoRerankTrainTask.deleteOne({ _id: taskId });

  addLog.info('Deleted rerank train task', { taskId });
}

/**
 * 取消训练任务
 */
export async function cancelRerankTrainTask(taskId: string): Promise<void> {
  const task = await MongoRerankTrainTask.findById(taskId).lean();
  if (!task) {
    throw new Error('Task not found');
  }

  if (
    task.status === RerankTrainTaskStatusEnum.completed ||
    task.status === RerankTrainTaskStatusEnum.failed ||
    task.status === RerankTrainTaskStatusEnum.cancelled
  ) {
    throw new Error('Cannot cancel a task that is already finished');
  }

  await updateTaskStatus(taskId, RerankTrainTaskStatusEnum.cancelled);

  addLog.info('Cancelled rerank train task', { taskId });
}

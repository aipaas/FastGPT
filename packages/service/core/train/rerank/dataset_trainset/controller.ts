import { MongoDatasetTrainset, MongoDatasetTrainsetData } from './schema';
import { MongoDataset } from '../../../dataset/schema';
import type { DatasetTrainsetSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { DatasetTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { getDatasetTrainsetGenerateQueue } from './mq';
import { addLog } from '../../../../common/system/log';

/**
 * 确保知识库训练集存在（懒加载）
 * 内部函数，不对外暴露 API
 *
 * 优化：改为异步模式，避免 API 超时
 * - 如果训练集不存在，创建并触发异步生成
 * - 立即返回训练集对象（状态可能是 generating）
 * - 调用方需要自行检查状态并处理
 */
export async function ensureDatasetTrainset(datasetId: string): Promise<DatasetTrainsetSchemaType> {
  // 1. 检查是否已存在
  let datasetTrainset = await MongoDatasetTrainset.findOne({ datasetId }).lean();

  if (!datasetTrainset) {
    // 2. 不存在则创建
    const dataset = await MongoDataset.findById(datasetId).lean();
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    const [{ _id }] = await MongoDatasetTrainset.create([
      {
        datasetId,
        teamId: dataset.teamId,
        name: `${dataset.name} - 训练集`,
        dataCount: 0,
        status: DatasetTrainsetStatusEnum.idle
      }
    ]);

    datasetTrainset = await MongoDatasetTrainset.findById(_id).lean();
    if (!datasetTrainset) {
      throw new Error('Failed to create dataset trainset');
    }

    addLog.info('Created dataset trainset', {
      datasetId,
      trainsetId: String(_id)
    });
  }

  // 3. 如果状态是 idle 或 error，触发异步生成任务
  if (
    datasetTrainset.status === DatasetTrainsetStatusEnum.idle ||
    datasetTrainset.status === DatasetTrainsetStatusEnum.error
  ) {
    await triggerDatasetTrainsetGeneration(String(datasetTrainset._id));
  }

  // 4. 立即返回（状态可能是 generating）
  return datasetTrainset;
}

/**
 * 触发知识库训练集异步生成
 * 内部函数
 */
async function triggerDatasetTrainsetGeneration(trainsetId: string): Promise<void> {
  // 检查是否已经在生成中
  const trainset = await MongoDatasetTrainset.findById(trainsetId).lean();
  if (!trainset) {
    throw new Error('Trainset not found');
  }

  if (trainset.status === DatasetTrainsetStatusEnum.generating) {
    addLog.info('Dataset trainset already generating', { trainsetId });
    return;
  }

  // 更新状态为 generating
  await MongoDatasetTrainset.updateOne(
    { _id: trainsetId },
    {
      status: DatasetTrainsetStatusEnum.generating,
      errorMsg: undefined,
      updateTime: new Date()
    }
  );

  // 加入队列
  const queue = getDatasetTrainsetGenerateQueue();
  await queue.add(
    `generate-dataset-trainset-${trainsetId}`,
    {
      trainsetId,
      datasetId: String(trainset.datasetId),
      teamId: String(trainset.teamId)
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }
    }
  );

  addLog.info('Triggered dataset trainset generation', { trainsetId });
}

/**
 * 检查知识库训练集是否就绪
 * 供应用训练集生成时调用
 */
export async function checkDatasetTrainsetReady(trainsetId: string): Promise<{
  ready: boolean;
  status: `${DatasetTrainsetStatusEnum}`;
  errorMsg?: string;
}> {
  const trainset = await MongoDatasetTrainset.findById(trainsetId).lean();
  if (!trainset) {
    throw new Error('Trainset not found');
  }

  return {
    ready: trainset.status === DatasetTrainsetStatusEnum.ready,
    status: trainset.status,
    errorMsg: trainset.errorMsg
  };
}

/**
 * 获取知识库训练集数据
 * 供应用训练集拷贝数据时调用
 */
export async function getDatasetTrainsetData(trainsetId: string) {
  return MongoDatasetTrainsetData.find({ trainsetId }).lean();
}

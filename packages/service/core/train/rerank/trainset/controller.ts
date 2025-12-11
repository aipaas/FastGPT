import { MongoRerankTrainset } from './schema';
import { MongoApp } from '../../../app/schema';
import type { RerankTrainsetSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';

/**
 * 创建应用训练集
 */
export async function createRerankTrainset(params: {
  appId: string;
  teamId: string;
  tmbId: string;
  name?: string;
  description?: string;
}): Promise<string> {
  const { appId, teamId, tmbId, name, description } = params;

  // 1. 检查应用是否存在
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    throw new Error('App not found');
  }

  // 2. 检查是否已存在（1:1 关系）
  const existingTrainset = await MongoRerankTrainset.findOne({ appId }).lean();
  if (existingTrainset) {
    throw new Error('Trainset already exists for this app');
  }

  // 3. 创建应用训练集
  const [{ _id }] = await MongoRerankTrainset.create([
    {
      appId,
      teamId,
      tmbId,
      name: name || `${app.name} - 训练集`,
      description,
      sourceSummary: [],
      dataCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      status: RerankTrainsetStatusEnum.idle
    }
  ]);

  addLog.info('Created rerank trainset', {
    appId,
    trainsetId: String(_id)
  });

  return String(_id);
}

/**
 * 获取应用训练集（通过 appId）
 */
export async function getRerankTrainsetByAppId(
  appId: string
): Promise<RerankTrainsetSchemaType | null> {
  return MongoRerankTrainset.findOne({ appId }).lean();
}

/**
 * 获取应用训练集（通过 trainsetId）
 */
export async function getRerankTrainsetById(
  trainsetId: string
): Promise<RerankTrainsetSchemaType | null> {
  return MongoRerankTrainset.findById(trainsetId).lean();
}

/**
 * 删除应用训练集
 * 注意：需要在事务中级联删除训练数据
 */
export async function deleteRerankTrainset(trainsetId: string): Promise<void> {
  await MongoRerankTrainset.deleteOne({ _id: trainsetId });

  addLog.info('Deleted rerank trainset', { trainsetId });
}

/**
 * 更新训练集统计信息
 * 供训练数据 CRUD 操作后调用
 */
export async function updateTrainsetStats(trainsetId: string): Promise<void> {
  // 此函数将在训练数据模块中完整实现
  // 这里先定义接口，避免循环依赖
  addLog.info('Update trainset stats', { trainsetId });
}

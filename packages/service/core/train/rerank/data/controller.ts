import { MongoRerankTrainsetData } from './schema';
import { MongoRerankTrainset } from '../trainset/schema';
import { MongoApp } from '../../../app/schema';
import {
  ensureDatasetTrainset,
  checkDatasetTrainsetReady,
  getDatasetTrainsetData
} from '../dataset_trainset/controller';
import type { RerankTrainsetDataSchemaType } from '@fastgpt/global/core/train/rerank/type';
import {
  TrainDataSourceEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';

/**
 * 手动添加训练数据
 */
export async function createManualTrainData(params: {
  trainsetId: string;
  appId: string;
  teamId: string;
  tmbId: string;
  queries: string[];
  positiveDocs: string[];
  negativeDocs: string[];
  reason?: string;
}): Promise<string> {
  const { trainsetId, appId, teamId, tmbId, queries, positiveDocs, negativeDocs, reason } = params;

  const [{ _id }] = await MongoRerankTrainsetData.create([
    {
      trainsetId,
      appId,
      teamId,
      queries,
      positiveDocs,
      negativeDocs,
      source: TrainDataSourceEnum.manual,
      metadata: {
        sourceInfo: {
          manualInfo: {
            creator: tmbId,
            createdAt: new Date(),
            reason
          }
        }
      }
    }
  ]);

  // 更新训练集统计
  await updateTrainsetStats(trainsetId);

  addLog.info('Created manual train data', {
    trainsetId,
    dataId: String(_id)
  });

  return String(_id);
}

/**
 * 更新训练数据
 */
export async function updateTrainData(params: {
  dataId: string;
  queries?: string[];
  positiveDocs?: string[];
  negativeDocs?: string[];
}): Promise<void> {
  const { dataId, queries, positiveDocs, negativeDocs } = params;

  const updateFields: any = {};
  if (queries) updateFields.queries = queries;
  if (positiveDocs) updateFields.positiveDocs = positiveDocs;
  if (negativeDocs) updateFields.negativeDocs = negativeDocs;

  await MongoRerankTrainsetData.updateOne({ _id: dataId }, updateFields);

  // 获取 trainsetId 并更新统计
  const data = await MongoRerankTrainsetData.findById(dataId).lean();
  if (data) {
    await updateTrainsetStats(String(data.trainsetId));
  }

  addLog.info('Updated train data', { dataId });
}

/**
 * 删除训练数据
 */
export async function deleteTrainData(dataIds: string[]): Promise<number> {
  // 获取第一条数据的 trainsetId
  const firstData = await MongoRerankTrainsetData.findById(dataIds[0]).lean();
  if (!firstData) {
    throw new Error('Train data not found');
  }

  const result = await MongoRerankTrainsetData.deleteMany({
    _id: { $in: dataIds },
    trainsetId: firstData.trainsetId
  });

  // 更新统计
  await updateTrainsetStats(String(firstData.trainsetId));

  addLog.info('Deleted train data', {
    trainsetId: String(firstData.trainsetId),
    deletedCount: result.deletedCount
  });

  return result.deletedCount || 0;
}

/**
 * 计算训练集统计信息
 */
export async function calculateTrainsetStats(trainsetId: string) {
  // 获取所有训练数据
  const trainData = await MongoRerankTrainsetData.find({ trainsetId }).lean();

  // 计算总数
  const dataCount = trainData.length;

  // 计算正负样本数
  let positiveCount = 0;
  let negativeCount = 0;
  trainData.forEach((data) => {
    positiveCount += data.positiveDocs.length;
    negativeCount += data.negativeDocs.length;
  });

  // 按来源统计
  const sourceSummary = new Map<
    string,
    { type: string; datasetId?: string; datasetName?: string; count: number }
  >();

  trainData.forEach((data) => {
    const source = data.source;

    if (source === TrainDataSourceEnum.dataset) {
      const datasetId = data.metadata.sourceInfo.datasetId;
      const datasetName = data.metadata.sourceInfo.datasetName;
      const key = `dataset_${datasetId}`;

      if (!sourceSummary.has(key)) {
        sourceSummary.set(key, {
          type: 'dataset',
          datasetId: String(datasetId),
          datasetName,
          count: 0
        });
      }
      sourceSummary.get(key)!.count++;
    } else if (source === TrainDataSourceEnum.manual) {
      const key = 'manual';
      if (!sourceSummary.has(key)) {
        sourceSummary.set(key, {
          type: 'manual',
          count: 0
        });
      }
      sourceSummary.get(key)!.count++;
    }
  });

  return {
    dataCount,
    positiveCount,
    negativeCount,
    sourceSummary: Array.from(sourceSummary.values())
  };
}

/**
 * 更新训练集统计信息
 */
export async function updateTrainsetStats(trainsetId: string): Promise<void> {
  const stats = await calculateTrainsetStats(trainsetId);

  await MongoRerankTrainset.updateOne(
    { _id: trainsetId },
    {
      dataCount: stats.dataCount,
      positiveCount: stats.positiveCount,
      negativeCount: stats.negativeCount,
      sourceSummary: stats.sourceSummary,
      status: stats.dataCount > 0 ? RerankTrainsetStatusEnum.ready : RerankTrainsetStatusEnum.idle,
      updateTime: new Date()
    }
  );

  addLog.info('Updated trainset stats', {
    trainsetId,
    dataCount: stats.dataCount
  });
}

/**
 * 生成应用训练数据（从知识库拷贝）
 * 核心逻辑：
 * 1. 获取应用关联的知识库
 * 2. 对每个知识库，确保知识库训练集存在（懒加载）
 * 3. 检查知识库训练集状态
 * 4. 如果就绪，从知识库训练集拷贝数据到应用训练集
 */
export async function generateAppTrainsetDataCore(params: {
  appId: string;
  trainsetId: string;
  datasetIds?: string[];
  forceRegenerate?: boolean;
}): Promise<void> {
  const { appId, trainsetId, forceRegenerate } = params;

  // 1. 获取应用
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    throw new Error('App not found');
  }

  // 2. 确定目标知识库
  const targetDatasetIds = params.datasetIds?.length
    ? params.datasetIds
    : app.modules
        .filter((m: any) => m.type === 'dataset')
        .map((m: any) => m.datasetId)
        .filter(Boolean);

  if (!targetDatasetIds.length) {
    throw new Error('No datasets found for this app');
  }

  // 3. 更新应用训练集状态
  await MongoRerankTrainset.updateOne(
    { _id: trainsetId },
    { status: RerankTrainsetStatusEnum.composing }
  );

  try {
    // 4. 如果强制重新生成，先清空旧数据
    if (forceRegenerate) {
      await MongoRerankTrainsetData.deleteMany({
        trainsetId,
        source: TrainDataSourceEnum.dataset
      });
    }

    // 5. 对每个知识库，确保训练集就绪并拷贝数据
    for (const datasetId of targetDatasetIds) {
      // 5.1 确保知识库训练集存在（懒加载，触发异步生成）
      const datasetTrainset = await ensureDatasetTrainset(datasetId);

      // 5.2 检查知识库训练集状态
      const { ready, status, errorMsg } = await checkDatasetTrainsetReady(
        String(datasetTrainset._id)
      );

      if (!ready) {
        // 如果不就绪，抛出错误（由队列重试）
        throw new Error(`Dataset trainset not ready: status=${status}, error=${errorMsg || 'N/A'}`);
      }

      // 5.3 获取知识库训练数据
      const datasetTrainData = await getDatasetTrainsetData(String(datasetTrainset._id));

      if (datasetTrainData.length === 0) {
        addLog.warn('Dataset trainset has no data', {
          datasetId,
          trainsetId: String(datasetTrainset._id)
        });
        continue;
      }

      // 5.4 拷贝数据到应用训练集
      const appTrainData = datasetTrainData.map((data) => ({
        trainsetId,
        appId,
        teamId: data.teamId,

        // 拷贝核心数据
        queries: [...data.queries],
        positiveDocs: [...data.positiveDocs],
        negativeDocs: [...data.negativeDocs],

        source: TrainDataSourceEnum.dataset,

        metadata: {
          sourceInfo: {
            datasetTrainsetDataId: String(data._id), // 溯源
            datasetId: datasetId,
            datasetName: datasetTrainset.name.replace(' - 训练集', ''),
            dataIds: data.metadata.dataIds
          },
          generationConfig: data.metadata.generationConfig
        },

        createTime: new Date()
      }));

      // 批量插入
      await MongoRerankTrainsetData.insertMany(appTrainData);

      addLog.info('Copied dataset train data to app trainset', {
        datasetId,
        trainsetId,
        dataCount: appTrainData.length
      });
    }

    // 6. 更新应用训练集统计
    await updateTrainsetStats(trainsetId);
  } catch (error) {
    // 更新失败状态
    await MongoRerankTrainset.updateOne(
      { _id: trainsetId },
      {
        status: RerankTrainsetStatusEnum.error,
        errorMsg: (error as Error).message,
        updateTime: new Date()
      }
    );
    throw error;
  }
}

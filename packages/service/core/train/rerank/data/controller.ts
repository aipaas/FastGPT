import { MongoRerankTrainsetData } from './schema';
import { MongoRerankTrainset } from '../trainset/schema';
import { MongoApp } from '../../../app/schema';
import {
  ensureDatasetTrainset,
  checkDatasetTrainsetReady,
  getDatasetTrainsetData
} from '../dataset_trainset/controller';
import { extractDatasetIdsFromApp } from '../utils';
import type { RerankTrainsetDataSchemaType } from '@fastgpt/global/core/train/rerank/type';
import {
  TrainDataSourceEnum,
  RerankTrainsetStatusEnum,
  DatasetTrainsetStatusEnum
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

  const updateFields: {
    queries?: string[];
    positiveDocs?: string[];
    negativeDocs?: string[];
  } = {};
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
 * 重构版本：使用批量轮询策略
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
    : extractDatasetIdsFromApp(app);

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

    // 5. 第一阶段：触发所有必要的生成任务
    const datasetTrainsets: Array<{
      datasetId: string;
      trainsetId: string;
      name: string;
      status: string;
    }> = [];

    for (const datasetId of targetDatasetIds) {
      // 5.1 确保知识库训练集存在（懒加载，可能触发异步生成）
      const datasetTrainset = await ensureDatasetTrainset(datasetId);

      datasetTrainsets.push({
        datasetId,
        trainsetId: String(datasetTrainset._id),
        name: datasetTrainset.name,
        status: datasetTrainset.status
      });
    }

    // 6. 第二阶段：统一轮询所有数据集的状态，直到全部生成完成
    const maxWaitTime = 10 * 60 * 1000; // 最多等待10分钟
    const pollInterval = 5000; // 每5秒检查一次
    const startTime = Date.now();

    addLog.info('Starting to poll dataset trainset generation status', {
      datasetCount: datasetTrainsets.length,
      trainsetId
    });

    while (Date.now() - startTime < maxWaitTime) {
      let allReady = true;
      let hasError = false;
      let errorMsg = '';

      // 检查所有数据集的状态
      for (const trainset of datasetTrainsets) {
        const statusCheck = await checkDatasetTrainsetReady(trainset.trainsetId);

        if (statusCheck.status === DatasetTrainsetStatusEnum.error) {
          allReady = false;
          hasError = true;
          errorMsg = `Dataset ${trainset.datasetId} trainset generation failed: ${statusCheck.errorMsg || 'Unknown error'}`;
          break;
        }

        if (!statusCheck.ready) {
          allReady = false;
          // 如果还在生成中，继续等待
          addLog.debug('Dataset trainset still generating', {
            datasetId: trainset.datasetId,
            status: statusCheck.status
          });
        }
      }

      if (allReady) {
        // 所有数据集都准备就绪
        addLog.info('All dataset trainsets are ready', {
          trainsetId,
          elapsedTime: (Date.now() - startTime) / 1000
        });
        break;
      }

      if (hasError) {
        throw new Error(errorMsg);
      }

      // 等待下一次轮询
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // 检查超时
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime >= maxWaitTime) {
      addLog.warn('Dataset trainset generation timeout', {
        trainsetId,
        waitTime: maxWaitTime / 1000
      });
      // 不抛出错误，继续处理已就绪的数据集
    }

    // 7. 第三阶段：拷贝所有已就绪的数据集数据
    for (const trainset of datasetTrainsets) {
      const finalStatusCheck = await checkDatasetTrainsetReady(trainset.trainsetId);

      if (!finalStatusCheck.ready || finalStatusCheck.status === DatasetTrainsetStatusEnum.error) {
        addLog.warn('Skipping dataset trainset due to error or timeout', {
          datasetId: trainset.datasetId,
          status: finalStatusCheck.status,
          errorMsg: finalStatusCheck.errorMsg
        });
        continue;
      }

      // 获取训练数据
      const datasetTrainData = await getDatasetTrainsetData(trainset.trainsetId);

      if (datasetTrainData.length === 0) {
        addLog.warn('Dataset trainset has no data', {
          datasetId: trainset.datasetId,
          trainsetId: trainset.trainsetId
        });
        continue;
      }

      // 拷贝数据到应用训练集
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
            datasetId: trainset.datasetId,
            datasetName: trainset.name.replace(' - 训练集', ''),
            dataIds: data.metadata.dataIds
          },
          generationConfig: data.metadata.generationConfig
        },

        createTime: new Date()
      }));

      // 批量插入（添加去重检查）
      if (forceRegenerate) {
        // 强制重新生成时，直接插入（因为前面已经清理了旧数据）
        await MongoRerankTrainsetData.insertMany(appTrainData);
      } else {
        // 非强制重新生成时，检查并跳过已存在的数据
        const existingSourceIds = await MongoRerankTrainsetData.find({
          trainsetId,
          'metadata.sourceInfo.datasetTrainsetDataId': {
            $in: appTrainData.map((d) => d.metadata.sourceInfo.datasetTrainsetDataId)
          }
        }).distinct('metadata.sourceInfo.datasetTrainsetDataId');

        const newData = appTrainData.filter(
          (d) => !existingSourceIds.includes(d.metadata.sourceInfo.datasetTrainsetDataId)
        );

        if (newData.length > 0) {
          await MongoRerankTrainsetData.insertMany(newData);
          addLog.info('Inserted new train data (skipping duplicates)', {
            datasetId: trainset.datasetId,
            trainsetId,
            totalCount: appTrainData.length,
            newCount: newData.length,
            skippedCount: appTrainData.length - newData.length
          });
        } else {
          addLog.info('All train data already exists, skipping insertion', {
            datasetId: trainset.datasetId,
            trainsetId
          });
        }
      }

      addLog.info('Copied dataset train data to app trainset', {
        datasetId: trainset.datasetId,
        trainsetId,
        dataCount: appTrainData.length
      });
    }

    // 8. 更新应用训练集统计
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

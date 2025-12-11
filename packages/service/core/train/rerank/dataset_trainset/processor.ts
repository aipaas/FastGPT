import type { Processor } from 'bullmq';
import type { DatasetTrainsetGenerateJobData } from './mq';
import { MongoDatasetTrainset, MongoDatasetTrainsetData } from './schema';
import { MongoDatasetCollection } from '../../../dataset/collection/schema';
import { DatasetTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { syntheticRerankTrainData } from '../external';
import { addLog } from '../../../../common/system/log';
import { UnrecoverableError } from 'bullmq';

/**
 * 知识库训练集生成处理器
 */
export const datasetTrainsetGenerateProcessor: Processor<DatasetTrainsetGenerateJobData> = async (
  job
) => {
  const { trainsetId, datasetId } = job.data;

  addLog.info('Start dataset trainset generation', { trainsetId, datasetId });

  const trainset = await MongoDatasetTrainset.findById(trainsetId);
  if (!trainset) {
    throw new UnrecoverableError('Trainset not found');
  }

  try {
    // 1. 从知识库采样分片
    const sampleSize = 1000; // 默认采样大小
    const samples = await sampleDataFromDataset(datasetId, { sampleSize });

    if (samples.length === 0) {
      throw new Error('No data available in dataset');
    }

    addLog.info('Sampled data from dataset', {
      trainsetId,
      sampleCount: samples.length
    });

    // 2. 调用 DiTing 生成训练数据
    const ditingResponse = await syntheticRerankTrainData({
      samples: samples.map((s) => ({
        dataId: String(s._id),
        content: s.content
      })),
      config: {
        queryCount: 1,
        negativeCount: 10,
        model: 'diting-synthetic-v1',
        temperature: 0.7
      }
    });

    if (!ditingResponse.success || !ditingResponse.data) {
      throw new Error(ditingResponse.error || 'DiTing service failed');
    }

    addLog.info('Generated train data from DiTing', {
      trainsetId,
      dataCount: ditingResponse.data.length
    });

    // 3. 批量插入训练数据
    const insertData = ditingResponse.data.map((item) => ({
      trainsetId,
      datasetId,
      teamId: trainset.teamId,
      queries: item.queries,
      positiveDocs: item.positiveDocs,
      negativeDocs: item.negativeDocs,
      metadata: {
        dataIds: item.sourceDataIds,
        generationConfig: item.generationConfig,
        generatedAt: new Date()
      }
    }));

    await MongoDatasetTrainsetData.insertMany(insertData);

    // 4. 更新训练集状态
    await MongoDatasetTrainset.updateOne(
      { _id: trainsetId },
      {
        status: DatasetTrainsetStatusEnum.ready,
        dataCount: ditingResponse.data.length,
        generationConfig: {
          sampleSize,
          queryCount: 1,
          negativeCount: 10,
          model: 'diting-synthetic-v1'
        },
        errorMsg: undefined,
        updateTime: new Date()
      }
    );

    addLog.info('Dataset trainset generation completed', {
      trainsetId,
      dataCount: ditingResponse.data.length
    });
  } catch (error) {
    addLog.error('Dataset trainset generation failed', error);

    // 更新状态为 error
    await MongoDatasetTrainset.updateOne(
      { _id: trainsetId },
      {
        status: DatasetTrainsetStatusEnum.error,
        errorMsg: (error as Error).message,
        updateTime: new Date()
      }
    );

    throw error;
  }
};

/**
 * 从知识库采样数据分片
 * 内部函数
 */
async function sampleDataFromDataset(
  datasetId: string,
  options: { sampleSize: number }
): Promise<Array<{ _id: string; content: string }>> {
  // 使用聚合查询随机采样
  const samples = await MongoDatasetCollection.aggregate([
    {
      $match: {
        datasetId: datasetId,
        // 只采样有内容的分片
        'rawLink.rawText': { $exists: true, $ne: '' }
      }
    },
    { $sample: { size: options.sampleSize } },
    {
      $project: {
        _id: 1,
        content: '$rawLink.rawText'
      }
    }
  ]);

  return samples;
}

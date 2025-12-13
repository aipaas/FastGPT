import type { Processor } from 'bullmq';
import type { RerankTrainDataGenerateJobData } from './mq';
import { generateAppTrainsetDataCore } from './controller';
import { addLog } from '../../../../common/system/log';

/**
 * 应用训练数据生成处理器
 */
export const rerankTrainDataGenerateProcessor: Processor<RerankTrainDataGenerateJobData> = async (
  job
) => {
  const { appId, trainsetId, datasetIds, forceRegenerate } = job.data;

  addLog.info('Start rerank train data generation', {
    appId,
    trainsetId,
    datasetCount: datasetIds.length
  });

  try {
    await generateAppTrainsetDataCore({
      appId,
      trainsetId,
      datasetIds,
      forceRegenerate
    });

    addLog.info('Rerank train data generation completed', {
      trainsetId
    });
  } catch (error) {
    addLog.error('Rerank train data generation failed', error);
    throw error;
  }
};

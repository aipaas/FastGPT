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

  // 添加参数验证和防御性检查
  if (!appId || !trainsetId) {
    const error = new Error('Missing required parameters: appId or trainsetId');
    addLog.error('Rerank train data generation failed - missing parameters', {
      appId,
      trainsetId,
      datasetIds
    });
    throw error;
  }

  const datasetCount = Array.isArray(datasetIds) ? datasetIds.length : 0;

  addLog.info('Start rerank train data generation', {
    appId,
    trainsetId,
    datasetCount,
    hasDatasetIds: !!datasetIds,
    forceRegenerate
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
    addLog.error('Rerank train data generation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      appId,
      trainsetId,
      datasetIds,
      forceRegenerate
    });
    throw error;
  }
};

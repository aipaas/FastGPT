import { getQueue, QueueNames } from '../../../../common/bullmq';

export type RerankTrainDataGenerateJobData = {
  appId: string;
  trainsetId: string;
  datasetIds: string[];
  teamId: string;
  tmbId: string;
  forceRegenerate: boolean;
};

export const rerankTrainDataGenerateQueue = getQueue<RerankTrainDataGenerateJobData>(
  QueueNames.rerankTrainDataGenerate,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }
    }
  }
);

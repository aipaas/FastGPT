import { getQueue, QueueNames } from '../../../../common/bullmq';

export type DatasetTrainsetGenerateJobData = {
  trainsetId: string;
  datasetId: string;
  teamId: string;
};

export function getDatasetTrainsetGenerateQueue() {
  return getQueue<DatasetTrainsetGenerateJobData>(QueueNames.datasetTrainsetGenerate, {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }
    }
  });
}

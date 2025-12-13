import { getQueue, QueueNames } from '../../../../common/bullmq';

export type RerankTrainTaskJobData = {
  taskId: string;
  teamId: string;
  tmbId: string;
  isRetry?: boolean;
};

export const rerankTrainTaskQueue = getQueue<RerankTrainTaskJobData>(QueueNames.rerankTrainTask, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 7 * 24 * 60 * 60 },
    removeOnFail: false // 失败任务保留，便于排查
  }
});

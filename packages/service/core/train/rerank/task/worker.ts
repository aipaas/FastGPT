import { getWorker, QueueNames } from '../../../../common/bullmq';
import { addLog } from '../../../../common/system/log';
import { type RerankTrainTaskJobData } from './mq';
import { rerankTrainTaskProcessor } from './processor';

export function initRerankTrainTaskWorker() {
  const worker = getWorker<RerankTrainTaskJobData>(
    QueueNames.rerankTrainTask,
    rerankTrainTaskProcessor,
    {
      stalledInterval: 30000,
      maxStalledCount: 3,
      concurrency: 1 // 训练任务并发数设为 1，避免资源竞争
    }
  );

  worker.on('active', (job) => {
    if (job?.data) {
      const { taskId } = job.data;
      addLog.info('[RerankTrainTask] Task started', {
        jobId: job.id,
        taskId
      });
    }
  });

  worker.on('completed', (job) => {
    if (job?.data) {
      const { taskId } = job.data;
      addLog.info('[RerankTrainTask] Task completed', {
        jobId: job.id,
        taskId
      });
    }
  });

  worker.on('stalled', async (jobId: string) => {
    addLog.warn('[RerankTrainTask] Task stalled, will be retried', {
      jobId
    });
  });

  worker.on('failed', (job, error) => {
    if (job?.data) {
      const { taskId } = job.data;
      addLog.error('[RerankTrainTask] Task failed', {
        jobId: job.id,
        taskId,
        error: error.message
      });
    }
  });

  addLog.info('[RerankTrainTask] Worker created successfully');
  return worker;
}

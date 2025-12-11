import { getWorker, QueueNames } from '../../../../common/bullmq';
import { addLog } from '../../../../common/system/log';
import { type DatasetTrainsetGenerateJobData } from './mq';
import { datasetTrainsetGenerateProcessor } from './processor';

export function initDatasetTrainsetWorker() {
  const worker = getWorker<DatasetTrainsetGenerateJobData>(
    QueueNames.datasetTrainsetGenerate,
    datasetTrainsetGenerateProcessor,
    {
      stalledInterval: 30000,
      maxStalledCount: 3,
      concurrency: 2
    }
  );

  worker.on('active', (job) => {
    if (job?.data) {
      const { trainsetId, datasetId } = job.data;
      addLog.info('[DatasetTrainset] Generation task started', {
        jobId: job.id,
        trainsetId,
        datasetId
      });
    }
  });

  worker.on('completed', (job) => {
    if (job?.data) {
      const { trainsetId } = job.data;
      addLog.info('[DatasetTrainset] Generation task completed', {
        jobId: job.id,
        trainsetId
      });
    }
  });

  worker.on('stalled', async (jobId: string) => {
    addLog.warn('[DatasetTrainset] Generation task stalled, will be retried', {
      jobId
    });
  });

  worker.on('failed', (job, error) => {
    if (job?.data) {
      const { trainsetId } = job.data;
      addLog.error('[DatasetTrainset] Generation task failed', {
        jobId: job.id,
        trainsetId,
        error: error.message
      });
    }
  });

  addLog.info('[DatasetTrainset] Worker created successfully');
  return worker;
}

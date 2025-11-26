import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/service/common/bullmq';
import { kgisPOST } from '@fastgpt/service/common/api/kgisRequest';

const reduceKGQueue = () => {
  global.kgQueueLen = global.kgQueueLen > 0 ? global.kgQueueLen - 1 : 0;
  return global.kgQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
  collection: {
    kgIndexes?: boolean;
  };
};

type KGTaskData = {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  chunks: string[];
  agentModel: string;
  embeddingModel: string;
  billId?: string;
  dataMetadata?: Record<string, any>;
};

export async function generateKG(): Promise<any> {
  const max = global.systemEnv?.kgMaxProcess || 5;
  addLog.debug(`[KG Queue] Queue size: ${global.kgQueueLen}`);

  if (global.kgQueueLen >= max) return;
  global.kgQueueLen++;

  try {
    while (true) {
      const startTime = Date.now();

      // get training data
      const {
        data,
        done = false,
        error = false
      } = await (async () => {
        try {
          const kgData = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: TrainingModeEnum.kg,
              retryCount: { $gt: 0 },
              lockTime: { $lte: addMinutes(new Date(), -10) }
            },
            {
              lockTime: new Date(),
              $inc: { retryCount: -1 }
            }
          )
            .populate<PopulateType>([
              {
                path: 'dataset',
                select: 'agentModel vectorModel vlmModel'
              },
              {
                path: 'collection',
                select: 'kgIndexes'
              }
            ])
            .lean();

          // task preemption
          if (!kgData) {
            return {
              done: true
            };
          }
          return {
            data: kgData
          };
        } catch (error) {
          return {
            error: true
          };
        }
      })();

      if (done || !data) {
        break;
      }
      if (error) {
        addLog.error(`[KG Queue] Error`, error);
        await delay(500);
        continue;
      }

      if (!data.dataset || !data.collection) {
        addLog.info(`[KG Queue] Dataset or collection not found`, data);
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      if (!(await checkTeamAiPointsAndLock(data.teamId))) {
        continue;
      }

      addLog.info(`[KG Queue] Start processing KG task for collection ${data.collectionId}`);

      try {
        const kgTaskData: KGTaskData = {
          teamId: data.teamId,
          tmbId: data.tmbId,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          chunks: data.chunks || [],
          agentModel: data.dataset.agentModel,
          embeddingModel: data.dataset.vectorModel,
          billId: data.billId,
          dataMetadata: data.dataMetadata
        };

        if (!kgTaskData.chunks || kgTaskData.chunks.length === 0) {
          addLog.warn(`[KG Queue] No valid chunks data for KG task`, data);
          await MongoDatasetTraining.deleteOne({ _id: data._id });
          continue;
        }

        const validChunks = kgTaskData.chunks.filter((chunk) => chunk && chunk.trim().length > 0);
        if (validChunks.length === 0) {
          addLog.warn(`[KG Queue] No valid (non-empty) chunks for KG task`, data);
          await MongoDatasetTraining.deleteOne({ _id: data._id });
          continue;
        }

        await callKGISService({
          ...kgTaskData,
          chunks: validChunks
        });

        await MongoDatasetTraining.findByIdAndDelete(data._id);

        addLog.info(`[KG Queue] Finish KG task`, {
          time: Date.now() - startTime,
          chunkCount: validChunks.length,
          totalLength: validChunks.reduce((sum, text) => sum + text.length, 0)
        });
      } catch (err: any) {
        addLog.error(`[KG Queue] Error processing KG task`, err);
        await MongoDatasetTraining.updateOne(
          {
            _id: data._id
          },
          {
            errorMsg: getErrText(err, 'KG task failed')
          }
        );

        await delay(100);
      }
    }
  } catch (error) {
    addLog.error(`[KG Queue] Error`, error);
  }

  if (reduceKGQueue()) {
    addLog.info(`[KG Queue] Done`);
  }
  addLog.debug(`[KG Queue] break loop, current queue size: ${global.kgQueueLen}`);
}

async function callKGISService(taskData: KGTaskData): Promise<void> {
  addLog.info(`[KG Queue] Starting KGIS Service call`, {
    workspace_id: taskData.datasetId,
    llm_model: taskData.agentModel,
    embedding_model: taskData.embeddingModel,
    chunks_count: taskData.chunks.length,
    collection_id: taskData.collectionId
  });

  try {
    const getFilePathIdentifier = () => {
      if (taskData.dataMetadata?.sourceReadType?.sourceId) {
        return taskData.dataMetadata.sourceReadType.sourceId;
      }
      // Fallback to collectionId if sourceId is not available
      return taskData.collectionId;
    };

    const fileIdentifier = getFilePathIdentifier();

    const requestData = {
      workspace_id: taskData.datasetId,
      llm_model: taskData.agentModel,
      embedding_model: taskData.embeddingModel,
      timeout: 3600, // 超时时间（秒）
      input: taskData.chunks,
      split_by_character_only: false,
      split_by_character: null,
      ids: null,
      track_id: taskData.collectionId,
      file_paths: taskData.chunks.map(() => String(fileIdentifier))
    };

    addLog.debug(
      `[KG Queue] Using file identifier: ${fileIdentifier}, source: ${fileIdentifier === taskData.collectionId ? 'collectionId fallback' : 'sourceId from metadata'}`
    );

    addLog.debug(`[KG Queue] KGIS request data`, {
      ...requestData,
      chunks_preview: taskData.chunks.slice(0, 2).map((chunk, index) => ({
        index,
        length: chunk.length,
        preview: chunk.substring(0, 100) + (chunk.length > 100 ? '...' : '')
      }))
    });

    const response = await kgisPOST('/api/lightrag/documents/insert', requestData);

    addLog.info(`[KG Queue] KGIS Service call completed successfully`, {
      response: response,
      workspace_id: taskData.datasetId,
      chunks_processed: taskData.chunks.length
    });
  } catch (error) {
    addLog.error(`[KG Queue] KGIS Service call failed`, {
      error: error,
      workspace_id: taskData.datasetId,
      chunks_count: taskData.chunks.length,
      error_message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { CreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { MongoDatasetCollection } from './schema';
import type {
  DatasetCollectionSchemaType,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '../training/schema';
import { MongoDatasetData } from '../data/schema';
import { delImgByRelatedId } from '../../../common/file/image/controller';
import { deleteDatasetDataVector } from '../../../common/vectorDB/controller';
import { delFileByFileIdList } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import type { ClientSession } from '../../../common/mongo';
import { createOrGetCollectionTags } from './utils';
import { rawText2Chunks } from '../read';
import { checkDatasetIndexLimit } from '../../../support/permission/teamLimit';
import { predictDataLimitLength } from '../../../../global/core/dataset/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { createTrainingUsage } from '../../../support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getEmbeddingModel, getVlmModel, getRerankModel } from '../../ai/model';
import { pushDataListToTrainingQueue, pushDatasetToParseQueue } from '../training/controller';
import { MongoImage } from '../../../common/file/image/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { addDays } from 'date-fns';
import { MongoDataset } from '../schema';
import { kgisDELETE } from '../../../common/api/kgisRequest';
import { addLog } from '../../../common/system/log';
import { MongoDatasetDataText } from '../data/dataTextSchema';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getTrainingModeByCollection } from './utils';
import {
  computedCollectionChunkSettings,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { clearCollectionImages, removeDatasetImageExpiredTime } from '../image/utils';
import {
  DBDatasetVectorTableName,
  DBDatasetValueVectorTableName,
  DatasetVectorTableName
} from '../../../common/vectorDB/constants';
export const createCollectionAndInsertData = async ({
  dataset,
  rawText,
  imageIds,
  createCollectionParams,
  backupParse = false,
  billId,
  session
}: {
  dataset: DatasetSchemaType;
  rawText?: string;
  imageIds?: string[];
  createCollectionParams: CreateOneCollectionParams;

  backupParse?: boolean;

  billId?: string;
  session?: ClientSession;
}) => {
  // Adapter 4.9.0
  if (createCollectionParams.trainingType === DatasetCollectionDataProcessModeEnum.auto) {
    createCollectionParams.trainingType = DatasetCollectionDataProcessModeEnum.chunk;
    createCollectionParams.autoIndexes = true;
  }

  const formatCreateCollectionParams = computedCollectionChunkSettings({
    ...createCollectionParams,
    llmModel: getLLMModel(dataset.agentModel),
    vectorModel: getEmbeddingModel(dataset.vectorModel)
  });

  const teamId = formatCreateCollectionParams.teamId;
  const tmbId = formatCreateCollectionParams.tmbId;

  // Set default params
  const trainingType =
    formatCreateCollectionParams.trainingType || DatasetCollectionDataProcessModeEnum.chunk;
  const trainingMode = getTrainingModeByCollection({
    trainingType: trainingType,
    autoIndexes: formatCreateCollectionParams.autoIndexes,
    imageIndex: formatCreateCollectionParams.imageIndex,
    small2bigIndexes: formatCreateCollectionParams.small2bigIndexes
  });

  if (
    trainingType === DatasetCollectionDataProcessModeEnum.qa ||
    trainingType === DatasetCollectionDataProcessModeEnum.backup ||
    trainingType === DatasetCollectionDataProcessModeEnum.template
  ) {
    delete formatCreateCollectionParams.chunkTriggerType;
    delete formatCreateCollectionParams.chunkTriggerMinSize;
    delete formatCreateCollectionParams.dataEnhanceCollectionName;
    delete formatCreateCollectionParams.imageIndex;
  }

  if (
    trainingType === DatasetCollectionDataProcessModeEnum.qa ||
    trainingType === DatasetCollectionDataProcessModeEnum.backup
  ) {
    delete formatCreateCollectionParams.autoIndexes;
    delete formatCreateCollectionParams.hypeIndexes;
    delete formatCreateCollectionParams.hypeIndexPrompt;
  }

  if (
    trainingType === DatasetCollectionDataProcessModeEnum.backup ||
    trainingType === DatasetCollectionDataProcessModeEnum.template
  ) {
    delete formatCreateCollectionParams.paragraphChunkAIMode;
    delete formatCreateCollectionParams.paragraphChunkDeep;
    delete formatCreateCollectionParams.paragraphChunkMinSize;
    delete formatCreateCollectionParams.chunkSplitMode;
    delete formatCreateCollectionParams.chunkSize;
    delete formatCreateCollectionParams.chunkSplitter;
  }

  if (trainingType === DatasetCollectionDataProcessModeEnum.backup) {
    delete formatCreateCollectionParams.indexSize;
  }
  if (trainingType !== DatasetCollectionDataProcessModeEnum.qa) {
    delete formatCreateCollectionParams.qaPrompt;
  }

  // 1. split chunks or create image chunks
  const {
    chunks,
    chunkSize,
    indexSize
  }: {
    chunks: Array<{
      q?: string;
      a?: string; // answer or custom content
      imageId?: string;
      indexes?: string[];
      metadata?: Record<string, any>;
    }>;
    chunkSize?: number;
    indexSize?: number;
  } = await (async () => {
    if (rawText) {
      // Process text chunks
      const chunks = await rawText2Chunks({
        rawText,
        chunkTriggerType: formatCreateCollectionParams.chunkTriggerType,
        chunkTriggerMinSize: formatCreateCollectionParams.chunkTriggerMinSize,
        chunkSize: formatCreateCollectionParams.chunkSize,
        paragraphChunkDeep: formatCreateCollectionParams.paragraphChunkDeep,
        paragraphChunkMinSize: formatCreateCollectionParams.paragraphChunkMinSize,
        maxSize: getLLMMaxChunkSize(getLLMModel(dataset.agentModel)),
        overlapRatio: trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
        customReg: formatCreateCollectionParams.chunkSplitter
          ? [formatCreateCollectionParams.chunkSplitter]
          : [],
        backupParse
      });
      return {
        chunks,
        chunkSize: formatCreateCollectionParams.chunkSize,
        indexSize: formatCreateCollectionParams.indexSize
      };
    }

    if (imageIds) {
      // Process image chunks
      const chunks = imageIds.map((imageId: string) => ({
        imageId,
        indexes: []
      }));
      return { chunks };
    }

    return {
      chunks: [],
      chunkSize: formatCreateCollectionParams.chunkSize,
      indexSize: formatCreateCollectionParams.indexSize
    };
  })();

  // 2. auth limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: predictDataLimitLength(trainingMode, chunks)
  });

  const fn = async (session: ClientSession) => {
    // 3. Create collection
    const { _id: collectionId } = await createOneCollection({
      ...formatCreateCollectionParams,
      trainingType,
      chunkSize,
      indexSize,

      hashRawText: rawText ? hashStr(rawText) : undefined,
      rawTextLength: rawText?.length,
      session
    });

    // 4. create training bill
    const traingBillId = await (async () => {
      if (billId) return billId;
      const { billId: newBillId } = await createTrainingUsage({
        teamId,
        tmbId,
        appName: formatCreateCollectionParams.name,
        billSource: UsageSourceEnum.training,
        vectorModel: getEmbeddingModel(dataset.vectorModel)?.name,
        agentModel: getLLMModel(dataset.agentModel)?.name,
        vllmModel: getVlmModel(dataset.vlmModel)?.name,
        rerankModel: getRerankModel()?.name,
        session
      });
      return newBillId;
    })();

    // 5. insert to training queue
    const insertResults = await (async () => {
      if (rawText || imageIds) {
        return pushDataListToTrainingQueue({
          teamId,
          tmbId,
          datasetId: dataset._id,
          collectionId,
          agentModel: dataset.agentModel,
          vectorModel: dataset.vectorModel,
          vlmModel: dataset.vlmModel,
          indexSize,
          mode: trainingMode,
          billId: traingBillId,
          data: chunks.map((item, index) => ({
            ...item,
            indexes: item.indexes?.map((text) => ({
              type: DatasetDataIndexTypeEnum.custom,
              text
            })),
            chunkIndex: index
          })),
          session
        });
      } else {
        await pushDatasetToParseQueue({
          teamId,
          tmbId,
          datasetId: dataset._id,
          collectionId,
          billId: traingBillId,
          session
        });
        return {
          insertLen: 0
        };
      }
    })();

    // 6. Remove images ttl index
    await removeDatasetImageExpiredTime({
      ids: imageIds,
      collectionId,
      session
    });

    return {
      collectionId: String(collectionId),
      insertResults
    };
  };

  if (session) {
    return fn(session);
  }
  return mongoSessionRun(fn);
};

export type CreateOneCollectionParams = CreateDatasetCollectionParams & {
  teamId: string;
  tmbId: string;
  session?: ClientSession;
};
export async function createOneCollection({ session, ...props }: CreateOneCollectionParams) {
  const {
    teamId,
    parentId,
    datasetId,
    tags,

    fileId,
    rawLink,
    externalFileId,
    externalFileUrl,
    apiFileId,
    apiFileParentId,
    tableSchema,
    forbid
  } = props;

  const collectionTags = await createOrGetCollectionTags({
    tags,
    teamId,
    datasetId,
    session
  });

  // Create collection
  const [collection] = await MongoDatasetCollection.create(
    [
      {
        ...props,
        _id: undefined,

        parentId: parentId || null,

        tags: collectionTags,

        ...(fileId ? { fileId } : {}),
        ...(rawLink ? { rawLink } : {}),
        ...(externalFileId ? { externalFileId } : {}),
        ...(externalFileUrl ? { externalFileUrl } : {}),
        ...(apiFileId ? { apiFileId } : {}),
        ...(apiFileParentId ? { apiFileParentId } : {}),
        ...(tableSchema ? { tableSchema } : {}),
        forbid: forbid ?? false
      }
    ],
    { session, ordered: true }
  );

  return collection;
}

/* delete collection related images/files */
export const delCollectionRelatedSource = async ({
  collections,
  session
}: {
  collections: {
    teamId: string;
    fileId?: string;
    metadata?: {
      relatedImgId?: string;
    };
  }[];
  session?: ClientSession;
}) => {
  if (collections.length === 0) return;

  const teamId = collections[0].teamId;

  if (!teamId) return Promise.reject('teamId is not exist');

  const fileIdList = collections.map((item) => item?.fileId || '').filter(Boolean);
  const relatedImageIds = collections
    .map((item) => item?.metadata?.relatedImgId || '')
    .filter(Boolean);

  // Delete files and images in parallel
  await Promise.all([
    // Delete files
    delFileByFileIdList({
      bucketName: BucketNameEnum.dataset,
      fileIdList
    }),
    // Delete images
    delImgByRelatedId({
      teamId,
      relateIds: relatedImageIds,
      session
    })
  ]);
};

/**
 * Delete knowledge graph data for collections with kgIndexes enabled
 *
 * Note: This function initiates KG deletion operations asynchronously and returns immediately.
 * The actual deletion happens in the background to avoid blocking the main deletion flow.
 * Check application logs for completion status and any errors.
 */
export async function deleteKnowledgeGraph({
  collections,
  datasetIds,
  teamId
}: {
  collections: DatasetCollectionSchemaType[];
  datasetIds: string[];
  teamId: string;
}) {
  const kgCollections = collections.filter((collection) => collection.kgIndexes === true);
  if (kgCollections.length === 0) {
    addLog.info(
      `[deleteKnowledgeGraph] No collections with kgIndexes enabled, skipping KG deletion`
    );
    return;
  }

  // Get dataset models information for KGIS API calls
  const datasets = await MongoDataset.find({
    _id: { $in: datasetIds },
    teamId
  })
    .select('agentModel vectorModel')
    .lean();

  const datasetModelMap = new Map<string, { agentModel: string; vectorModel: string }>();
  datasets.forEach((dataset) => {
    datasetModelMap.set(String(dataset._id), {
      agentModel: dataset.agentModel,
      vectorModel: dataset.vectorModel
    });
  });

  // Process deletions in parallel with max concurrency of 3
  const batchSize = 3;
  const results: Array<{ success: boolean; collectionId: string; error?: string }> = [];

  for (let i = 0; i < kgCollections.length; i += batchSize) {
    const batch = kgCollections.slice(i, i + batchSize);

    const batchPromises = batch.map(async (collection) => {
      const datasetId = String(collection.datasetId);
      const collectionId = String(collection._id);

      try {
        const models = datasetModelMap.get(datasetId);
        if (!models) {
          const error = `Dataset models not found for datasetId: ${datasetId}`;
          addLog.error(`[deleteKnowledgeGraph] ${error}`, { datasetId, collectionId });
          return { success: false, collectionId, error };
        }

        const requestData = {
          workspace_id: datasetId,
          doc_id: collectionId,
          llm_model: models.agentModel,
          embedding_model: models.vectorModel,
          timeout: 3600, // 1 hour timeout
          delete_llm_cache: false
        };

        // 异步调用 KG 删除，不等待删除耗时操作结果
        // 使用 fire-and-forget 模式，通过日志记录执行状态
        kgisDELETE('/api/lightrag/documents/delete', requestData)
          .then(() => {
            addLog.info(`[deleteKnowledgeGraph] Successfully deleted KG for collection`, {
              datasetId,
              collectionId
            });
          })
          .catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog.error(`[deleteKnowledgeGraph] Failed to delete KG for collection`, {
              datasetId,
              collectionId,
              error: errorMessage
            });
          });

        // 立即返回成功，因为 KG 删除操作已在后台执行
        return { success: true, collectionId };
      } catch (error) {
        // 这个 catch 块现在主要处理数据准备阶段的错误
        // KG 删除 API 的错误已经在上面的异步 catch 中处理
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog.error(`[deleteKnowledgeGraph] Failed to prepare KG deletion for collection`, {
          datasetId,
          collectionId,
          error: errorMessage
        });

        return { success: false, collectionId, error: errorMessage };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Add delay between batches to avoid overwhelming the service
    if (i + batchSize < kgCollections.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  addLog.info(`[deleteKnowledgeGraph] Completed KG deletion initiation`, {
    totalCollections: kgCollections.length,
    successCount,
    failureCount,
    note: 'KG deletion operations are running in background. Check logs for completion status.',
    failures: results
      .filter((r) => !r.success)
      .map((r) => ({ collectionId: r.collectionId, error: r.error }))
  });
}

/**
 * delete collection and it related data
 */
export async function delCollection({
  collections,
  session,
  delImg = true,
  delFile = true
}: {
  collections: DatasetCollectionSchemaType[];
  session: ClientSession;
  delImg: boolean;
  delFile: boolean;
}) {
  if (collections.length === 0) return;

  const teamId = collections[0].teamId;

  if (!teamId) return Promise.reject('teamId is not exist');

  const datasetIds = Array.from(new Set(collections.map((item) => String(item.datasetId))));
  const collectionIds = collections.map((item) => String(item._id));

  await retryFn(async () => {
    await Promise.all([
      // Delete training data
      MongoDatasetTraining.deleteMany({
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIds }
      }),
      // Delete dataset_data_texts
      MongoDatasetDataText.deleteMany({
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIds }
      }),
      // Delete dataset_datas
      MongoDatasetData.deleteMany({
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIds }
      }),
      // Delete dataset_images
      clearCollectionImages(collectionIds),
      // Delete images if needed
      ...(delImg
        ? [
            delImgByRelatedId({
              teamId,
              relateIds: collections
                .map((item) => item?.metadata?.relatedImgId || '')
                .filter(Boolean)
            })
          ]
        : []),
      // Delete files if needed
      ...(delFile
        ? [
            delFileByFileIdList({
              bucketName: BucketNameEnum.dataset,
              fileIdList: collections.map((item) => item?.fileId || '').filter(Boolean)
            })
          ]
        : []),
      // Delete vector data
      deleteDatasetDataVector({
        teamId,
        datasetIds,
        collectionIds,
        tableName: DatasetVectorTableName
      }),
      deleteDatasetDataVector({
        teamId,
        datasetIds,
        collectionIds,
        tableName: DBDatasetVectorTableName
      }),
      deleteDatasetDataVector({
        teamId,
        datasetIds,
        collectionIds,
        tableName: DBDatasetValueVectorTableName
      }),
      deleteKnowledgeGraph({
        collections,
        datasetIds,
        teamId
      })
    ]);

    // delete collections
    await MongoDatasetCollection.deleteMany(
      {
        teamId,
        _id: { $in: collectionIds }
      },
      { session }
    );
  });
}

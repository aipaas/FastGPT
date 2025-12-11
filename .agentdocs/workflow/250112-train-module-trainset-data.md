# Workflow: 训练数据管理

**任务ID**: 250112-train-module-trainset-data
**创建时间**: 2025-01-12
**状态**: 待开始
**依赖**: 250112-train-module-app-trainset-basic
**后续**: 250112-train-module-train-task

## 任务目标

实现应用训练数据的完整管理功能，包括：
1. RerankTrainsetData Schema 定义
2. 训练数据控制器
3. 从知识库生成训练数据（异步任务）
4. 训练数据 CRUD API（列表、手动添加、更新、删除）

## 背景说明

训练数据是训练模块的**核心资产**，来源包括：
- **从知识库拷贝**（主要来源）：拷贝知识库训练集数据到应用训练集
- **手动添加**：用户手动添加训练样本
- ~~从对话日志导入~~（已跳过）

本模块实现数据的生成、管理和统计功能。

## 实施方案

### 1. 目录结构
```
packages/service/core/train/rerank/data/
├── schema.ts                   # RerankTrainsetData Schema
├── controller.ts               # 训练数据控制器
├── mq.ts                       # 数据生成队列配置
└── processor.ts                # 数据生成处理器

projects/app/src/pages/api/core/train/rerank/trainset/data/
├── list.ts                     # 训练数据列表
├── generate.ts                 # 生成训练数据（从知识库拷贝）
├── create.ts                   # 手动添加训练数据
├── update.ts                   # 更新训练数据
└── delete.ts                   # 删除训练数据
```

### 2. Schema 定义

```typescript
// packages/service/core/train/rerank/data/schema.ts

import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
import type { RerankTrainsetDataSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { TrainDataSourceEnum } from '@fastgpt/global/core/train/rerank/constants';

const RerankTrainsetDataSchema = new connectionMongo.Schema({
  trainsetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'rerank_trainset',
    required: true
  },
  appId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'app',
    required: true
  },
  teamId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'team',
    required: true
  },
  queries: {
    type: [String],
    required: true
  },
  positiveDocs: {
    type: [String],
    required: true
  },
  negativeDocs: {
    type: [String],
    required: true
  },
  source: {
    type: String,
    enum: Object.values(TrainDataSourceEnum),
    required: true
  },
  metadata: {
    type: {
      sourceInfo: {
        // 来自知识库（拷贝）
        datasetTrainsetDataId: String,
        datasetId: connectionMongo.Schema.Types.ObjectId,
        datasetName: String,
        dataIds: [String],
        // 手动添加
        manualInfo: {
          creator: String,
          createdAt: Date,
          reason: String
        }
      },
      // 生成配置（如果来自知识库）
      generationConfig: {
        model: String,
        temperature: Number
      }
    },
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

// 索引
RerankTrainsetDataSchema.index({ trainsetId: 1, createTime: -1 });
RerankTrainsetDataSchema.index({ appId: 1, createTime: -1 });
RerankTrainsetDataSchema.index({ teamId: 1 });
RerankTrainsetDataSchema.index({ source: 1 });

try {
  export const MongoRerankTrainsetData: Model<RerankTrainsetDataSchemaType> = getMongoModel(
    'rerank_trainset_data',
    RerankTrainsetDataSchema
  );
} catch (error) {
  console.error(error);
}
```

### 3. 控制器函数

```typescript
// packages/service/core/train/rerank/data/controller.ts

import { MongoRerankTrainsetData } from './schema';
import { MongoRerankTrainset } from '../trainset/schema';
import { MongoApp } from '../../app/schema';
import {
  ensureDatasetTrainset,
  checkDatasetTrainsetReady,
  getDatasetTrainsetData
} from '../dataset_trainset/controller';
import type { RerankTrainsetDataSchemaType } from '@fastgpt/global/core/train/rerank/type';
import {
  TrainDataSourceEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '@fastgpt/service/common/system/log';

/**
 * 手动添加训练数据
 */
export async function createManualTrainData(params: {
  trainsetId: string;
  appId: string;
  teamId: string;
  tmbId: string;
  queries: string[];
  positiveDocs: string[];
  negativeDocs: string[];
  reason?: string;
}): Promise<string> {
  const { trainsetId, appId, teamId, tmbId, queries, positiveDocs, negativeDocs, reason } = params;

  const [{ _id }] = await MongoRerankTrainsetData.create([
    {
      trainsetId,
      appId,
      teamId,
      queries,
      positiveDocs,
      negativeDocs,
      source: TrainDataSourceEnum.manual,
      metadata: {
        sourceInfo: {
          manualInfo: {
            creator: tmbId,
            createdAt: new Date(),
            reason
          }
        }
      }
    }
  ]);

  // 更新训练集统计
  await updateTrainsetStats(trainsetId);

  addLog.info('Created manual train data', {
    trainsetId,
    dataId: String(_id)
  });

  return String(_id);
}

/**
 * 更新训练数据
 */
export async function updateTrainData(params: {
  dataId: string;
  queries?: string[];
  positiveDocs?: string[];
  negativeDocs?: string[];
}): Promise<void> {
  const { dataId, queries, positiveDocs, negativeDocs } = params;

  const updateFields: any = {};
  if (queries) updateFields.queries = queries;
  if (positiveDocs) updateFields.positiveDocs = positiveDocs;
  if (negativeDocs) updateFields.negativeDocs = negativeDocs;

  await MongoRerankTrainsetData.updateOne({ _id: dataId }, updateFields);

  // 获取 trainsetId 并更新统计
  const data = await MongoRerankTrainsetData.findById(dataId).lean();
  if (data) {
    await updateTrainsetStats(String(data.trainsetId));
  }

  addLog.info('Updated train data', { dataId });
}

/**
 * 删除训练数据
 */
export async function deleteTrainData(dataIds: string[]): Promise<number> {
  // 获取第一条数据的 trainsetId
  const firstData = await MongoRerankTrainsetData.findById(dataIds[0]).lean();
  if (!firstData) {
    throw new Error('Train data not found');
  }

  const result = await MongoRerankTrainsetData.deleteMany({
    _id: { $in: dataIds },
    trainsetId: firstData.trainsetId
  });

  // 更新统计
  await updateTrainsetStats(String(firstData.trainsetId));

  addLog.info('Deleted train data', {
    trainsetId: String(firstData.trainsetId),
    deletedCount: result.deletedCount
  });

  return result.deletedCount || 0;
}

/**
 * 计算训练集统计信息
 */
export async function calculateTrainsetStats(trainsetId: string) {
  // 获取所有训练数据
  const trainData = await MongoRerankTrainsetData.find({ trainsetId }).lean();

  // 计算总数
  const dataCount = trainData.length;

  // 计算正负样本数
  let positiveCount = 0;
  let negativeCount = 0;
  trainData.forEach((data) => {
    positiveCount += data.positiveDocs.length;
    negativeCount += data.negativeDocs.length;
  });

  // 按来源统计
  const sourceSummary = new Map<string, { type: string; datasetId?: string; datasetName?: string; count: number }>();

  trainData.forEach((data) => {
    const source = data.source;

    if (source === TrainDataSourceEnum.dataset) {
      const datasetId = data.metadata.sourceInfo.datasetId;
      const datasetName = data.metadata.sourceInfo.datasetName;
      const key = `dataset_${datasetId}`;

      if (!sourceSummary.has(key)) {
        sourceSummary.set(key, {
          type: 'dataset',
          datasetId: String(datasetId),
          datasetName,
          count: 0
        });
      }
      sourceSummary.get(key)!.count++;
    } else if (source === TrainDataSourceEnum.manual) {
      const key = 'manual';
      if (!sourceSummary.has(key)) {
        sourceSummary.set(key, {
          type: 'manual',
          count: 0
        });
      }
      sourceSummary.get(key)!.count++;
    }
  });

  return {
    dataCount,
    positiveCount,
    negativeCount,
    sourceSummary: Array.from(sourceSummary.values())
  };
}

/**
 * 更新训练集统计信息
 */
export async function updateTrainsetStats(trainsetId: string): Promise<void> {
  const stats = await calculateTrainsetStats(trainsetId);

  await MongoRerankTrainset.updateOne(
    { _id: trainsetId },
    {
      dataCount: stats.dataCount,
      positiveCount: stats.positiveCount,
      negativeCount: stats.negativeCount,
      sourceSummary: stats.sourceSummary,
      status: stats.dataCount > 0 ? RerankTrainsetStatusEnum.ready : RerankTrainsetStatusEnum.idle,
      updateTime: new Date()
    }
  );

  addLog.info('Updated trainset stats', {
    trainsetId,
    dataCount: stats.dataCount
  });
}

/**
 * 生成应用训练数据（从知识库拷贝）
 * 核心逻辑：
 * 1. 获取应用关联的知识库
 * 2. 对每个知识库，确保知识库训练集存在（懒加载）
 * 3. 检查知识库训练集状态
 * 4. 如果就绪，从知识库训练集拷贝数据到应用训练集
 */
export async function generateAppTrainsetDataCore(params: {
  appId: string;
  trainsetId: string;
  datasetIds?: string[];
  forceRegenerate?: boolean;
}): Promise<void> {
  const { appId, trainsetId, forceRegenerate } = params;

  // 1. 获取应用
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    throw new Error('App not found');
  }

  // 2. 确定目标知识库
  const targetDatasetIds =
    params.datasetIds?.length
      ? params.datasetIds
      : app.modules
          .filter((m: any) => m.type === 'dataset')
          .map((m: any) => m.datasetId)
          .filter(Boolean);

  if (!targetDatasetIds.length) {
    throw new Error('No datasets found for this app');
  }

  // 3. 更新应用训练集状态
  await MongoRerankTrainset.updateOne(
    { _id: trainsetId },
    { status: RerankTrainsetStatusEnum.composing }
  );

  try {
    // 4. 如果强制重新生成，先清空旧数据
    if (forceRegenerate) {
      await MongoRerankTrainsetData.deleteMany({
        trainsetId,
        source: TrainDataSourceEnum.dataset
      });
    }

    // 5. 对每个知识库，确保训练集就绪并拷贝数据
    for (const datasetId of targetDatasetIds) {
      // 5.1 确保知识库训练集存在（懒加载，触发异步生成）
      const datasetTrainset = await ensureDatasetTrainset(datasetId);

      // 5.2 检查知识库训练集状态
      const { ready, status, errorMsg } = await checkDatasetTrainsetReady(
        String(datasetTrainset._id)
      );

      if (!ready) {
        // 如果不就绪，抛出错误（由队列重试）
        throw new Error(
          `Dataset trainset not ready: status=${status}, error=${errorMsg || 'N/A'}`
        );
      }

      // 5.3 获取知识库训练数据
      const datasetTrainData = await getDatasetTrainsetData(String(datasetTrainset._id));

      if (datasetTrainData.length === 0) {
        addLog.warn('Dataset trainset has no data', {
          datasetId,
          trainsetId: String(datasetTrainset._id)
        });
        continue;
      }

      // 5.4 拷贝数据到应用训练集
      const appTrainData = datasetTrainData.map((data) => ({
        trainsetId,
        appId,
        teamId: data.teamId,

        // 拷贝核心数据
        queries: [...data.queries],
        positiveDocs: [...data.positiveDocs],
        negativeDocs: [...data.negativeDocs],

        source: TrainDataSourceEnum.dataset,

        metadata: {
          sourceInfo: {
            datasetTrainsetDataId: String(data._id), // 溯源
            datasetId: datasetId,
            datasetName: datasetTrainset.name.replace(' - 训练集', ''),
            dataIds: data.metadata.dataIds
          },
          generationConfig: data.metadata.generationConfig
        },

        createTime: new Date()
      }));

      // 批量插入
      await MongoRerankTrainsetData.insertMany(appTrainData);

      addLog.info('Copied dataset train data to app trainset', {
        datasetId,
        trainsetId,
        dataCount: appTrainData.length
      });
    }

    // 6. 更新应用训练集统计
    await updateTrainsetStats(trainsetId);
  } catch (error) {
    // 更新失败状态
    await MongoRerankTrainset.updateOne(
      { _id: trainsetId },
      {
        status: RerankTrainsetStatusEnum.error,
        errorMsg: (error as Error).message,
        updateTime: new Date()
      }
    );
    throw error;
  }
}
```

### 4. 队列配置

```typescript
// packages/service/core/train/rerank/data/mq.ts

import { getQueue } from '@fastgpt/service/common/system/mq';

export const RerankTrainDataQueueName = 'rerankTrainDataGenerate';

export type RerankTrainDataGenerateJobData = {
  appId: string;
  trainsetId: string;
  datasetIds: string[];
  teamId: string;
  tmbId: string;
  forceRegenerate: boolean;
};

export const rerankTrainDataGenerateQueue = getQueue<RerankTrainDataGenerateJobData>(
  RerankTrainDataQueueName,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }
    }
  }
);
```

### 5. 处理器实现

```typescript
// packages/service/core/train/rerank/data/processor.ts

import type { Processor } from 'bullmq';
import type { RerankTrainDataGenerateJobData } from './mq';
import { generateAppTrainsetDataCore } from './controller';
import { addLog } from '@fastgpt/service/common/system/log';

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
```

### 6. API 实现

#### 6.1 生成训练数据
```typescript
// projects/app/src/pages/api/core/train/rerank/trainset/data/generate.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainsetByAppId, authGenerateFromDatasets } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { rerankTrainDataGenerateQueue } from '@fastgpt/service/core/train/rerank/data/mq';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  GenerateRerankTrainDataBody,
  GenerateRerankTrainDataResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerateRerankTrainDataResponse>
): Promise<GenerateRerankTrainDataResponse> {
  const { appId, datasetIds, forceRegenerate = false } = req.body as GenerateRerankTrainDataBody;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. 认证应用写权限
  const { app, trainset, teamId, tmbId } = await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  // 2. 确定目标知识库
  const targetDatasetIds =
    datasetIds?.length
      ? datasetIds
      : app.modules
          .filter((m: any) => m.type === 'dataset')
          .map((m: any) => m.datasetId)
          .filter(Boolean);

  if (!targetDatasetIds.length) {
    return Promise.reject(RerankTrainErrEnum.noDatasetAvailable);
  }

  // 3. 认证知识库读权限
  await authGenerateFromDatasets({
    req,
    authToken: true,
    datasetIds: targetDatasetIds
  });

  // 4. 检查状态
  if (trainset.status === RerankTrainsetStatusEnum.composing) {
    return Promise.reject(RerankTrainErrEnum.trainsetGenerating);
  }

  // 5. 创建异步任务
  const job = await rerankTrainDataGenerateQueue.add(
    `generate-${trainset._id}-${Date.now()}`,
    {
      appId,
      trainsetId: String(trainset._id),
      datasetIds: targetDatasetIds,
      teamId,
      tmbId,
      forceRegenerate
    }
  );

  return {
    jobId: job.id as string,
    status: 'pending'
  };
}

export default NextAPI(handler);
```

#### 6.2 训练数据列表
```typescript
// projects/app/src/pages/api/core/train/rerank/trainset/data/list.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainsetByAppId } from '@fastgpt/service/support/permission/train/rerank/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  ListRerankTrainDataBody,
  ListRerankTrainDataResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListRerankTrainDataResponse>
): Promise<ListRerankTrainDataResponse> {
  const { appId, source, pageNum = 1, pageSize = 20 } = req.body as ListRerankTrainDataBody;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { trainset } = await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  const query: any = { trainsetId: trainset._id };
  if (source) query.source = source;

  const [list, total] = await Promise.all([
    MongoRerankTrainsetData.find(query)
      .sort({ createTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MongoRerankTrainsetData.countDocuments(query)
  ]);

  return { list, total };
}

export default NextAPI(handler);
```

#### 6.3 手动添加训练数据
```typescript
// projects/app/src/pages/api/core/train/rerank/trainset/data/create.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainsetByAppId } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createManualTrainData } from '@fastgpt/service/core/train/rerank/data/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { CreateRerankTrainDataBody } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { appId, queries, positiveDocs, negativeDocs, reason } =
    req.body as CreateRerankTrainDataBody;

  if (!appId || !queries?.length || !positiveDocs?.length || !negativeDocs?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { trainset, teamId, tmbId } = await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  const dataId = await createManualTrainData({
    trainsetId: String(trainset._id),
    appId,
    teamId,
    tmbId,
    queries,
    positiveDocs,
    negativeDocs,
    reason
  });

  return dataId;
}

export default NextAPI(handler);
```

#### 6.4 更新训练数据
```typescript
// projects/app/src/pages/api/core/train/rerank/trainset/data/update.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainsetByAppId } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { updateTrainData } from '@fastgpt/service/core/train/rerank/data/controller';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { UpdateRerankTrainDataBody } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { dataId, queries, positiveDocs, negativeDocs } = req.body as UpdateRerankTrainDataBody;

  if (!dataId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 获取数据
  const data = await MongoRerankTrainsetData.findById(dataId).lean();
  if (!data) {
    return Promise.reject(RerankTrainErrEnum.trainDataNotExist);
  }

  // 认证权限
  await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId: String(data.appId),
    per: WritePermissionVal
  });

  // 更新
  await updateTrainData({
    dataId,
    queries,
    positiveDocs,
    negativeDocs
  });

  return 'success';
}

export default NextAPI(handler);
```

#### 6.5 删除训练数据
```typescript
// projects/app/src/pages/api/core/train/rerank/trainset/data/delete.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainsetByAppId } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteTrainData } from '@fastgpt/service/core/train/rerank/data/controller';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DeleteRerankTrainDataBody } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { dataIds } = req.body as DeleteRerankTrainDataBody;

  if (!dataIds?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 获取第一条数据
  const firstData = await MongoRerankTrainsetData.findById(dataIds[0]).lean();
  if (!firstData) {
    return Promise.reject(RerankTrainErrEnum.trainDataNotExist);
  }

  // 认证权限
  await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId: String(firstData.appId),
    per: WritePermissionVal
  });

  // 批量删除
  const deletedCount = await deleteTrainData(dataIds);

  return { deletedCount };
}

export default NextAPI(handler);
```

### 7. Worker 注册

```typescript
// packages/service/common/system/mq/worker.ts (修改)

import { rerankTrainDataGenerateQueue } from '../../../core/train/rerank/data/mq';
import { rerankTrainDataGenerateProcessor } from '../../../core/train/rerank/data/processor';

// ... 其他 worker 注册

// 注册训练数据生成 worker
const rerankTrainDataWorker = new Worker(
  rerankTrainDataGenerateQueue.name,
  rerankTrainDataGenerateProcessor,
  {
    connection: redisConnection,
    concurrency: 2
  }
);

rerankTrainDataWorker.on('completed', (job) => {
  addLog.info('Rerank train data generation job completed', {
    jobId: job.id
  });
});

rerankTrainDataWorker.on('failed', (job, err) => {
  addLog.error('Rerank train data generation job failed', {
    jobId: job?.id,
    error: err.message
  });
});
```

## TODO 清单

- [ ] 创建 `packages/service/core/train/rerank/data/` 目录
- [ ] 实现 RerankTrainsetData Schema (`schema.ts`)
- [ ] 实现控制器函数 (`controller.ts`)
  - [ ] `createManualTrainData`
  - [ ] `updateTrainData`
  - [ ] `deleteTrainData`
  - [ ] `calculateTrainsetStats`
  - [ ] `updateTrainsetStats`
  - [ ] `generateAppTrainsetDataCore`
- [ ] 实现队列配置 (`mq.ts`)
- [ ] 实现处理器 (`processor.ts`)
- [ ] 创建 `projects/app/src/pages/api/core/train/rerank/trainset/data/` 目录
- [ ] 实现生成训练数据 API (`generate.ts`)
- [ ] 实现训练数据列表 API (`list.ts`)
- [ ] 实现手动添加训练数据 API (`create.ts`)
- [ ] 实现更新训练数据 API (`update.ts`)
- [ ] 实现删除训练数据 API (`delete.ts`)
- [ ] 在 Worker 启动文件中注册处理器
- [ ] 编写单元测试
- [ ] 运行 `pnpm lint` 确保代码风格正确
- [ ] Git 提交变更

## 验证标准

- [ ] Schema 定义完整，索引配置正确
- [ ] 数据拷贝逻辑正确，溯源字段完整
- [ ] 统计信息计算准确（dataCount, positiveCount, negativeCount, sourceSummary）
- [ ] 异步生成正确处理知识库训练集未就绪的情况
- [ ] API 有完整的参数校验和权限验证
- [ ] Worker 正确注册并能响应队列任务
- [ ] 单元测试覆盖主要功能
- [ ] Lint 检查通过

## 关键决策记录

1. **数据拷贝而非引用**：从知识库训练集拷贝数据，而非引用，降低耦合
2. **溯源字段**：通过 `datasetTrainsetDataId` 记录数据来源，便于追溯
3. **异步生成**：知识库训练集可能未就绪，通过队列重试机制等待
4. **统计信息实时更新**：每次数据 CRUD 后立即更新训练集统计
5. **来源分类统计**：sourceSummary 按知识库和手动分类统计
6. **强制重新生成**：forceRegenerate 参数允许清空旧数据重新生成

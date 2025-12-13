# Workflow: 知识库训练集（层级1）

**任务ID**: 250112-train-module-dataset-trainset
**创建时间**: 2025-01-12
**完成时间**: 2025-01-13
**状态**: 已完成
**依赖**: 250112-train-module-external-mocks
**后续**: 250112-train-module-app-trainset-basic

## 任务目标

实现知识库训练集（层级1）的完整功能，包括：
1. MongoDB Schema 定义
2. 内部控制器函数（不对外暴露 API）
3. 异步生成队列和处理器
4. 从知识库分片采样和合成训练数据的逻辑

## 背景说明

知识库训练集是训练模块的**内部缓存层**，与知识库 1:1 绑定：
- 不对外暴露 API，仅通过内部函数调用
- 采用**懒加载策略**：应用训练集需要时自动创建
- 采用**异步生成模式**：避免 API 超时（已优化）
- 作为应用训练集的数据源，可被多个应用复用

### 设计调整

原设计使用同步等待（`waitForDatasetTrainsetReady`），已优化为：
- 检查知识库训练集状态，如果是 `idle` 或 `error`，触发异步生成任务
- 立即返回训练集对象（状态可能是 `generating`）
- 应用训练集生成时检查状态，如果不是 `ready` 则返回错误或轮询等待

## 实施方案

### 1. 目录结构
```
packages/service/core/train/rerank/dataset_trainset/
├── schema.ts                   # DatasetTrainset 和 DatasetTrainsetData Schema
├── controller.ts               # 内部控制器函数
├── mq.ts                       # BullMQ 队列配置
└── processor.ts                # Worker 处理器
```

### 2. Schema 定义

#### 2.1 DatasetTrainset Schema
```typescript
// packages/service/core/train/rerank/dataset_trainset/schema.ts

import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
import type { DatasetTrainsetSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { DatasetTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';

const DatasetTrainsetSchema = new connectionMongo.Schema({
  datasetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'dataset',
    required: true,
    unique: true  // 1:1 关系
  },
  teamId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'team',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  dataCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: Object.values(DatasetTrainsetStatusEnum),
    default: DatasetTrainsetStatusEnum.idle
  },
  errorMsg: {
    type: String
  },
  generationConfig: {
    type: {
      sampleSize: Number,
      queryCount: Number,
      negativeCount: Number,
      model: String
    }
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

// 索引
DatasetTrainsetSchema.index({ datasetId: 1 }, { unique: true });
DatasetTrainsetSchema.index({ teamId: 1, status: 1 });
DatasetTrainsetSchema.index({ status: 1, updateTime: -1 });

try {
  export const MongoDatasetTrainset: Model<DatasetTrainsetSchemaType> =
    getMongoModel('dataset_trainset', DatasetTrainsetSchema);
} catch (error) {
  console.error(error);
}
```

#### 2.2 DatasetTrainsetData Schema
```typescript
// 续 packages/service/core/train/rerank/dataset_trainset/schema.ts

const DatasetTrainsetDataSchema = new connectionMongo.Schema({
  trainsetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'dataset_trainset',
    required: true
  },
  datasetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'dataset',
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
  metadata: {
    type: {
      dataIds: [String],
      generationConfig: {
        model: String,
        temperature: Number
      },
      generatedAt: Date
    },
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

// 索引
DatasetTrainsetDataSchema.index({ trainsetId: 1, createTime: -1 });
DatasetTrainsetDataSchema.index({ datasetId: 1 });
DatasetTrainsetDataSchema.index({ teamId: 1 });

try {
  export const MongoDatasetTrainsetData: Model<DatasetTrainsetDataSchemaType> =
    getMongoModel('dataset_trainset_data', DatasetTrainsetDataSchema);
} catch (error) {
  console.error(error);
}
```

### 3. 内部控制器

```typescript
// packages/service/core/train/rerank/dataset_trainset/controller.ts

import { MongoDatasetTrainset, MongoDatasetTrainsetData } from './schema';
import { MongoDataset } from '../../dataset/schema';
import type { DatasetTrainsetSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { DatasetTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { datasetTrainsetGenerateQueue } from './mq';
import { addLog } from '@fastgpt/service/common/system/log';

/**
 * 确保知识库训练集存在（懒加载）
 * 内部函数，不对外暴露 API
 *
 * 优化：改为异步模式，避免 API 超时
 * - 如果训练集不存在，创建并触发异步生成
 * - 立即返回训练集对象（状态可能是 generating）
 * - 调用方需要自行检查状态并处理
 */
export async function ensureDatasetTrainset(
  datasetId: string
): Promise<DatasetTrainsetSchemaType> {
  // 1. 检查是否已存在
  let datasetTrainset = await MongoDatasetTrainset.findOne({ datasetId }).lean();

  if (!datasetTrainset) {
    // 2. 不存在则创建
    const dataset = await MongoDataset.findById(datasetId).lean();
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    const [{ _id }] = await MongoDatasetTrainset.create([
      {
        datasetId,
        teamId: dataset.teamId,
        name: `${dataset.name} - 训练集`,
        dataCount: 0,
        status: DatasetTrainsetStatusEnum.idle
      }
    ]);

    datasetTrainset = await MongoDatasetTrainset.findById(_id).lean();
    if (!datasetTrainset) {
      throw new Error('Failed to create dataset trainset');
    }

    addLog.info('Created dataset trainset', {
      datasetId,
      trainsetId: String(_id)
    });
  }

  // 3. 如果状态是 idle 或 error，触发异步生成任务
  if (
    datasetTrainset.status === DatasetTrainsetStatusEnum.idle ||
    datasetTrainset.status === DatasetTrainsetStatusEnum.error
  ) {
    await triggerDatasetTrainsetGeneration(String(datasetTrainset._id));
  }

  // 4. 立即返回（状态可能是 generating）
  return datasetTrainset;
}

/**
 * 触发知识库训练集异步生成
 * 内部函数
 */
async function triggerDatasetTrainsetGeneration(trainsetId: string): Promise<void> {
  // 检查是否已经在生成中
  const trainset = await MongoDatasetTrainset.findById(trainsetId).lean();
  if (!trainset) {
    throw new Error('Trainset not found');
  }

  if (trainset.status === DatasetTrainsetStatusEnum.generating) {
    addLog.info('Dataset trainset already generating', { trainsetId });
    return;
  }

  // 更新状态为 generating
  await MongoDatasetTrainset.updateOne(
    { _id: trainsetId },
    {
      status: DatasetTrainsetStatusEnum.generating,
      errorMsg: undefined,
      updateTime: new Date()
    }
  );

  // 加入队列
  await datasetTrainsetGenerateQueue.add(
    `generate-dataset-trainset-${trainsetId}`,
    {
      trainsetId,
      datasetId: String(trainset.datasetId),
      teamId: String(trainset.teamId)
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }
    }
  );

  addLog.info('Triggered dataset trainset generation', { trainsetId });
}

/**
 * 检查知识库训练集是否就绪
 * 供应用训练集生成时调用
 */
export async function checkDatasetTrainsetReady(trainsetId: string): Promise<{
  ready: boolean;
  status: `${DatasetTrainsetStatusEnum}`;
  errorMsg?: string;
}> {
  const trainset = await MongoDatasetTrainset.findById(trainsetId).lean();
  if (!trainset) {
    throw new Error('Trainset not found');
  }

  return {
    ready: trainset.status === DatasetTrainsetStatusEnum.ready,
    status: trainset.status,
    errorMsg: trainset.errorMsg
  };
}

/**
 * 获取知识库训练集数据
 * 供应用训练集拷贝数据时调用
 */
export async function getDatasetTrainsetData(trainsetId: string) {
  return MongoDatasetTrainsetData.find({ trainsetId }).lean();
}
```

### 4. 队列配置

```typescript
// packages/service/core/train/rerank/dataset_trainset/mq.ts

import { getQueue } from '@fastgpt/service/common/system/mq';

export const DatasetTrainsetQueueName = 'datasetTrainsetGenerate';

export type DatasetTrainsetGenerateJobData = {
  trainsetId: string;
  datasetId: string;
  teamId: string;
};

export const datasetTrainsetGenerateQueue = getQueue<DatasetTrainsetGenerateJobData>(
  DatasetTrainsetQueueName,
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
// packages/service/core/train/rerank/dataset_trainset/processor.ts

import type { Processor } from 'bullmq';
import type { DatasetTrainsetGenerateJobData } from './mq';
import { MongoDatasetTrainset, MongoDatasetTrainsetData } from './schema';
import { MongoDataCollections } from '../../dataset/collection/schema';
import { DatasetTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { callDiTingSyntheticRerankTrainData } from '../external';
import { addLog } from '@fastgpt/service/common/system/log';
import { UnrecoverableError } from 'bullmq';

/**
 * 知识库训练集生成处理器
 */
export const datasetTrainsetGenerateProcessor: Processor<DatasetTrainsetGenerateJobData> = async (
  job
) => {
  const { trainsetId, datasetId } = job.data;

  addLog.info('Start dataset trainset generation', { trainsetId, datasetId });

  const trainset = await MongoDatasetTrainset.findById(trainsetId);
  if (!trainset) {
    throw new UnrecoverableError('Trainset not found');
  }

  try {
    // 1. 从知识库采样分片
    const sampleSize = 1000; // 默认采样大小
    const samples = await sampleDataFromDataset(datasetId, { sampleSize });

    if (samples.length === 0) {
      throw new Error('No data available in dataset');
    }

    addLog.info('Sampled data from dataset', {
      trainsetId,
      sampleCount: samples.length
    });

    // 2. 调用 DiTing 生成训练数据
    const ditingResponse = await callDiTingSyntheticRerankTrainData({
      samples: samples.map((s) => ({
        dataId: String(s._id),
        content: s.content
      })),
      config: {
        queryCount: 1,
        negativeCount: 10,
        model: 'diting-synthetic-v1',
        temperature: 0.7
      }
    });

    if (!ditingResponse.success || !ditingResponse.data) {
      throw new Error(ditingResponse.error || 'DiTing service failed');
    }

    addLog.info('Generated train data from DiTing', {
      trainsetId,
      dataCount: ditingResponse.data.length
    });

    // 3. 批量插入训练数据
    const insertData = ditingResponse.data.map((item) => ({
      trainsetId,
      datasetId,
      teamId: trainset.teamId,
      queries: item.queries,
      positiveDocs: item.positiveDocs,
      negativeDocs: item.negativeDocs,
      metadata: {
        dataIds: item.sourceDataIds,
        generationConfig: item.generationConfig,
        generatedAt: new Date()
      }
    }));

    await MongoDatasetTrainsetData.insertMany(insertData);

    // 4. 更新训练集状态
    await MongoDatasetTrainset.updateOne(
      { _id: trainsetId },
      {
        status: DatasetTrainsetStatusEnum.ready,
        dataCount: ditingResponse.data.length,
        generationConfig: {
          sampleSize,
          queryCount: 1,
          negativeCount: 10,
          model: 'diting-synthetic-v1'
        },
        errorMsg: undefined,
        updateTime: new Date()
      }
    );

    addLog.info('Dataset trainset generation completed', {
      trainsetId,
      dataCount: ditingResponse.data.length
    });
  } catch (error) {
    addLog.error('Dataset trainset generation failed', error);

    // 更新状态为 error
    await MongoDatasetTrainset.updateOne(
      { _id: trainsetId },
      {
        status: DatasetTrainsetStatusEnum.error,
        errorMsg: (error as Error).message,
        updateTime: new Date()
      }
    );

    throw error;
  }
};

/**
 * 从知识库采样数据分片
 * 内部函数
 */
async function sampleDataFromDataset(
  datasetId: string,
  options: { sampleSize: number }
): Promise<Array<{ _id: string; content: string }>> {
  // 使用聚合查询随机采样
  const samples = await MongoDataCollections.aggregate([
    {
      $match: {
        datasetId: datasetId,
        // 只采样有内容的分片
        'rawLink.rawText': { $exists: true, $ne: '' }
      }
    },
    { $sample: { size: options.sampleSize } },
    {
      $project: {
        _id: 1,
        content: '$rawLink.rawText'
      }
    }
  ]);

  return samples;
}
```

### 6. Worker 注册

需要在 Worker 启动文件中注册处理器：

```typescript
// packages/service/common/system/mq/worker.ts (修改)

import { datasetTrainsetGenerateQueue } from '../../../core/train/rerank/dataset_trainset/mq';
import { datasetTrainsetGenerateProcessor } from '../../../core/train/rerank/dataset_trainset/processor';

// ... 其他 worker 注册

// 注册知识库训练集生成 worker
const datasetTrainsetWorker = new Worker(
  datasetTrainsetGenerateQueue.name,
  datasetTrainsetGenerateProcessor,
  {
    connection: redisConnection,
    concurrency: 2  // 并发数
  }
);

datasetTrainsetWorker.on('completed', (job) => {
  addLog.info('Dataset trainset generation job completed', {
    jobId: job.id
  });
});

datasetTrainsetWorker.on('failed', (job, err) => {
  addLog.error('Dataset trainset generation job failed', {
    jobId: job?.id,
    error: err.message
  });
});
```

## TODO 清单

- [ ] 创建 `packages/service/core/train/rerank/dataset_trainset/` 目录
- [ ] 实现 DatasetTrainset Schema (`schema.ts`)
- [ ] 实现 DatasetTrainsetData Schema (`schema.ts`)
- [ ] 实现内部控制器 (`controller.ts`)
  - [ ] `ensureDatasetTrainset` - 懒加载知识库训练集
  - [ ] `triggerDatasetTrainsetGeneration` - 触发异步生成
  - [ ] `checkDatasetTrainsetReady` - 检查就绪状态
  - [ ] `getDatasetTrainsetData` - 获取训练数据
- [ ] 实现队列配置 (`mq.ts`)
- [ ] 实现处理器 (`processor.ts`)
  - [ ] `datasetTrainsetGenerateProcessor` - 主处理器
  - [ ] `sampleDataFromDataset` - 采样函数
- [ ] 在 Worker 启动文件中注册处理器
- [ ] 编写单元测试
- [ ] 运行 `pnpm lint` 确保代码风格正确
- [ ] Git 提交变更

## 验证标准

- [ ] Schema 定义完整，索引配置正确
- [ ] 内部控制器函数有清晰的注释和错误处理
- [ ] 异步生成不会导致 API 超时
- [ ] 处理器正确处理失败重试逻辑
- [ ] Worker 正确注册并能响应队列任务
- [ ] 单元测试覆盖主要功能
- [ ] Lint 检查通过

## 关键决策记录

1. **异步生成模式**：改进原设计的同步等待，避免 API 超时
2. **懒加载策略**：知识库训练集不主动创建，需要时自动创建
3. **1:1 关系约束**：datasetId 唯一索引保证一个知识库只有一个训练集
4. **采样策略**：使用 MongoDB 的 $sample 聚合操作随机采样
5. **默认配置**：sampleSize=1000, queryCount=1, negativeCount=10
6. **错误处理**：生成失败时更新状态为 error，支持重试

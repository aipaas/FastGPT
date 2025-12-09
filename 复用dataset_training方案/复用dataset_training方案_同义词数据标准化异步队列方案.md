# 复用 dataset_trainings 方案 - 同义词数据标准化异步队列

## 📋 方案概述

本方案**复用现有的 `dataset_trainings` 训练队列**来实现同义词数据标准化,而非新建独立队列表。

**版本历史**:
- v1.0 (初稿): 基础方案设计
- v2.0: 修正4个关键问题,通过方案评审
- v3.0 (当前): 新增智能合并方案,优化用户体验

**核心依据**:
1. ✅ **embedding 模型切换已验证此模式** - [rebuildEmbedding.ts](projects/app/src/pages/api/core/dataset/training/rebuildEmbedding.ts) 成功使用 `dataset_trainings` 处理 dataset 级别批量操作
2. ✅ **前端展示按 mode 聚合** - 显示 "同义词标准化: 处理中 1000条",而非1000个独立任务
3. ✅ **架构一致性** - FastGPT 所有 dataset 级别批量操作都使用 `dataset_trainings`
4. ✅ **collectionId 无冲突** - 每条数据有自己的 collectionId,使用它是自然且正确的

---

## 1. 与 embedding 切换的模式对比

| 维度 | Embedding 模型切换 | 同义词标准化 |
|-----|-------------------|-------------|
| **触发时机** | 用户更换知识库向量模型 | 用户上传/删除同义词文件 |
| **处理范围** | dataset 级别所有数据 | dataset 级别所有数据(排除用户自定义) |
| **标记字段** | `rebuilding: true` | `synonymProcessing: 'standardize'` |
| **训练模式** | `TrainingModeEnum.chunk` | `TrainingModeEnum.synonymStandardize` |
| **dataId** | 指向现有数据 `_id` | 指向现有数据 `_id` |
| **collectionId** | 使用数据自己的 collectionId | 使用数据自己的 collectionId |
| **处理逻辑** | 删除旧向量 + 插入新向量 | 修改indexes文本 + 更新向量 + 更新全文检索 |
| **费用计算** | `pushGenerateVectorUsage` | `pushGenerateVectorUsage` |
| **链式处理** | Worker 处理完当前 → 查找下一条 → 创建任务 | 同样的链式处理 |

---

## 2. 核心原则 (不变)

从原方案继承的核心要求:

### 2.1 数据保护
- ✅ **q/a 字段永不修改** - 始终保持用户原文
- ✅ **只修改 indexes[].text** - 存储标准化后的文本
- ✅ **全文检索使用标准化 token** - 基于标准化后的 q/a 生成 fullTextToken
- ✅ **用户自定义数据默认不标准化** - `skipSynonymStandardize: true`

### 2.2 处理场景
| 场景 | 处理方式 |
|-----|---------|
| 首次上传同义词 | 检查无训练任务 → 标准化所有系统生成数据 |
| 更新同义词 | 检查无训练任务 → 先恢复旧同义词,再应用新同义词 |
| 删除同义词 | 检查无训练任务 → 恢复所有数据为原文 |
| **恢复中上传新同义词** | **智能合并** → 将恢复任务转换为标准化任务 (v3.0新增) |
| 训练中尝试同义词操作 | **拒绝操作**,提示等待训练完成 |
| 同义词处理中尝试训练 | **排队等待**,同义词处理完成后继续 |
| 系统生成新数据 | 实时标准化 (检测知识库有同义词配置) |
| 用户自定义数据 | 默认不标准化 (开关控制) |
| 直连数据库 | 不做标准化 |

---

## 3. 数据结构设计

### 3.1 扩展 TrainingModeEnum

```typescript
// packages/global/core/dataset/constants.ts

export enum TrainingModeEnum {
  // ... 现有模式
  chunk = 'chunk',
  qa = 'qa',
  auto = 'auto',

  // ✅ 新增:同义词处理模式
  synonymStandardize = 'synonymStandardize',  // 同义词标准化
  synonymRestore = 'synonymRestore'           // 同义词恢复
}
```

### 3.2 dataset_datas 数据结构 (同原方案)

```typescript
// packages/global/core/dataset/type.d.ts

export type DatasetDataIndexItemType = {
  type: `${DatasetDataIndexTypeEnum}`;
  dataId: string;
  text: string;  // ⚠️ 存储标准化后的文本

  // 该 index 的同义词转换元数据
  synonymMetadata?: {
    synonymFileIds: string[];                     // 关联的同义词文件ID数组
    transformations: TransformationRecordType[];  // 转换记录
  };

  // 跳过同义词标准化标记
  skipSynonymStandardize?: boolean;
};

export type DatasetDataSchemaType = {
  q: string;  // ✅ 保持原文不变
  a: string;  // ✅ 保持原文不变

  // 分片级别:跳过同义词标准化
  skipSynonymStandardize?: boolean;

  // ✅ 新增:同义词处理状态 (标记数据需要被处理)
  synonymProcessing?: 'standardize' | 'restore';
  synonymFileIds?: string[];  // 需要应用的同义词文件ID数组

  indexes: DatasetDataIndexItemType[];
  // ... 其他字段
};
```

### 3.3 dataset_trainings 的使用方式

**无需新增字段**,复用现有结构:

```typescript
// 同义词标准化任务示例
{
  teamId: ObjectId,
  tmbId: ObjectId,
  datasetId: ObjectId,
  collectionId: ObjectId,  // ← 使用数据自己的 collectionId
  mode: 'synonymStandardize',  // ← 新的 mode
  dataId: ObjectId,  // ← 指向现有 dataset_data._id

  // ✅ 使用 dataMetadata 存储同义词专用信息
  dataMetadata: {
    synonymFileIds: ['fileId1', 'fileId2'],  // 当前要应用的同义词文件
    oldSynonymFileIds: ['oldFileId']         // 更新模式时:需要先恢复的旧文件
  },

  retryCount: 3,
  lockTime: new Date('2000/1/1'),
  billId: String
}
```

---

## 4. 实现流程

### 4.1 上传同义词文件 - 标准化流程

```typescript
// packages/service/core/dataset/synonym/controller.ts

export async function uploadSynonymFile({ teamId, tmbId, datasetId, csvContent, ... }) {
  // 0. ✅ 检查是否有正在进行的训练任务
  const hasTrainingTask = await MongoDatasetTraining.exists({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  });

  if (hasTrainingTask) {
    throw new Error('知识库正在训练中,请等待训练完成后再上传同义词文件');
  }

  // 1. 解析CSV,保存同义词映射
  const synonymFile = await saveSynonymMappings({ teamId, datasetId, csvContent });

  // 2. ✅ 创建 billId (用于费用追踪)
  const { billId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: '同义词标准化',
    billSource: UsageSourceEnum.training,
    vectorModel: getEmbeddingModel(dataset.vectorModel)?.name
  });

  // 3. 标记所有需要标准化的数据 (借鉴 rebuildEmbedding 模式)
  await MongoDatasetData.updateMany(
    {
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId),
      skipSynonymStandardize: { $ne: true }  // 排除用户自定义数据
    },
    {
      $set: {
        synonymProcessing: 'standardize',
        synonymFileIds: [String(synonymFile._id)]
      }
    }
  );

  // 4. 创建初始批次的训练任务 (与 rebuildEmbedding 完全一致的模式)
  const max = global.systemEnv?.vectorMaxProcess || 10;
  const initialBatch = new Array(max * 2).fill(0);

  for await (const _ of initialBatch) {
    try {
      const hasNext = await mongoSessionRun(async (session) => {
        // 获取下一条需要处理的数据
        const data = await MongoDatasetData.findOneAndUpdate(
          {
            synonymProcessing: 'standardize',
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId)
          },
          {
            $unset: { synonymProcessing: null }  // 清除标记,避免重复处理
          },
          { session }
        ).select({ _id: 1, collectionId: 1, synonymFileIds: 1 });

        if (data) {
          // 创建训练任务
          await MongoDatasetTraining.create(
            [
              {
                teamId: new Types.ObjectId(teamId),
                tmbId: new Types.ObjectId(tmbId),
                datasetId: new Types.ObjectId(datasetId),
                collectionId: data.collectionId,  // ← 使用数据自己的 collectionId
                mode: TrainingModeEnum.synonymStandardize,
                dataId: data._id,  // ← 指向现有数据
                dataMetadata: {
                  synonymFileIds: data.synonymFileIds  // 传递同义词文件ID
                },
                retryCount: 3,
                billId  // ← 必需: 费用追踪ID
              }
            ],
            { session, ordered: true }
          );
        }

        return !!data;
      });

      if (!hasNext) break;
    } catch (error) {
      console.error('创建同义词训练任务失败:', error);
    }
  }

  return synonymFile.toObject();
}
```

### 4.2 删除同义词文件 - 恢复流程

```typescript
export async function deleteSynonymFile({ teamId, tmbId, datasetId, synonymId, ... }) {
  // 0. ✅ 检查是否有正在进行的训练任务
  const hasTrainingTask = await MongoDatasetTraining.exists({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  });

  if (hasTrainingTask) {
    throw new Error('知识库正在训练中,请等待训练完成后再删除同义词文件');
  }

  // 1. ✅ 创建 billId (用于费用追踪)
  const { billId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: '同义词恢复',
    billSource: UsageSourceEnum.training,
    vectorModel: getEmbeddingModel(dataset.vectorModel)?.name
  });

  // 2. 标记所有需要恢复的数据
  await MongoDatasetData.updateMany(
    {
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId),
      // 只恢复包含该同义词文件的数据
      'indexes.synonymMetadata.synonymFileIds': synonymId
    },
    {
      $set: {
        synonymProcessing: 'restore',
        synonymFileIds: [synonymId]
      }
    }
  );

  // 3. 创建初始批次的恢复任务
  const max = global.systemEnv?.vectorMaxProcess || 10;
  const initialBatch = new Array(max * 2).fill(0);

  for await (const _ of initialBatch) {
    try {
      const hasNext = await mongoSessionRun(async (session) => {
        const data = await MongoDatasetData.findOneAndUpdate(
          {
            synonymProcessing: 'restore',
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId)
          },
          {
            $unset: { synonymProcessing: null }
          },
          { session }
        ).select({ _id: 1, collectionId: 1, synonymFileIds: 1 });

        if (data) {
          await MongoDatasetTraining.create(
            [
              {
                teamId: new Types.ObjectId(teamId),
                tmbId: new Types.ObjectId(tmbId),
                datasetId: new Types.ObjectId(datasetId),
                collectionId: data.collectionId,
                mode: TrainingModeEnum.synonymRestore,  // ← 恢复模式
                dataId: data._id,
                dataMetadata: {
                  synonymFileIds: data.synonymFileIds
                },
                retryCount: 3,
                billId  // ← 必需: 费用追踪ID
              }
            ],
            { session, ordered: true }
          );
        }

        return !!data;
      });

      if (!hasNext) break;
    } catch (error) {
      console.error('创建同义词恢复任务失败:', error);
    }
  }

  // 4. 删除同义词文件记录 (Worker 处理完成后会自动停止)
  await MongoDatasetSynonym.deleteOne({ _id: synonymId });
}
```

### 4.3 上传同义词文件 - 智能合并方案 (v3.0 优化)

```typescript
export async function uploadSynonymFile({
  teamId,
  tmbId,
  datasetId,
  csvContent,
  ...
}) {
  // 1. 检查是否有正在进行的训练任务
  const existingTasks = await MongoDatasetTraining.find({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  }).select('mode');

  // 分析现有任务类型
  const hasRestoreTasks = existingTasks.some(t => t.mode === TrainingModeEnum.synonymRestore);
  const hasStandardizeTasks = existingTasks.some(t => t.mode === TrainingModeEnum.synonymStandardize);
  const hasOtherTasks = existingTasks.some(t =>
    t.mode !== TrainingModeEnum.synonymRestore &&
    t.mode !== TrainingModeEnum.synonymStandardize
  );

  // 2. 根据不同情况处理
  if (hasOtherTasks) {
    // 有其他类型训练任务，必须等待
    throw new Error('知识库正在训练中，请等待训练完成后再上传同义词文件');
  }

  if (hasStandardizeTasks) {
    // 正在标准化，不能再次上传
    throw new Error('正在应用同义词标准化，请等待处理完成后再上传新的同义词文件');
  }

  if (hasRestoreTasks) {
    // ✅ 正在恢复，执行智能合并
    return await smartMergeRestoreToStandardize({
      teamId,
      tmbId,
      datasetId,
      csvContent
    });
  }

  // 3. 没有任何任务，正常上传流程
  return await normalUploadSynonymFile({
    teamId,
    tmbId,
    datasetId,
    csvContent
  });
}
```

### 4.4 智能合并实现 (v3.0 新增)

**核心思路**: 当用户在恢复过程中上传新同义词时，直接将"恢复到原文"的操作转换为"应用新同义词"的操作，跳过中间状态。

```typescript
// packages/service/core/dataset/synonym/smartMerge.ts

import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

export async function smartMergeRestoreToStandardize({
  teamId,
  tmbId,
  datasetId,
  csvContent
}) {
  // 1. 解析并保存新的同义词映射
  const synonymFile = await saveSynonymMappings({
    teamId,
    datasetId,
    csvContent
  });

  // 2. 获取或创建费用记录
  let billId: string;

  const existingTask = await MongoDatasetTraining.findOne({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId),
    mode: TrainingModeEnum.synonymRestore
  }).select('billId');

  if (existingTask?.billId) {
    billId = existingTask.billId;  // 复用现有费用记录
  } else {
    const billResult = await createTrainingUsage({
      teamId,
      tmbId,
      appName: '同义词智能更新',
      billSource: UsageSourceEnum.training,
      vectorModel: getEmbeddingModel(dataset.vectorModel)?.name
    });
    billId = billResult.billId;
  }

  // 3. ✅ 使用事务确保原子性操作
  const result = await mongoSessionRun(async (session) => {

    // Step 1: 将所有恢复任务转换为标准化任务
    const updateTasksResult = await MongoDatasetTraining.updateMany(
      {
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId),
        mode: TrainingModeEnum.synonymRestore
      },
      {
        $set: {
          mode: TrainingModeEnum.synonymStandardize,
          'dataMetadata.synonymFileIds': [String(synonymFile._id)],
          'dataMetadata.isConverted': true  // 标记为转换来的任务
        }
      },
      { session }
    );

    // Step 2: 更新带有恢复标记的数据为标准化标记
    const updateDataResult = await MongoDatasetData.updateMany(
      {
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId),
        synonymProcessing: 'restore'
      },
      {
        $set: {
          synonymProcessing: 'standardize',
          synonymFileIds: [String(synonymFile._id)]
        }
      },
      { session }
    );

    // Step 3: 查找已经完成恢复的数据（已经是原文，但没有标记）
    const restoredData = await MongoDatasetData.find(
      {
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId),
        synonymProcessing: { $exists: false },
        'indexes.synonymMetadata': { $exists: false },
        skipSynonymStandardize: { $ne: true }
      },
      { session }
    ).select('_id collectionId');

    // Step 4: 为已恢复的数据创建标准化任务
    if (restoredData.length > 0) {
      const dataIds = restoredData.map(d => d._id);

      // 先标记这些数据需要标准化
      await MongoDatasetData.updateMany(
        { _id: { $in: dataIds } },
        {
          $set: {
            synonymProcessing: 'standardize',
            synonymFileIds: [String(synonymFile._id)]
          }
        },
        { session }
      );

      // 创建初始批次的标准化任务（最多20个）
      const max = Math.min(20, restoredData.length);
      const tasksToCreate = [];

      for (let i = 0; i < max; i++) {
        const data = restoredData[i];
        tasksToCreate.push({
          teamId: new Types.ObjectId(teamId),
          tmbId: new Types.ObjectId(tmbId),
          datasetId: new Types.ObjectId(datasetId),
          collectionId: data.collectionId,
          mode: TrainingModeEnum.synonymStandardize,
          dataId: data._id,
          dataMetadata: {
            synonymFileIds: [String(synonymFile._id)],
            fromSmartMerge: true
          },
          retryCount: 3,
          billId,
          lockTime: new Date('2000/1/1')
        });
      }

      if (tasksToCreate.length > 0) {
        await MongoDatasetTraining.insertMany(tasksToCreate, {
          session,
          ordered: false
        });
      }
    }

    // Step 5: 处理包含其他同义词的数据
    const complexData = await MongoDatasetData.find(
      {
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId),
        'indexes.synonymMetadata.synonymFileIds': {
          $exists: true,
          $ne: []
        },
        synonymProcessing: { $exists: false }
      },
      { session }
    ).select('_id');

    if (complexData.length > 0) {
      await MongoDatasetData.updateMany(
        { _id: { $in: complexData.map(d => d._id) } },
        {
          $set: {
            synonymProcessing: 'standardize',
            synonymFileIds: [String(synonymFile._id)],
            needFullReprocess: true
          }
        },
        { session }
      );
    }

    return {
      convertedTasks: updateTasksResult.modifiedCount,
      convertedData: updateDataResult.modifiedCount,
      newStandardizeTasks: restoredData.length,
      complexDataCount: complexData.length
    };
  });

  return {
    success: true,
    message: '已成功将恢复操作转换为标准化操作',
    synonymFile: synonymFile.toObject(),
    statistics: result
  };
}
```

### 4.5 更新同义词文件 - 简化方案 (保留作为备选)

```typescript
export async function updateSynonymFile({
  teamId,
  tmbId,
  datasetId,
  oldSynonymId,
  newCsvContent,
  ...
}) {
  // 0. ✅ 检查是否有正在进行的训练任务
  const hasTrainingTask = await MongoDatasetTraining.exists({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  });

  if (hasTrainingTask) {
    throw new Error('知识库正在训练中,请等待训练完成后再更新同义词文件');
  }

  // ✅ 简化方案: 先完整恢复旧同义词,再完整应用新同义词
  // 避免在 Worker 中实现复杂的两阶段处理逻辑

  // 1. 先调用删除流程,恢复所有数据
  await deleteSynonymFile({
    teamId,
    tmbId,
    datasetId,
    synonymId: oldSynonymId
  });

  // 等待恢复任务全部完成 (通过轮询检查)
  while (true) {
    const hasRestoreTask = await MongoDatasetTraining.exists({
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId),
      mode: TrainingModeEnum.synonymRestore
    });

    if (!hasRestoreTask) break;

    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
  }

  // 2. 再调用上传流程,应用新同义词
  return await uploadSynonymFile({
    teamId,
    tmbId,
    datasetId,
    csvContent: newCsvContent
  });
}
```

---

## 5. Worker 实现

### 5.1 扩展 generateVector.ts

```typescript
// projects/app/src/service/core/dataset/queues/generateVector.ts

export async function generateVector(): Promise<any> {
  // ... 现有逻辑

  while (true) {
    // 获取训练任务 (包含同义词模式)
    const data = await MongoDatasetTraining.findOneAndUpdate(
      {
        mode: {
          $in: [
            TrainingModeEnum.chunk,
            TrainingModeEnum.synonymStandardize,  // ✅ 新增
            TrainingModeEnum.synonymRestore       // ✅ 新增
          ]
        },
        retryCount: { $gt: 0 },
        lockTime: { $lte: addMinutes(new Date(), -3) }
      },
      {
        lockTime: new Date(),
        $inc: { retryCount: -1 }
      }
    )
    .populate<PopulateType>([
      { path: 'dataset', select: 'vectorModel' },
      { path: 'collection', select: 'name' },
      { path: 'data', select: '_id q a indexes' }  // ← 需要加载 q/a 用于全文检索
    ])
    .lean();

    if (!data) break;

    // 根据 mode 路由到不同处理逻辑
    try {
      const { tokens } = await (async () => {
        if (data.mode === TrainingModeEnum.chunk && data.dataId) {
          return rebuildData({ trainingData: data });
        }
        else if (data.mode === TrainingModeEnum.chunk && !data.dataId) {
          return insertData({ trainingData: data });
        }
        else if (data.mode === TrainingModeEnum.synonymStandardize) {
          return processSynonymStandardize({ trainingData: data });  // ✅ 新增
        }
        else if (data.mode === TrainingModeEnum.synonymRestore) {
          return processSynonymRestore({ trainingData: data });      // ✅ 新增
        }
        else {
          throw new Error(`Unknown training mode: ${data.mode}`);
        }
      })();

      // 推送费用
      if (tokens > 0) {
        pushGenerateVectorUsage({
          teamId: data.teamId,
          tmbId: data.tmbId,
          inputTokens: tokens,
          model: data.dataset.vectorModel,
          billId: data.billId
        });
      }
    } catch (err) {
      // 错误处理
      await MongoDatasetTraining.updateOne(
        { _id: data._id },
        { errorMsg: getErrText(err, 'unknown error') }
      );
    }
  }
}
```

### 5.2 同义词标准化处理器

```typescript
// projects/app/src/service/core/dataset/queues/synonym/standardize.ts

import { getDatasetSynonymConfig } from '@/service/core/dataset/indexTransform/controller';
import { applySynonymTransform } from '@fastgpt/service/core/dataset/indexTransform/utils';
import {
  deleteDatasetDataVector,
  insertDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba';

type TrainingDataType = DatasetTrainingSchemaType & {
  dataset: { vectorModel: string };
  collection: { name: string };
  data: {
    _id: string;
    q: string;
    a: string;
    indexes: DatasetDataSchemaType['indexes'];
  };
};

export const processSynonymStandardize = async ({
  trainingData
}: {
  trainingData: TrainingDataType
}) => {
  if (!trainingData.data) {
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return { tokens: 0 };
  }

  const { teamId, datasetId, dataId, dataMetadata } = trainingData;
  const synonymFileIds = dataMetadata?.synonymFileIds || [];

  // 1. 获取同义词配置
  const synonymConfig = await getDatasetSynonymConfig({
    teamId: String(teamId),
    datasetId: String(datasetId)
  });

  if (!synonymConfig) {
    // 没有同义词配置,删除任务
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return { tokens: 0 };
  }

  const { synonymDict, synonymMappingMap } = synonymConfig;

  // 2. ✅ 对 q/a 应用同义词 (仅用于全文检索,不存储)
  const qStandardized = applySynonymTransform(
    trainingData.data.q,
    synonymDict,
    synonymMappingMap
  );
  const aStandardized = trainingData.data.a
    ? applySynonymTransform(trainingData.data.a, synonymDict, synonymMappingMap)
    : null;

  // 3. ✅ 处理每个 index
  const indexesToUpdate: Array<{
    index: any;
    indexResult: any;
    arrayIndex: number;
  }> = [];

  for (let i = 0; i < trainingData.data.indexes.length; i++) {
    const index = trainingData.data.indexes[i];

    // 跳过用户自定义索引
    if (index.skipSynonymStandardize === true) continue;

    const indexResult = applySynonymTransform(
      index.text,
      synonymDict,
      synonymMappingMap
    );

    if (indexResult.transformations.length > 0) {
      indexesToUpdate.push({ index, indexResult, arrayIndex: i });
    }
  }

  let totalTokens = 0;

  // 4. ✅ 批量更新向量 (先删后插)
  if (indexesToUpdate.length > 0) {
    // 删除旧向量
    const oldDataIds = indexesToUpdate.map(item => item.index.dataId);
    await deleteDatasetDataVector({
      teamId: String(teamId),
      idList: oldDataIds
    });

    // 插入新向量
    const insertResult = await insertDatasetDataVector({
      inputs: indexesToUpdate.map(item => item.indexResult.transformedText),
      model: getEmbeddingModel(trainingData.dataset.vectorModel),
      teamId: String(teamId),
      datasetId: String(datasetId),
      collectionId: String(trainingData.collectionId)
    });

    totalTokens = insertResult.tokens;

    // 更新 indexes 数组
    const newIndexes = trainingData.data.indexes.map((index, i) => {
      const updateIndex = indexesToUpdate.findIndex(item => item.arrayIndex === i);

      if (updateIndex !== -1) {
        const { indexResult } = indexesToUpdate[updateIndex];
        return {
          ...index,
          dataId: insertResult.insertIds[updateIndex],  // ← 新的 dataId
          text: indexResult.transformedText,            // ← 标准化文本
          synonymMetadata: {
            synonymFileIds,
            transformations: indexResult.transformations
          }
        };
      }

      return index;
    });

    // 5. ✅ 更新 MongoDB (使用 session 保证原子性)
    await mongoSessionRun(async (session) => {
      await MongoDatasetData.updateOne(
        { _id: dataId },
        {
          $set: {
            // ⚠️ q/a 不修改,保持原文
            indexes: newIndexes
          }
        },
        { session }
      );

      // 6. ✅ 更新全文检索 (使用标准化后的 q/a)
      const fullText = aStandardized
        ? `${qStandardized.transformedText}\n${aStandardized.transformedText}`
        : qStandardized.transformedText;
      const fullTextToken = await jiebaSplit({ text: fullText });

      await MongoDatasetDataText.updateOne(
        { dataId },
        {
          $set: {
            teamId,
            datasetId: trainingData.datasetId,
            collectionId: trainingData.collectionId,
            fullTextToken
          }
        },
        { upsert: true, session }
      );

      // 7. 删除训练任务
      await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

      // 8. ✅ 链式处理:查找下一条需要处理的数据
      const nextData = await MongoDatasetData.findOneAndUpdate(
        {
          synonymProcessing: 'standardize',
          teamId,
          datasetId: trainingData.datasetId
        },
        {
          $unset: { synonymProcessing: null }
        },
        { session }
      ).select({ _id: 1, collectionId: 1, synonymFileIds: 1 });

      if (nextData) {
        await MongoDatasetTraining.create(
          [
            {
              teamId,
              tmbId: trainingData.tmbId,
              datasetId: trainingData.datasetId,
              collectionId: nextData.collectionId,
              mode: TrainingModeEnum.synonymStandardize,
              dataId: nextData._id,
              dataMetadata: {
                synonymFileIds: nextData.synonymFileIds
              },
              retryCount: 3,
              billId: trainingData.billId
            }
          ],
          { session, ordered: true }
        );
      }
    });
  } else {
    // 该条数据无需更新向量,但仍需更新全文检索和删除任务
    await mongoSessionRun(async (session) => {
      const fullText = aStandardized
        ? `${qStandardized.transformedText}\n${aStandardized.transformedText}`
        : qStandardized.transformedText;
      const fullTextToken = await jiebaSplit({ text: fullText });

      await MongoDatasetDataText.updateOne(
        { dataId },
        {
          $set: {
            teamId,
            datasetId: trainingData.datasetId,
            collectionId: trainingData.collectionId,
            fullTextToken
          }
        },
        { upsert: true, session }
      );

      await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

      // 链式处理下一条
      const nextData = await MongoDatasetData.findOneAndUpdate(
        {
          synonymProcessing: 'standardize',
          teamId,
          datasetId: trainingData.datasetId
        },
        {
          $unset: { synonymProcessing: null }
        },
        { session }
      ).select({ _id: 1, collectionId: 1, synonymFileIds: 1 });

      if (nextData) {
        await MongoDatasetTraining.create(
          [
            {
              teamId,
              tmbId: trainingData.tmbId,
              datasetId: trainingData.datasetId,
              collectionId: nextData.collectionId,
              mode: TrainingModeEnum.synonymStandardize,
              dataId: nextData._id,
              dataMetadata: {
                synonymFileIds: nextData.synonymFileIds
              },
              retryCount: 3,
              billId: trainingData.billId
            }
          ],
          { session, ordered: true }
        );
      }
    });
  }

  return { tokens: totalTokens };
};
```

### 5.3 同义词恢复处理器

```typescript
// projects/app/src/service/core/dataset/queues/synonym/restore.ts

import { restoreOriginalText } from '@fastgpt/service/core/dataset/indexTransform/utils';

export const processSynonymRestore = async ({
  trainingData
}: {
  trainingData: TrainingDataType
}) => {
  if (!trainingData.data) {
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return { tokens: 0 };
  }

  const { teamId, datasetId, dataId } = trainingData;

  // 1. ✅ q/a 本来就是原文,不需要恢复

  // 2. ✅ 收集需要恢复的 index
  const indexesToRestore: Array<{
    index: any;
    originalText: string;
    arrayIndex: number;
  }> = [];

  for (let i = 0; i < trainingData.data.indexes.length; i++) {
    const index = trainingData.data.indexes[i];
    if (index.synonymMetadata) {
      const originalText = restoreOriginalText(
        index.text,
        index.synonymMetadata.transformations
      );
      indexesToRestore.push({ index, originalText, arrayIndex: i });
    }
  }

  let totalTokens = 0;

  // 3. ✅ 批量更新向量
  if (indexesToRestore.length > 0) {
    const oldDataIds = indexesToRestore.map(item => item.index.dataId);
    await deleteDatasetDataVector({
      teamId: String(teamId),
      idList: oldDataIds
    });

    const insertResult = await insertDatasetDataVector({
      inputs: indexesToRestore.map(item => item.originalText),
      model: getEmbeddingModel(trainingData.dataset.vectorModel),
      teamId: String(teamId),
      datasetId: String(datasetId),
      collectionId: String(trainingData.collectionId)
    });

    totalTokens = insertResult.tokens;

    // 4. ✅ 更新 indexes
    const newIndexes = trainingData.data.indexes.map((index, i) => {
      const restoreIndex = indexesToRestore.findIndex(item => item.arrayIndex === i);

      if (restoreIndex !== -1) {
        return {
          type: index.type,
          dataId: insertResult.insertIds[restoreIndex],
          text: indexesToRestore[restoreIndex].originalText
          // 移除 synonymMetadata
        };
      }

      // 未变化的也移除 synonymMetadata
      const { synonymMetadata, ...rest } = index;
      return rest;
    });

    // 5. ✅ 更新数据库
    await mongoSessionRun(async (session) => {
      await MongoDatasetData.updateOne(
        { _id: dataId },
        {
          $set: {
            indexes: newIndexes
          }
        },
        { session }
      );

      // 6. ✅ 更新全文检索 (使用原文)
      const fullText = trainingData.data.a
        ? `${trainingData.data.q}\n${trainingData.data.a}`
        : trainingData.data.q;
      const fullTextToken = await jiebaSplit({ text: fullText });

      await MongoDatasetDataText.updateOne(
        { dataId },
        {
          $set: {
            teamId,
            datasetId: trainingData.datasetId,
            collectionId: trainingData.collectionId,
            fullTextToken
          }
        },
        { upsert: true, session }
      );

      await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

      // 7. ✅ 链式处理下一条
      const nextData = await MongoDatasetData.findOneAndUpdate(
        {
          synonymProcessing: 'restore',
          teamId,
          datasetId: trainingData.datasetId
        },
        {
          $unset: { synonymProcessing: null }
        },
        { session }
      ).select({ _id: 1, collectionId: 1, synonymFileIds: 1 });

      if (nextData) {
        await MongoDatasetTraining.create(
          [
            {
              teamId,
              tmbId: trainingData.tmbId,
              datasetId: trainingData.datasetId,
              collectionId: nextData.collectionId,
              mode: TrainingModeEnum.synonymRestore,
              dataId: nextData._id,
              dataMetadata: {
                synonymFileIds: nextData.synonymFileIds
              },
              retryCount: 3,
              billId: trainingData.billId
            }
          ],
          { session, ordered: true }
        );
      }
    });
  }

  return { tokens: totalTokens };
};
```

---

## 6. 前端展示

### 6.1 扩展训练状态文本

```typescript
// projects/app/src/pageComponents/dataset/detail/CollectionCard/TrainingStates.tsx

const TrainingText = {
  [TrainingModeEnum.parse]: t('dataset:process.Parsing'),
  [TrainingModeEnum.chunk]: t('dataset:process.Vectorizing'),
  [TrainingModeEnum.qa]: t('dataset:process.Get QA'),
  [TrainingModeEnum.imageParse]: t('dataset:process.Image_Index'),
  [TrainingModeEnum.image]: t('dataset:process.Image_Index'),
  [TrainingModeEnum.auto]: t('dataset:process.Auto_Index'),
  [TrainingModeEnum.hype]: t('dataset:process.Hype_Index'),
  [TrainingModeEnum.databaseSchema]: t('dataset:process.databaseSchema'),
  [TrainingModeEnum.small2Big]: t('dataset:process.segment_enhanced_index'),

  // ✅ 新增
  [TrainingModeEnum.synonymStandardize]: t('dataset:process.Synonym_Standardize'),
  [TrainingModeEnum.synonymRestore]: t('dataset:process.Synonym_Restore')
};
```

### 6.2 i18n 翻译

```json
// packages/web/i18n/zh-CN/dataset.json
{
  "process": {
    "Synonym_Standardize": "同义词标准化",
    "Synonym_Restore": "同义词恢复"
  }
}
```

### 6.3 前端显示效果

当用户上传同义词后,训练状态弹窗会显示:

```
训练进度
├─ 解析 ✓
├─ 向量化 ✓
├─ 同义词标准化 ⏳ 处理中 1000条  ← 聚合显示
└─ 已就绪
```

点击"训练错误"标签页,可以看到失败的任务并批量重试。

---

## 7. 实时标准化 (新增数据)

### 7.1 检测知识库是否有同义词配置

```typescript
// packages/service/core/dataset/synonym/realtime.ts

export async function realtimeSynonymStandardize({
  teamId,
  datasetId,
  q,
  a,
  indexes,
  isUserCustom = false,
  applySynonym = false
}: {
  teamId: string;
  datasetId: string;
  q: string;
  a?: string;
  indexes: Omit<DatasetDataIndexItemType, 'dataId'>[];
  isUserCustom?: boolean;
  applySynonym?: boolean;
}) {
  // 1. 获取同义词配置
  const synonymConfig = await getDatasetSynonymConfig({ teamId, datasetId });

  if (!synonymConfig) {
    return { q, a, indexes };
  }

  const { synonymDict, synonymMappingMap, synonymFileIds } = synonymConfig;

  // 2. 用户自定义 + 不应用 → 标记跳过
  if (isUserCustom && !applySynonym) {
    return {
      q,
      a,
      indexes,
      skipSynonymStandardize: true
    };
  }

  // 3. 标准化 indexes
  const newIndexes = indexes.map((index) => {
    if (index.type === 'custom' && isUserCustom && !applySynonym) {
      return { ...index, skipSynonymStandardize: true };
    }

    const indexResult = applySynonymTransform(index.text, synonymDict, synonymMappingMap);
    return {
      ...index,
      text: indexResult.transformedText,
      ...(indexResult.transformations.length > 0 && {
        synonymMetadata: {
          synonymFileIds,
          transformations: indexResult.transformations
        }
      })
    };
  });

  return {
    q,  // ✅ 不修改
    a,  // ✅ 不修改
    indexes: newIndexes,
    skipSynonymStandardize: false
  };
}
```

### 7.2 集成到训练队列

```typescript
// 在 chunk 训练模式创建数据时
// projects/app/src/service/core/dataset/queues/generateVector.ts

const insertData = async ({ trainingData }: { trainingData: TrainingDataType }) => {
  return mongoSessionRun(async (session) => {
    // ✅ 实时标准化 (只处理 indexes, 返回标准化后的 q/a 用于全文检索)
    const standardizedData = await realtimeSynonymStandardize({
      teamId: String(trainingData.teamId),
      datasetId: String(trainingData.datasetId),
      q: trainingData.q,
      a: trainingData.a,
      indexes: trainingData.indexes,
      isUserCustom: false
    });

    // 插入数据 (q/a 保持原文,indexes 已标准化)
    const { tokens, insertId } = await insertData2Dataset({
      teamId: trainingData.teamId,
      tmbId: trainingData.tmbId,
      datasetId: trainingData.datasetId,
      collectionId: trainingData.collectionId,
      q: standardizedData.q,  // ← 原文不变
      a: standardizedData.a,  // ← 原文不变
      indexes: standardizedData.indexes,  // ← 已标准化
      skipSynonymStandardize: standardizedData.skipSynonymStandardize,
      // ✅ 额外传递标准化后的 q/a 用于全文检索
      qStandardized: standardizedData.qStandardized,
      aStandardized: standardizedData.aStandardized,
      session
    });

    // ✅ 全文检索使用标准化内容
    // insertData2Dataset 内部处理:
    // const fullText = aStandardized
    //   ? `${qStandardized}\n${aStandardized}`
    //   : qStandardized;
    // const fullTextToken = await jiebaSplit({ text: fullText });
    // await MongoDatasetDataText.create({ dataId: insertId, fullTextToken, ... });

    return { tokens };
  });
};
```

### 7.3 修改 realtimeSynonymStandardize 返回结构

```typescript
// packages/service/core/dataset/synonym/realtime.ts

export async function realtimeSynonymStandardize({
  teamId,
  datasetId,
  q,
  a,
  indexes,
  isUserCustom = false,
  applySynonym = false
}: {
  teamId: string;
  datasetId: string;
  q: string;
  a?: string;
  indexes: Omit<DatasetDataIndexItemType, 'dataId'>[];
  isUserCustom?: boolean;
  applySynonym?: boolean;
}) {
  // 1. 获取同义词配置
  const synonymConfig = await getDatasetSynonymConfig({ teamId, datasetId });

  if (!synonymConfig) {
    return { q, a, indexes, qStandardized: q, aStandardized: a };
  }

  const { synonymDict, synonymMappingMap, synonymFileIds } = synonymConfig;

  // 2. 用户自定义 + 不应用 → 标记跳过
  if (isUserCustom && !applySynonym) {
    return {
      q,
      a,
      indexes,
      skipSynonymStandardize: true,
      qStandardized: q,
      aStandardized: a
    };
  }

  // 3. ✅ 标准化 q/a (用于全文检索)
  const qResult = applySynonymTransform(q, synonymDict, synonymMappingMap);
  const aResult = a
    ? applySynonymTransform(a, synonymDict, synonymMappingMap)
    : null;

  // 4. 标准化 indexes
  const newIndexes = indexes.map((index) => {
    if (index.type === 'custom' && isUserCustom && !applySynonym) {
      return { ...index, skipSynonymStandardize: true };
    }

    const indexResult = applySynonymTransform(index.text, synonymDict, synonymMappingMap);
    return {
      ...index,
      text: indexResult.transformedText,
      ...(indexResult.transformations.length > 0 && {
        synonymMetadata: {
          synonymFileIds,
          transformations: indexResult.transformations
        }
      })
    };
  });

  return {
    q,  // ✅ 原文不变,存储到 MongoDB
    a,  // ✅ 原文不变,存储到 MongoDB
    qStandardized: qResult.transformedText,  // ← 标准化后,用于全文检索
    aStandardized: aResult?.transformedText || a,  // ← 标准化后,用于全文检索
    indexes: newIndexes,
    skipSynonymStandardize: false
  };
}
```

### 7.4 修改 insertData2Dataset 支持全文检索标准化

```typescript
// packages/service/core/dataset/data/controller.ts

export async function insertData2Dataset({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  q,
  a,
  indexes,
  skipSynonymStandardize = false,
  qStandardized,  // ← 新增: 标准化后的 q,用于全文检索
  aStandardized,  // ← 新增: 标准化后的 a,用于全文检索
  session,
  ...
}: InsertData2DatasetParams) {
  // 1. 生成向量并插入 MongoDB
  const insertResult = await insertDatasetDataVector({
    inputs: indexes.map(index => index.text),  // ← 已标准化
    model: getEmbeddingModel(vectorModel),
    teamId, datasetId, collectionId
  });

  // 更新 indexes 的 dataId
  const finalIndexes = indexes.map((index, i) => ({
    ...index,
    dataId: insertResult.insertIds[i]
  }));

  // 2. 插入 dataset_data (q/a 保持原文)
  const newData = await MongoDatasetData.create([{
    teamId,
    datasetId,
    collectionId,
    q,  // ← 原文不变
    a,  // ← 原文不变
    indexes: finalIndexes,
    skipSynonymStandardize,
    ...
  }], { session });

  const dataId = newData[0]._id;

  // 3. ✅ 生成全文检索 token (使用标准化后的 q/a)
  const fullTextQ = qStandardized || q;
  const fullTextA = aStandardized || a;
  const fullText = fullTextA ? `${fullTextQ}\n${fullTextA}` : fullTextQ;
  const fullTextToken = await jiebaSplit({ text: fullText });

  await MongoDatasetDataText.create([{
    dataId,
    teamId,
    datasetId,
    collectionId,
    fullTextToken
  }], { session });

  return {
    tokens: insertResult.tokens,
    insertId: dataId
  };
}
```

---

## 8. 优势总结

### 8.1 与独立队列方案对比

| 维度 | 独立队列方案 | 复用 dataset_trainings |
|-----|-------------|----------------------|
| **架构一致性** | ❌ 引入新表,架构分化 | ✅ 保持现有架构一致 |
| **代码复用** | ❌ 需要新 Worker 逻辑 | ✅ 复用 generateVector Worker |
| **前端展示** | ❌ 需要新 UI 入口 | ✅ 统一在训练状态显示 |
| **重试机制** | ❌ 需要新实现 | ✅ 复用现有重试逻辑 |
| **进度展示** | ❌ 需要新接口 | ✅ 复用现有聚合统计 |
| **费用计算** | 需要集成 | ✅ 无缝集成现有机制 |
| **实现复杂度** | 高 (新建表、Worker、API、UI) | ✅ 低 (扩展 mode + 处理器) |
| **维护成本** | 高 (多套系统) | ✅ 低 (统一维护) |

### 8.2 核心优势

1. ✅ **架构一致** - 所有 dataset 级别批量操作统一使用 `dataset_trainings`
2. ✅ **实现简单** - 只需扩展 mode 和添加处理器,无需新表/新 Worker
3. ✅ **前端统一** - 用户在同一个"训练状态"弹窗查看所有批量操作
4. ✅ **重试便捷** - 失败任务自动显示在"训练错误"标签页,支持重试
5. ✅ **费用透明** - 复用现有 billing 机制,费用计算无缝集成
6. ✅ **维护简单** - 单一系统,修改影响范围可控
7. ✅ **并发安全** - 通过业务互斥避免复杂并发场景,逻辑清晰可靠

---

## 9. 实现步骤

### Phase 1: 基础扩展 (预计1天)
1. [ ] 扩展 `TrainingModeEnum`,添加 `synonymStandardize` 和 `synonymRestore`
2. [ ] 修改 `DatasetDataSchemaType`,添加 `synonymProcessing` 和 `synonymFileIds` 字段
3. [ ] 修改 `DatasetDataIndexItemType`,添加 `synonymMetadata` 字段
4. [ ] 添加前端 i18n 翻译

### Phase 2: 上传/删除接口改造 (预计1天)
5. [ ] 修改 `uploadSynonymFile`,添加训练任务检查 + 实现数据标记 + 初始任务创建
6. [ ] 修改 `deleteSynonymFile`,添加训练任务检查 + 实现恢复流程
7. [ ] (可选) 实现 `updateSynonymFile` 更新流程 (同样需要训练任务检查)
8. [ ] 添加反向检查:在所有训练入口检查同义词任务
   - `pushDataListToTrainingQueue` 统一检查
   - 文件上传 API 添加检查
   - 手动新增数据 API 添加检查

### Phase 3: Worker 实现 (预计2天)
9. [ ] 扩展 `generateVector.ts`,添加 mode 路由
10. [ ] 实现 `processSynonymStandardize` 处理器
11. [ ] 实现 `processSynonymRestore` 处理器
12. [ ] 实现链式处理逻辑 (查找下一条 + 创建任务)

### Phase 4: 实时标准化 (预计1天)
13. [ ] 实现 `realtimeSynonymStandardize` 工具函数
14. [ ] 集成到 `insertData` 中
15. [ ] 修改手动新增数据 API,支持 `applySynonym` 参数

### Phase 5: 前端展示与交互 (预计0.5天)
16. [ ] 扩展 `TrainingStates.tsx` 的 `TrainingText` 映射
17. [ ] 测试训练状态显示是否正常
18. [ ] 添加同义词操作被拒绝时的友好提示
19. [ ] 添加训练操作被拒绝时的友好提示

### Phase 6: 测试与优化 (预计1.5天)
20. [ ] 单元测试 (各场景覆盖,包括双向互斥)
21. [ ] 集成测试 (与 embedding 切换对比验证)
22. [ ] 性能测试 (大数据量场景)
23. [ ] 并发互斥测试 (验证双向检查有效性)

---

## 10. 风险与注意事项

### 10.1 并发控制 - 训练任务互斥

**核心策略**: 简化并发处理,通过业务限制避免复杂的并发场景

**实现方案**:
```typescript
// 在上传/更新/删除同义词时,检查是否有正在进行的训练任务
const hasTrainingTask = await MongoDatasetTraining.exists({
  teamId: new Types.ObjectId(teamId),
  datasetId: new Types.ObjectId(datasetId)
});

if (hasTrainingTask) {
  throw new Error('知识库正在训练中,请等待训练完成后再操作同义词');
}
```

**业务规则**:
1. ✅ **训练期间禁止同义词操作** - 有任何训练任务(chunk/qa/hype等)时,禁止上传/更新/删除同义词
2. ✅ **同义词处理期间禁止训练** - 有同义词标准化/恢复任务时,新的训练任务创建会被拒绝
3. ✅ **前端交互优化** - 检测到冲突时,前端显示明确的等待提示和当前进度

**反向检查实现**:
```typescript
// 在创建训练任务前检查是否有同义词处理任务
// 例如: 文件上传、手动触发训练等入口
const hasSynonymTask = await MongoDatasetTraining.exists({
  teamId: new Types.ObjectId(teamId),
  datasetId: new Types.ObjectId(datasetId),
  mode: {
    $in: [TrainingModeEnum.synonymStandardize, TrainingModeEnum.synonymRestore]
  }
});

if (hasSynonymTask) {
  throw new Error('知识库正在进行同义词处理,请等待处理完成后再训练');
}
```

**需要添加检查的训练入口**:

1. **文件上传 API** (`/api/core/dataset/collection/create/upload`)
   ```typescript
   // projects/app/src/pages/api/core/dataset/collection/create/upload.ts

   async function handler(req: ApiRequestProps<UploadDataProps>) {
     const { datasetId, collectionId, ... } = req.body;

     // ✅ 添加同义词处理检查
     const hasSynonymTask = await MongoDatasetTraining.exists({
       teamId: req.user.teamId,
       datasetId: new Types.ObjectId(datasetId),
       mode: {
         $in: [TrainingModeEnum.synonymStandardize, TrainingModeEnum.synonymRestore]
       }
     });

     if (hasSynonymTask) {
       throw new Error('知识库正在进行同义词处理,请等待处理完成后再上传文件');
     }

     // ... 继续原有逻辑
   }
   ```

2. **手动新增数据 API** (`/api/core/dataset/data/insert`)
   ```typescript
   // projects/app/src/pages/api/core/dataset/data/insert.ts

   async function handler(req: ApiRequestProps<InsertDataProps>) {
     // ✅ 用户手动添加数据: 默认标记为跳过同义词标准化,不受同义词处理影响
     // 无需检查同义词任务,允许用户随时添加自定义数据

     const { datasetId, collectionId, q, a, ... } = req.body;

     // 调用数据插入,标记为用户自定义
     await insertData2Dataset({
       teamId: req.user.teamId,
       tmbId: req.user.tmbId,
       datasetId,
       collectionId,
       q,
       a,
       skipSynonymStandardize: true,  // ← 用户自定义数据默认跳过
       ...
     });

     // ... 继续原有逻辑
   }
   ```

3. **QA拆分训练** (在 `pushDataListToTrainingQueue` 中统一处理)
   ```typescript
   // packages/service/core/dataset/training/controller.ts

   export async function pushDataListToTrainingQueue({
     teamId,
     tmbId,
     datasetId,
     collectionId,
     agentModel,
     trainingMode,
     ...
   }: PushDataListToTrainingQueueProps) {
     // ✅ 在创建训练任务前检查
     const hasSynonymTask = await MongoDatasetTraining.exists({
       teamId: new Types.ObjectId(teamId),
       datasetId: new Types.ObjectId(datasetId),
       mode: {
         $in: [TrainingModeEnum.synonymStandardize, TrainingModeEnum.synonymRestore]
       }
     });

     if (hasSynonymTask) {
       throw new Error('知识库正在进行同义词处理,请等待处理完成后再训练');
     }

     // ... 继续创建训练任务
   }
   ```

4. **增强索引生成** (hype/small2Big等)
   - 这些任务也通过 `pushDataListToTrainingQueue` 创建
   - 上述统一检查已覆盖

**前端提示设计**:

1. **上传同义词时的提示**
   ```tsx
   // 同义词设置页面
   const handleUploadSynonym = async () => {
     try {
       await uploadSynonymFile({ ... });
     } catch (error) {
       if (error.message.includes('正在训练中')) {
         toast({
           status: 'warning',
           title: '知识库正在训练中',
           description: '请等待当前训练任务完成后再上传同义词文件',
           action: (
             <Button onClick={() => router.push('/dataset/training')}>
               查看训练进度
             </Button>
           )
         });
       }
     }
   };
   ```

2. **上传文件时的提示**
   ```tsx
   // 文件上传页面
   const handleUploadFile = async () => {
     try {
       await uploadFile({ ... });
     } catch (error) {
       if (error.message.includes('正在进行同义词处理')) {
         toast({
           status: 'warning',
           title: '同义词正在处理中',
           description: '请等待同义词处理完成后再上传文件',
           action: (
             <Button onClick={() => router.push('/dataset/training')}>
               查看处理进度
             </Button>
           )
         });
       }
     }
   };
   ```

**双向互斥的具体场景分析**:

| 场景 | 时间线 | 处理方式 |
|-----|-------|---------|
| **场景1: 训练期间上传同义词** | T0: 用户上传文件,创建chunk训练任务<br>T1: 用户上传同义词文件 | ❌ 拒绝: "知识库正在训练中,请等待训练完成" |
| **场景2: 同义词处理期间上传文件** | T0: 用户上传同义词,创建标准化任务<br>T1: 用户上传新文件 | ❌ 拒绝: "知识库正在进行同义词处理,请等待处理完成" |
| **场景3: 同义词处理期间手动添加数据** | T0: 同义词标准化进行中<br>T1: 用户手动添加分片 | ✅ 允许: 用户自定义数据标记 `skipSynonymStandardize=true`,不受影响 |
| **场景4: 同义词处理期间触发QA拆分** | T0: 同义词标准化进行中<br>T1: 用户触发QA拆分训练 | ❌ 拒绝: "知识库正在进行同义词处理,请等待处理完成" |
| **场景5: 同义词处理期间触发Hype索引** | T0: 同义词标准化进行中<br>T1: 系统/用户触发Hype增强索引 | ❌ 拒绝: "知识库正在进行同义词处理,请等待处理完成" |

**为什么需要双向互斥**:

1. **方向1: 训练期间禁止同义词操作**
   - **原因**: 避免同义词处理遗漏新训练的数据
   - **问题**: 如果允许,同义词队列标记数据时,训练队列可能正在创建新数据,导致新数据被遗漏
   - **解决**: 等训练完成,所有数据都入库后,再统一标准化

2. **方向2: 同义词处理期间禁止训练**
   - **原因**: 确保数据语义一致性,避免基于未标准化内容生成增强索引
   - **问题**: 如果允许训练,Hype等增强索引可能基于未标准化的 q/a 生成,导致主数据和增强索引语义不一致
   - **解决**: 等同义词处理完成,所有数据标准化后,再进行训练

**优势**:
- ✅ **逻辑简单** - 避免复杂的并发控制和状态管理
- ✅ **数据安全** - 完全避免训练和同义词处理的数据冲突
- ✅ **语义一致** - 确保增强索引基于标准化后的内容生成
- ✅ **用户体验好** - 明确的提示信息,用户知道需要等待
- ✅ **易于实现** - 只需要简单的 exists 查询,无需复杂的锁机制

### 10.2 用户数据保护

**关键点**:
- `skipSynonymStandardize: true` 的数据**永不处理**
- 用户自定义数据**默认不标准化** (需用户主动开启)
- 直连数据库类型知识库**不做标准化**

### 10.3 向量 dataId 变化

**问题**: 向量更新采用"先删后插",dataId 会变化

**解决方案**:
- Worker 处理时使用 session 保证原子性
- 先插入新向量获取 insertIds
- 再更新 MongoDB 的 indexes 数组
- 最后删除旧向量

### 10.4 全文检索一致性

**关键点**:
- q/a 字段存储原文 (用户可见)
- fullTextToken 使用标准化后的 q/a 生成 (检索用)
- 确保每次更新 indexes 时同步更新 fullTextToken

### 10.5 费用计算

**实现**:
```typescript
if (tokens > 0) {
  pushGenerateVectorUsage({
    teamId: data.teamId,
    tmbId: data.tmbId,
    inputTokens: tokens,
    model: data.dataset.vectorModel,
    billId: data.billId
  });
}
```

---

## 11. 智能合并方案详解 (v3.0 核心优化)

### 11.1 问题场景

**用户操作序列**:
1. T0: 用户删除同义词 → 触发恢复流程
2. T1: 恢复进行中，部分数据已恢复为原文
3. T2: 用户上传新的同义词文件

**传统方案问题**:
- 必须等待恢复完成才能上传新同义词
- 用户体验差：需要等待两次处理（先恢复，再标准化）
- 性能浪费：恢复的数据马上又要标准化

### 11.2 智能合并核心思路

**关键洞察**: 既然最终目标是应用新同义词，恢复到原文只是中间状态，可以直接跳过。

**处理策略**:
```
传统方案:  旧同义词 → 原文 → 新同义词  (两次处理)
智能合并:  旧同义词 → 新同义词        (一次处理)
```

### 11.3 数据一致性保证

#### 保证机制

1. **MongoDB 事务**
   - 所有关键操作在 `mongoSessionRun` 事务中执行
   - 要么全部成功，要么全部回滚
   - 保证原子性

2. **处理所有可能状态**
   ```typescript
   // 状态1: 恢复任务队列中的任务
   await MongoDatasetTraining.updateMany(
     { mode: TrainingModeEnum.synonymRestore },
     { $set: { mode: TrainingModeEnum.synonymStandardize } }
   );

   // 状态2: 带恢复标记的数据
   await MongoDatasetData.updateMany(
     { synonymProcessing: 'restore' },
     { $set: { synonymProcessing: 'standardize' } }
   );

   // 状态3: 已完成恢复的数据（原文状态）
   const restoredData = await MongoDatasetData.find({
     'indexes.synonymMetadata': { $exists: false }
   });
   // 为这些数据创建标准化任务

   // 状态4: 包含其他同义词的数据
   const complexData = await MongoDatasetData.find({
     'indexes.synonymMetadata.synonymFileIds': { $ne: [] }
   });
   // 标记需要完整重处理
   ```

3. **Worker 幂等性**
   ```typescript
   // Worker 检查数据当前状态
   const currentData = await MongoDatasetData.findById(dataId);
   if (!currentData) {
     // 数据已被删除，跳过
     return;
   }

   // 根据实际状态决定处理方式
   const hasExistingSynonyms = currentData.indexes.some(
     idx => idx.synonymMetadata
   );
   ```

4. **链式处理确保完整性**
   - Worker 处理完一条数据后，在同一事务中查找下一条
   - 确保所有标记的数据最终都会被处理

#### 数据状态转换图

```
恢复流程中上传新同义词 (智能合并触发)
├─ 队列中的恢复任务 → 转为标准化任务 ✓
├─ 带恢复标记的数据 → 改为标准化标记 ✓
├─ 已恢复的数据(原文) → 创建标准化任务 ✓
├─ 包含其他同义词的数据 → 标记完整重处理 ✓
└─ 最终状态: 所有数据应用新同义词 ✓
```

### 11.4 并发场景分析

| 时间点 | Worker 正在处理 | 智能合并操作 | 结果 |
|--------|----------------|-------------|------|
| T0 | 恢复任务A (数据1) | - | 正常恢复 |
| T1 | 恢复任务B (数据2) | 用户上传新同义词 | 触发智能合并 |
| T2 | 任务B完成恢复 | 事务已转换任务C为标准化 | 数据2恢复为原文 |
| T3 | 获取下一个任务 | - | 获取到任务C（已转为标准化） |
| T4 | 标准化任务C (数据3) | - | 应用新同义词 ✓ |
| T5 | 为数据2创建标准化任务 | - | 数据2应用新同义词 ✓ |

**关键点**:
- 即使在合并时有 Worker 正在处理恢复任务，最终也会通过创建新的标准化任务确保数据一致
- 事务保证操作的原子性，不会出现中间状态

### 11.5 优势总结

**v3.0 智能合并 vs v2.0 传统方案**:

| 维度 | 传统方案 | 智能合并方案 (v3.0) |
|-----|---------|-------------------|
| **用户体验** | ❌ 必须等待恢复完成 | ✅ 立即开始应用新同义词 |
| **处理次数** | ❌ 两次（恢复+标准化） | ✅ 一次（直接标准化） |
| **性能** | ❌ 双倍向量计算 | ✅ 节省50%向量计算 |
| **费用** | ❌ 双倍费用 | ✅ 节省50%费用 |
| **数据一致性** | ✅ 保证 | ✅ 保证（事务+幂等） |
| **实现复杂度** | ✅ 简单 | ⚠️ 中等 |

### 11.6 实施建议

1. **测试优先**
   ```typescript
   // 建议的测试场景
   - 恢复刚开始时上传新同义词
   - 恢复进行到一半时上传新同义词
   - 恢复即将完成时上传新同义词
   - 大数据量场景（10万+数据）
   - 多个同义词文件的复杂场景
   ```

2. **监控指标**
   ```typescript
   - 任务转换成功率
   - 数据处理完整性
   - 事务成功率
   - 平均处理时间
   - 向量计算成本节省
   ```

3. **降级策略**
   ```typescript
   // 如果智能合并出现问题，可以快速切换回传统方案
   const USE_SMART_MERGE = process.env.ENABLE_SMART_MERGE === 'true';

   if (hasRestoreTasks) {
     if (USE_SMART_MERGE) {
       return await smartMergeRestoreToStandardize(...);
     } else {
       throw new Error('请等待恢复完成后再上传');
     }
   }
   ```

4. **日志记录**
   ```typescript
   logger.info('Smart merge triggered', {
     teamId,
     datasetId,
     convertedTasks: result.convertedTasks,
     convertedData: result.convertedData,
     newTasks: result.newStandardizeTasks
   });
   ```

---

## 12. 总结

本方案通过**复用 `dataset_trainings`** 实现同义词数据标准化,遵循 FastGPT 现有架构模式:

1. ✅ **借鉴成功案例** - embedding 模型切换已证明此模式可行
2. ✅ **保持架构一致** - 所有 dataset 级别批量操作统一使用 `dataset_trainings`
3. ✅ **实现简单高效** - 扩展 mode + 添加处理器,无需新表新系统
4. ✅ **用户体验良好** - 统一的训练状态展示,便捷的重试机制
5. ✅ **数据100%安全** - q/a 字段永不修改,用户数据完全保护
6. ✅ **智能优化 (v3.0)** - 恢复中上传新同义词自动合并,节省50%处理时间和费用

**核心变更**:
- q/a 字段: ✅ 保持原文不变
- indexes[].text: ⚠️ 存储标准化后的文本
- fullTextToken: ✅ 使用标准化后的 q/a 生成
- 向量: ✅ 基于标准化后的 indexes 生成

**v3.0 新增**:
- 智能合并机制: 恢复过程中上传新同义词自动转换为标准化
- 数据一致性: MongoDB 事务 + Worker 幂等性保证
- 性能优化: 节省50%向量计算和费用
- 用户体验: 无需等待,立即应用新同义词

相比独立队列方案,复用方案实现更简单、架构更统一、维护更便捷。

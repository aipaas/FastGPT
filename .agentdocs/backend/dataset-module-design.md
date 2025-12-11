# 知识库(Dataset)模块设计文档

本文档记录知识库模块的架构设计、数据模型和开发规范，供新增相关功能时参考。

## 1. 模块层级结构

知识库采用三层级体系架构：

```
Dataset (知识库)
    ├── Collection (文件集合)
    │   └── Data (知识碎片)
```

**关系说明**：
- Dataset 1:N Collection：一个知识库包含多个集合
- Collection 1:N Data：一个集合包含多个数据项
- 支持文件夹嵌套：Dataset 和 Collection 都可以有 parentId

## 2. 目录结构

### 2.1 API 路由
```
projects/app/src/pages/api/core/dataset/
├── create.ts              # 创建知识库
├── list.ts                # 列表查询
├── detail.ts              # 详情查询
├── update.ts              # 更新
├── delete.ts              # 删除
├── paths.ts               # 获取路径
├── searchTest.ts          # 搜索测试
├── collection/            # 集合操作
│   ├── create.ts          # 创建集合（主入口）
│   ├── create/            # 各类型创建处理
│   │   ├── text.ts
│   │   ├── link.ts
│   │   └── ...
│   ├── list.ts
│   ├── detail.ts
│   ├── update.ts
│   └── delete.ts
├── data/                  # 数据项操作
│   ├── list.ts
│   ├── detail.ts
│   ├── update.ts
│   ├── delete.ts
│   └── insertData.ts
└── training/              # 训练队列
```

### 2.2 服务层
```
packages/service/core/dataset/
├── schema.ts              # Dataset MongoDB Schema
├── controller.ts          # 业务控制器
├── collection/
│   ├── schema.ts
│   └── controller.ts
├── data/
│   ├── schema.ts
│   └── controller.ts
├── training/
│   └── schema.ts
└── search/
    └── controller.ts
```

### 2.3 全局类型
```
packages/global/core/dataset/
├── type.d.ts              # 核心类型定义
├── constants.ts           # 常量和枚举
├── api.d.ts               # API 请求/响应类型
└── collection/
    └── constants.ts
```

## 3. 数据模型

### 3.1 Dataset (知识库)
**集合名**: `datasets`

```typescript
type DatasetSchemaType = {
  _id: string;
  parentId: ParentIdType;        // 父级（支持嵌套）
  teamId: string;                // 团队ID（必填）
  tmbId: string;                 // 创建者团队成员ID

  name: string;
  intro: string;
  avatar: string;
  type: DatasetTypeEnum;         // dataset|folder|websiteDataset|apiDataset|database|...

  vectorModel: string;           // 向量模型
  agentModel: string;            // LLM 模型
  vlmModel?: string;             // 视觉模型

  chunkSettings?: ChunkSettingsType;  // 分块设置
  inheritPermission: boolean;    // 是否继承权限

  updateTime: Date;
};
```

**索引**：
- `{ teamId: 1 }` - 团队知识库列表
- `{ type: 1 }` - 类型过滤

### 3.2 DatasetCollection (集合)
**集合名**: `dataset_collections`

```typescript
type DatasetCollectionSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  datasetId: string;             // 所属知识库
  parentId?: string;             // 父级集合

  name: string;
  type: DatasetCollectionTypeEnum;  // file|link|folder|...
  tags?: string[];

  fileId?: string;               // 本地文件ID
  rawLink?: string;              // 链接URL

  trainingType: DatasetCollectionDataProcessModeEnum;
  chunkSize?: number;

  createTime: Date;
  updateTime: Date;
};
```

### 3.3 DatasetData (数据项)
**集合名**: `dataset_datas`

```typescript
type DatasetDataSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;

  q: string;                     // 主内容
  a?: string;                    // 辅助内容
  chunkIndex: number;

  indexes: DatasetDataIndexItemType[];  // 向量索引
  fullTextToken: string;         // 全文检索token

  updateTime: Date;
};
```

## 4. 权限控制

### 4.1 认证函数

```typescript
// 知识库认证
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

const { dataset, permission, teamId, tmbId } = await authDataset({
  req,
  authToken: true,
  authApiKey: true,
  datasetId,
  per: ReadPermissionVal
});

// 集合认证（继承知识库权限）
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';

const { collection, permission } = await authDatasetCollection({
  req,
  authToken: true,
  collectionId,
  per: WritePermissionVal
});

// 数据项认证（继承集合权限）
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';

const { datasetData, collection } = await authDatasetData({
  req,
  authToken: true,
  dataId,
  per: WritePermissionVal
});
```

### 4.2 权限继承链
```
Dataset -> Collection -> Data
   ↓           ↓          ↓
权限定义   继承Dataset  继承Collection
```

### 4.3 条件认证模式
创建资源时根据是否有 parentId 选择认证方式：

```typescript
const { teamId, tmbId } = parentId
  ? await authDataset({
      req,
      datasetId: parentId,
      authToken: true,
      per: WritePermissionVal
    })
  : await authUserPer({
      req,
      authToken: true,
      per: TeamDatasetCreatePermissionVal
    });
```

## 5. API 实现模式

### 5.1 创建操作
```typescript
// POST /api/core/dataset/create
async function handler(req: ApiRequestProps<CreateBody>): Promise<string> {
  const { parentId, name, ... } = req.body;

  // 1. 条件认证
  const { teamId, tmbId, userId } = parentId
    ? await authDataset({ req, datasetId: parentId, per: WritePermissionVal, ... })
    : await authUserPer({ req, per: TeamDatasetCreatePermissionVal, ... });

  // 2. 配额检查
  await checkTeamDatasetLimit(teamId);

  // 3. 事务创建
  const datasetId = await mongoSessionRun(async (session) => {
    const [{ _id }] = await MongoDataset.create([{...}], { session });
    return _id;
  });

  // 4. 异步追踪和审计
  pushTrack.createDataset({ ... });
  (async () => { addAuditLog({ ... }); })();

  return datasetId;
}
```

### 5.2 详情查询
```typescript
// GET /api/core/dataset/detail?id=xxx
async function handler(req: ApiRequestProps<Query>): Promise<DatasetItemType> {
  const { id: datasetId } = req.query;

  if (!datasetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { dataset, permission } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: ReadPermissionVal
  });

  return { ...dataset, permission };
}
```

### 5.3 删除操作
```typescript
// DELETE /api/core/dataset/delete
async function handler(req: ApiRequestProps) {
  const { id } = req.query;

  // 删除需要 Owner 权限
  const { dataset, teamId, tmbId } = await authDataset({
    req,
    authToken: true,
    datasetId: id,
    per: OwnerPermissionVal
  });

  // 级联删除相关数据
  await mongoSessionRun(async (session) => {
    await MongoDatasetCollection.deleteMany({ datasetId: id }, { session });
    await MongoDatasetData.deleteMany({ datasetId: id }, { session });
    await MongoDataset.deleteOne({ _id: id }, { session });
  });

  // 审计日志
  (async () => { addAuditLog({ ... }); })();
}
```

## 6. 新增 1:1 关联模块设计指南

以"训练集"模块为例，与知识库 1:1 关系：

### 6.1 数据模型设计
```typescript
// packages/global/core/trainset/type.d.ts
type TrainsetSchemaType = {
  _id: string;
  datasetId: string;           // 关联的知识库ID（1:1关系，唯一索引）
  teamId: string;
  tmbId: string;

  name: string;
  description?: string;
  // ... 其他字段

  createTime: Date;
  updateTime: Date;
};

// Schema 定义
const TrainsetSchema = new Schema({
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    required: true,
    unique: true  // 1:1 关系，确保唯一
  },
  // ...
});

// 索引
TrainsetSchema.index({ datasetId: 1 }, { unique: true });
TrainsetSchema.index({ teamId: 1 });
```

### 6.2 权限认证设计
复用知识库权限，不需要独立权限表：

```typescript
// packages/service/support/permission/trainset/auth.ts
export async function authTrainset({
  trainsetId,
  per,
  ...props
}: AuthModeType & {
  trainsetId: string;
  per: PermissionValueType;
}) {
  const trainset = await MongoTrainset.findById(trainsetId);
  if (!trainset) {
    return Promise.reject(TrainsetErrEnum.unExist);
  }

  // 复用知识库权限
  const result = await authDataset({
    ...props,
    datasetId: trainset.datasetId,
    per
  });

  return {
    ...result,
    trainset
  };
}

// 通过 datasetId 认证
export async function authTrainsetByDatasetId({
  datasetId,
  per,
  ...props
}: AuthModeType & {
  datasetId: string;
  per: PermissionValueType;
}) {
  const result = await authDataset({ ...props, datasetId, per });

  const trainset = await MongoTrainset.findOne({ datasetId });

  return { ...result, trainset };
}
```

### 6.3 API 路由结构
```
projects/app/src/pages/api/core/dataset/trainset/
├── create.ts          # 创建训练集（需要知识库写权限）
├── detail.ts          # 获取详情（需要知识库读权限）
├── update.ts          # 更新（需要知识库写权限）
├── delete.ts          # 删除（需要知识库管理权限）
└── item/              # 训练集条目
    ├── list.ts
    ├── create.ts
    ├── update.ts
    └── delete.ts
```

### 6.4 创建 API 示例
```typescript
// POST /api/core/dataset/trainset/create
export type CreateTrainsetBody = {
  datasetId: string;
  name: string;
  description?: string;
};

async function handler(req: ApiRequestProps<CreateTrainsetBody>) {
  const { datasetId, name, description } = req.body;

  if (!datasetId || !name) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 认证知识库写权限
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: WritePermissionVal
  });

  // 检查是否已存在
  const existing = await MongoTrainset.findOne({ datasetId });
  if (existing) {
    return Promise.reject(TrainsetErrEnum.alreadyExist);
  }

  // 创建训练集
  const [{ _id }] = await MongoTrainset.create([{
    datasetId,
    teamId,
    tmbId,
    name,
    description
  }]);

  return String(_id);
}
```

### 6.5 级联删除处理
知识库删除时需要级联删除关联的训练集：

```typescript
// 在 dataset/delete.ts 或 dataset/controller.ts 中
await mongoSessionRun(async (session) => {
  // 删除关联的训练集
  await MongoTrainset.deleteOne({ datasetId }, { session });
  // 删除训练集条目
  await MongoTrainsetItem.deleteMany({ datasetId }, { session });
  // ... 其他删除操作
});
```

## 7. 关键设计模式总结

| 模式 | 说明 |
|-----|------|
| 权限继承 | 子资源继承父资源权限，通过 `inheritPermission` 控制 |
| 条件认证 | 有 parentId 认证父资源，无则认证用户团队权限 |
| 事务处理 | 多表操作使用 `mongoSessionRun` 保证原子性 |
| 异步审计 | 审计日志异步执行，不阻塞响应 |
| 级联删除 | 删除父资源时级联删除所有子资源 |
| 1:1 关联 | 使用 unique 索引确保关系，复用主资源权限 |

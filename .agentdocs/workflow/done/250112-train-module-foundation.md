# Workflow: 训练模块基础设施搭建

**任务ID**: 250112-train-module-foundation
**创建时间**: 2025-01-12
**完成时间**: 2025-01-12
**状态**: 已完成
**依赖**: 无
**后续**: 250112-train-module-external-mocks

## 任务目标

搭建 Rerank 训练模块的基础设施，包括全局类型定义、常量、枚举和错误码。这是整个训练模块开发的基石。

## 背景说明

根据设计文档，训练模块采用两层架构：
- **层级1**：知识库训练集（内部缓存）
- **层级2**：应用训练集（对外暴露）

本阶段创建所有模块通用的基础类型和配置，为后续开发提供类型安全保障。

## 实施方案

### 1. 目录结构
```
packages/global/core/train/
└── rerank/
    ├── type.d.ts              # Rerank 训练核心类型
    ├── constants.ts           # 常量和枚举
    └── api.d.ts               # API 请求/响应类型

packages/global/common/error/code/
└── train.ts                   # 训练模块错误码
```

### 2. 核心类型定义

#### 2.1 训练集状态枚举
```typescript
// packages/global/core/train/rerank/constants.ts

/** 知识库训练集状态 */
export enum DatasetTrainsetStatusEnum {
  idle = 'idle',                   // 空闲（无数据）
  generating = 'generating',       // 生成中
  ready = 'ready',                 // 就绪
  error = 'error'                  // 错误
}

/** 应用训练集状态 */
export enum RerankTrainsetStatusEnum {
  idle = 'idle',                   // 空闲（无数据）
  composing = 'composing',         // 组装中（从知识库拷贝数据）
  ready = 'ready',                 // 就绪
  error = 'error'                  // 错误
}

/** 训练数据来源 */
export enum TrainDataSourceEnum {
  dataset = 'dataset',             // 从知识库拷贝
  manual = 'manual'                // 手动添加
  // 注意：chat_log 预留但不实现
}

/** 训练任务状态 */
export enum RerankTrainTaskStatusEnum {
  pending = 'pending',
  running = 'running',
  completed = 'completed',
  failed = 'failed',
  cancelled = 'cancelled'
}

/** 训练任务检查点阶段 */
export enum RerankTaskCheckpointStageEnum {
  preparing = 'preparing',
  finetuning = 'finetuning',      // 模型微调（AICP执行微调并自动部署）
  registering = 'registering',    // 模型注册（在FastGPT中注册配置）
  evaluating = 'evaluating'
}
```

#### 2.2 Schema 类型定义
```typescript
// packages/global/core/train/rerank/type.d.ts

/** 知识库训练集 Schema 类型 */
export type DatasetTrainsetSchemaType = {
  _id: string;
  datasetId: string;               // 1:1 关系，唯一索引
  teamId: string;

  name: string;                    // 自动生成：`${datasetName} - 训练集`

  // 统计信息
  dataCount: number;               // 训练数据总数

  // 状态
  status: `${DatasetTrainsetStatusEnum}`;
  errorMsg?: string;

  // 生成配置（记录用）
  generationConfig?: {
    sampleSize: number;
    queryCount: number;
    negativeCount: number;
    model: string;
  };

  createTime: Date;
  updateTime: Date;
};

/** 知识库训练数据 Schema 类型 */
export type DatasetTrainsetDataSchemaType = {
  _id: string;
  trainsetId: string;              // 所属知识库训练集
  datasetId: string;               // 冗余，便于查询
  teamId: string;

  // Rerank 训练数据格式
  queries: string[];               // 查询变体
  positiveDocs: string[];          // 正样本文档
  negativeDocs: string[];          // 负样本文档

  // 元数据
  metadata: {
    dataIds: string[];             // 来源数据分片ID
    generationConfig: {
      model: string;
      temperature: number;
    };
    generatedAt: Date;
  };

  createTime: Date;
};

/** 应用训练集 Schema 类型 */
export type RerankTrainsetSchemaType = {
  _id: string;
  appId: string;                   // 1:1 关系，唯一索引
  teamId: string;
  tmbId: string;                   // 创建者

  name: string;                    // 自动生成：`${appName} - 训练集`
  description?: string;

  // 来源统计（记录数据来源分布）
  sourceSummary: Array<{
    type: 'dataset' | 'manual';    // 注意：不包含 chat_log
    datasetId?: string;
    datasetName?: string;
    count: number;
  }>;

  // 统计信息
  dataCount: number;               // 总数据量
  positiveCount: number;           // 正样本数
  negativeCount: number;           // 负样本数

  // 状态
  status: `${RerankTrainsetStatusEnum}`;
  errorMsg?: string;

  createTime: Date;
  updateTime: Date;
};

/** 应用训练数据 Schema 类型 */
export type RerankTrainsetDataSchemaType = {
  _id: string;
  trainsetId: string;              // 所属应用训练集
  appId: string;                   // 冗余，便于查询和权限
  teamId: string;

  // Rerank 训练数据格式
  queries: string[];               // 查询变体
  positiveDocs: string[];          // 正样本文档
  negativeDocs: string[];          // 负样本文档

  // 数据来源
  source: `${TrainDataSourceEnum}`;

  // 元数据
  metadata: {
    sourceInfo: {
      // 来自知识库（拷贝）
      datasetTrainsetDataId?: string;  // 溯源：原始知识库训练数据ID
      datasetId?: string;
      datasetName?: string;
      dataIds?: string[];                // 具体数据分片ID

      // 手动添加
      manualInfo?: {
        creator: string;
        createdAt: Date;
        reason?: string;
      };

      // 注意：chatLogInfo 预留但不使用
    };

    // 生成配置（如果来自知识库）
    generationConfig?: {
      model: string;
      temperature: number;
    };
  };

  createTime: Date;
};

/** 训练任务 Schema 类型 */
export type RerankTrainTaskSchemaType = {
  _id: string;
  appId: string;                   // 关联的应用
  teamId: string;
  tmbId: string;                   // 发起者

  name: string;                    // 任务名称
  baseModelConfigId: string;       // 当前应用rerank模型在FastGPT的模型配置ID（任务创建时从App工作流提取）
  baseModelEndpoint: {             // 当前应用rerank模型的 endpoint 信息（任务创建时从模型配置提取）
    ip: string;
    port: string;
    model: string;
    api_key: string;
  };

  // 任务状态
  status: `${RerankTrainTaskStatusEnum}`;

  // 检查点数据（用于断点续跑，按阶段组织）
  checkpoint: {
    stage: `${RerankTaskCheckpointStageEnum}` | null;  // null 表示未开始
    data?: {
      // 阶段1: 数据准备
      preparing?: {
        trainDatasetIds: string[];          // 训练数据集ID列表
        trainDatasetFilePath: string;       // JSONL 数据集文件路径
      };

      // 阶段2: 模型微调
      finetuning?: {
        aicpTaskId: string;                 // AICP 训推平台任务ID
        tunedModelEndpoint: {               // AICP 返回的微调后模型 endpoint 信息
          ip: string;
          port: string;
          model: string;
          api_key: string;
        };
      };

      // 阶段3: 模型注册
      registering?: {
        tunedModelConfigId: string;         // 微调后模型注册到FastGPT的模型配置标识
      };

      // 阶段4: 效果评测（拆分为 4 个子步骤，支持细粒度断点续传）
      evaluating?: {
        baseModelEvalDatasetId?: string;     // 子步骤1: 基于基础模型-知识库搜索节点生成的评估测试集ID
        tunedModelEvalDatasetId?: string;    // 子步骤2: 基于微调模型-知识库搜索节点生成的评估测试集ID
        baseModelEvalResult?: Record<string, any>;   // 子步骤3: 基础模型评测结果
        tunedModelEvalResult?: Record<string, any>;  // 子步骤4: 微调模型评测结果
      };
    };
    stageStartTime?: {
      preparing?: Date;
      finetuning?: Date;
      registering?: Date;
      evaluating?: Date;
    };
  };

  // 训练结果（最终结果，用于展示）
  result?: {
    trainDatasetIds: string[];
    trainDatasetFilePath: string;
    tunedModelConfigId: string;
    baseModelEvalDatasetId: string;
    tunedModelEvalDatasetId: string;
    baseModelEvalResult: Record<string, any>;
    tunedModelEvalResult: Record<string, any>;
  };

  // 错误信息
  errorMsg?: string;
  retryCount: number;              // 重试次数

  // BullMQ Job 信息
  jobId?: string;

  createTime: Date;
  updateTime: Date;
  finishTime?: Date;
};
```

**重要说明：评测数据集复用现有 Schema**

训练任务中的评测数据集（baseModelEvalDatasetId、tunedModelEvalDatasetId）复用 FastGPT 已有的评测数据集 Schema：

- **EvalDatasetCollectionSchema**（`packages/service/core/evaluation/dataset/evalDatasetCollectionSchema.ts`）
  - 集合名：`eval_dataset_collections`
  - 存储评测数据集的元信息（名称、描述、团队ID等）
  - 训练任务的 `baseModelEvalDatasetId` 和 `tunedModelEvalDatasetId` 对应此表的 `_id`

- **EvalDatasetDataSchema**（`packages/service/core/evaluation/dataset/evalDatasetDataSchema.ts`）
  - 集合名：`eval_dataset_datas`
  - 存储具体的评测数据条目（userInput, expectedOutput, context 等）
  - 通过 `evalDatasetCollectionId` 关联到 EvalDatasetCollection

评测阶段生成评测数据集时，直接使用 `MongoEvalDatasetCollection` 和 `MongoEvalDatasetData` 创建数据，无需额外定义新的 Schema。

#### 2.3 API 类型定义
```typescript
// packages/global/core/train/rerank/api.d.ts

import type { PaginationProps, PaginationResponse } from '../../common/fetch';

/** ========== 应用训练集 API ========== */

/** 创建应用训练集 */
export type CreateRerankTrainsetBody = {
  appId: string;                   // 必需：与应用 1:1 绑定
  name?: string;                   // 可选，默认：`${appName} - 训练集`
  description?: string;
};

/** 应用训练集详情查询 */
export type RerankTrainsetDetailQuery = {
  appId: string;
};

export type RerankTrainsetDetailResponse = RerankTrainsetSchemaType & {
  app: {
    _id: string;
    name: string;
    avatar: string;
  };
};

/** 删除应用训练集 */
export type DeleteRerankTrainsetQuery = {
  trainsetId: string;
};

/** ========== 训练数据 API ========== */

/** 生成训练数据（从知识库拷贝） */
export type GenerateRerankTrainDataBody = {
  appId: string;                   // 必需：应用ID
  datasetIds?: string[];           // 可选：指定知识库，默认使用应用关联的所有知识库
  sampleSize?: number;             // 可选：每个知识库的采样大小，默认 1000
  forceRegenerate?: boolean;       // 可选：强制重新生成
};

export type GenerateRerankTrainDataResponse = {
  jobId: string;
  status: 'pending';
};

/** 手动添加训练数据 */
export type CreateRerankTrainDataBody = {
  appId: string;
  queries: string[];
  positiveDocs: string[];
  negativeDocs: string[];
  reason?: string;                 // 添加原因
};

/** 更新训练数据 */
export type UpdateRerankTrainDataBody = {
  dataId: string;
  queries?: string[];
  positiveDocs?: string[];
  negativeDocs?: string[];
};

/** 训练数据列表 */
export type ListRerankTrainDataBody = PaginationProps<{
  appId: string;
  source?: `${TrainDataSourceEnum}`;
}>;

export type ListRerankTrainDataResponse = PaginationResponse<RerankTrainsetDataSchemaType>;

/** 删除训练数据 */
export type DeleteRerankTrainDataBody = {
  dataIds: string[];
};

/** ========== 训练任务 API ========== */

/** 创建训练任务 */
export type CreateRerankTrainTaskBody = {
  appId: string;
  name?: string;
};

export type CreateRerankTrainTaskResponse = {
  taskId: string;
  status: `${RerankTrainTaskStatusEnum}`;
};

/** 训练任务详情 */
export type RerankTrainTaskDetailQuery = {
  taskId: string;
};

export type RerankTrainTaskDetailResponse = RerankTrainTaskSchemaType & {
  app: {
    _id: string;
    name: string;
    avatar: string;
  };
};

/** 训练任务列表 */
export type ListRerankTrainTaskBody = PaginationProps<{
  appId?: string;
  status?: `${RerankTrainTaskStatusEnum}`;
}>;

export type ListRerankTrainTaskResponse = PaginationResponse<
  RerankTrainTaskSchemaType & {
    appName: string;
    appAvatar: string;
  }
>;

/** 重试训练任务 */
export type RetryRerankTrainTaskBody = {
  taskId: string;
};

/** 取消训练任务 */
export type CancelRerankTrainTaskBody = {
  taskId: string;
};

/** 删除训练任务 */
export type DeleteRerankTrainTaskQuery = {
  taskId: string;
};
```

### 3. 错误码定义

```typescript
// packages/global/common/error/code/train.ts

import type { ResponseType } from '../type';

export enum RerankTrainErrEnum {
  // 应用训练集错误
  trainsetNotExist = 'trainsetNotExist',
  trainsetAlreadyExist = 'trainsetAlreadyExist',  // 应用已有训练集（1:1关系）
  trainsetGenerating = 'trainsetGenerating',
  trainsetAlreadyReady = 'trainsetAlreadyReady',
  trainsetNotReady = 'trainsetNotReady',
  trainsetInUse = 'trainsetInUse',

  // 知识库训练集错误
  datasetTrainsetGenerating = 'datasetTrainsetGenerating',

  // 训练数据错误
  trainDataNotExist = 'trainDataNotExist',
  noTrainDataAvailable = 'noTrainDataAvailable',
  noDatasetAvailable = 'noDatasetAvailable',

  // 训练任务错误
  taskNotExist = 'taskNotExist',
  taskAlreadyRunning = 'taskAlreadyRunning',
  taskCannotRetry = 'taskCannotRetry',
  taskRetryExceeded = 'taskRetryExceeded',
  taskCannotCancel = 'taskCannotCancel',
  taskCannotDelete = 'taskCannotDelete',

  // 外部服务错误
  ditingServiceError = 'ditingServiceError',
  aicpServiceError = 'aicpServiceError'  // AICP 训推平台错误
}

export const RerankTrainErrResponse: Record<RerankTrainErrEnum, ResponseType> = {
  [RerankTrainErrEnum.trainsetNotExist]: {
    code: 404,
    message: '训练集不存在'
  },
  [RerankTrainErrEnum.trainsetAlreadyExist]: {
    code: 400,
    message: '该应用已存在训练集'
  },
  [RerankTrainErrEnum.trainsetGenerating]: {
    code: 400,
    message: '训练数据生成中，请稍后'
  },
  [RerankTrainErrEnum.trainsetAlreadyReady]: {
    code: 400,
    message: '训练集已就绪，无需重复生成'
  },
  [RerankTrainErrEnum.trainsetNotReady]: {
    code: 400,
    message: '训练集未就绪，请先生成训练数据'
  },
  [RerankTrainErrEnum.trainsetInUse]: {
    code: 400,
    message: '训练集正在被使用，无法删除'
  },
  [RerankTrainErrEnum.datasetTrainsetGenerating]: {
    code: 400,
    message: '知识库训练集生成中，请稍后'
  },
  [RerankTrainErrEnum.trainDataNotExist]: {
    code: 404,
    message: '训练数据不存在'
  },
  [RerankTrainErrEnum.noTrainDataAvailable]: {
    code: 400,
    message: '没有可用的训练数据'
  },
  [RerankTrainErrEnum.noDatasetAvailable]: {
    code: 400,
    message: '应用未关联知识库'
  },
  [RerankTrainErrEnum.taskNotExist]: {
    code: 404,
    message: '训练任务不存在'
  },
  [RerankTrainErrEnum.taskAlreadyRunning]: {
    code: 400,
    message: '该应用已有进行中的训练任务'
  },
  [RerankTrainErrEnum.taskCannotRetry]: {
    code: 400,
    message: '任务状态不允许重试'
  },
  [RerankTrainErrEnum.taskRetryExceeded]: {
    code: 400,
    message: '任务重试次数已达上限'
  },
  [RerankTrainErrEnum.taskCannotCancel]: {
    code: 400,
    message: '任务状态不允许取消'
  },
  [RerankTrainErrEnum.taskCannotDelete]: {
    code: 400,
    message: '进行中的任务不能删除'
  },
  [RerankTrainErrEnum.ditingServiceError]: {
    code: 500,
    message: 'DiTing 服务调用失败'
  },
  [RerankTrainErrEnum.aicpServiceError]: {
    code: 500,
    message: 'AICP 训推平台调用失败'
  }
};
```

### 4. 审计日志事件

需要在 `packages/global/support/auditLog/constant.ts` 中添加训练模块相关的审计事件：

```typescript
export enum AuditEventEnum {
  // ... 现有事件

  // Rerank 训练模块
  CREATE_RERANK_TRAINSET = 'create_rerank_trainset',
  DELETE_RERANK_TRAINSET = 'delete_rerank_trainset',
  CREATE_RERANK_TRAIN_TASK = 'create_rerank_train_task',
  DELETE_RERANK_TRAIN_TASK = 'delete_rerank_train_task'
}
```

## TODO 清单

- [ ] 创建 `packages/global/core/train/rerank/` 目录
- [ ] 实现 `constants.ts` - 定义所有枚举常量
- [ ] 实现 `type.d.ts` - 定义所有 Schema 类型
- [ ] 实现 `api.d.ts` - 定义所有 API 类型
- [ ] 创建 `packages/global/common/error/code/train.ts` - 定义错误码
- [ ] 在 `packages/global/support/auditLog/constant.ts` 中添加审计事件
- [ ] 运行 `pnpm lint` 确保代码风格正确
- [ ] 运行 `pnpm gen:theme-typings` 更新类型
- [ ] Git 提交变更

## 验证标准

- [ ] 所有枚举和类型都有清晰的注释
- [ ] 类型定义完整，没有遗漏必需字段
- [ ] 错误码覆盖所有可能的业务错误场景
- [ ] Lint 检查通过
- [ ] 类型检查通过

## 关键决策记录

1. **完全跳过对话日志导入功能**：TrainDataSourceEnum 中不包含 chat_log，相关字段虽然在类型中预留但不实现逻辑
2. **两层架构设计**：知识库训练集（内部）+ 应用训练集（对外），职责分离
3. **1:1 关系约束**：应用与训练集是 1:1 关系，知识库与训练集也是 1:1 关系

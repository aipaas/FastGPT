# Workflow: 外部服务 Mock 实现

**任务ID**: 250112-train-module-external-mocks
**创建时间**: 2025-01-12
**完成时间**: 2025-01-12
**状态**: 已完成
**依赖**: 250112-train-module-foundation
**后续**: 250112-train-module-dataset-trainset

## 任务目标

实现训练模块依赖的外部服务的 Mock/Stub 版本，确保开发和测试可以独立进行，不依赖真实外部系统。包括：
1. **DiTing 数据合成服务** - 生成训练数据、生成评测数据集、执行评测
2. **AICP 训推平台** - 创建训练任务、查询任务状态、返回微调后模型地址

**注意**：FastGPT 已内置 AICP 渠道的模型管理功能，训练完成后通过现有的模型管理 API 创建 Rerank 配置，无需额外实现。

## 背景说明

根据设计文档，训练模块需要与以下外部服务交互：

### DiTing 服务职责
- 从知识库分片合成 Rerank 训练数据
- 生成 Rerank 评测数据集
- 评测 Rerank 模型效果（微调前后对比）

### AICP 训推平台职责
- 接收训练数据，创建模型训练任务
- 执行模型微调
- 返回微调后的模型地址

### FastGPT 模型管理（已内置）
- 通过 `/api/core/ai/model/update` API 创建/更新模型配置
- 支持 AICP 渠道的 Rerank 模型配置
- 管理模型版本和激活状态

## 实施方案

### 1. 目录结构
```
packages/service/core/train/rerank/external/
├── diting/
│   ├── mock.ts                 # DiTing Mock 实现
│   └── types.ts                # DiTing 类型定义
└── aicp/
    ├── mock.ts                 # AICP 训推平台 Mock 实现
    └── types.ts                # AICP 训推平台类型定义
```

**注意**：模型配置管理复用 FastGPT 现有的 `/api/core/ai/model/update` API，无需额外实现。

### 2. DiTing Mock 实现

#### 2.1 类型定义
```typescript
// packages/service/core/train/rerank/external/diting/types.ts

/** DiTing 合成训练数据请求 */
export type DiTingSyntheticTrainDataRequest = {
  samples: Array<{
    dataId: string;              // 数据分片ID
    content: string;             // 分片内容
  }>;
  config: {
    queryCount: number;          // 每个样本生成的查询数
    negativeCount: number;       // 负样本数量
    model: string;               // 使用的模型
    temperature: number;
  };
};

/** DiTing 合成训练数据响应 */
export type DiTingSyntheticTrainDataResponse = {
  success: boolean;
  data: Array<{
    queries: string[];           // 查询变体
    positiveDocs: string[];      // 正样本文档
    negativeDocs: string[];      // 负样本文档
    sourceDataIds: string[];     // 来源数据分片ID
    generationConfig: {
      model: string;
      temperature: number;
    };
  }>;
  error?: string;
};

/** DiTing 生成评测数据集请求 */
export type DiTingGenerateEvalDatasetRequest = {
  appId: string;
  sampleSize: number;
  datasetIds?: string[];
};

/** DiTing 生成评测数据集响应 */
export type DiTingGenerateEvalDatasetResponse = {
  success: boolean;
  datasetId: string;             // 评测数据集ID（复用评测数据集表）
  error?: string;
};

/** DiTing 评测 Rerank 请求 */
export type DiTingEvaluateRerankRequest = {
  evalDatasetId: string;         // 评测数据集ID
  modelConfigId: string;         // 模型配置ID
};

/** DiTing 评测 Rerank 响应 */
export type DiTingEvaluateRerankResponse = {
  success: boolean;
  result: {
    ndcg: number;                // NDCG@10
    mrr: number;                 // MRR
    precision: number;           // Precision@10
    recall: number;              // Recall@10
    [key: string]: any;          // 其他指标
  };
  error?: string;
};
```

#### 2.2 Mock 实现
```typescript
// packages/service/core/train/rerank/external/diting/mock.ts

import type {
  DiTingSyntheticTrainDataRequest,
  DiTingSyntheticTrainDataResponse,
  DiTingGenerateEvalDatasetRequest,
  DiTingGenerateEvalDatasetResponse,
  DiTingEvaluateRerankRequest,
  DiTingEvaluateRerankResponse
} from './types';
import { addLog } from '@fastgpt/service/common/system/log';

/**
 * Mock: 从知识库分片合成 Rerank 训练数据
 * 真实实现需要调用 DiTing 的 synthetic_rerank_train_data 接口
 */
export async function mockDiTingSyntheticRerankTrainData(
  request: DiTingSyntheticTrainDataRequest
): Promise<DiTingSyntheticTrainDataResponse> {
  addLog.info('[MOCK] DiTing synthetic rerank train data', {
    sampleCount: request.samples.length,
    config: request.config
  });

  // 模拟处理延迟
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

  // 生成 Mock 数据
  const mockData = request.samples.map(sample => {
    const queries: string[] = [];
    for (let i = 0; i < request.config.queryCount; i++) {
      queries.push(`查询变体${i + 1}：关于${sample.content.slice(0, 20)}的问题`);
    }

    const positiveDocs = [sample.content];

    const negativeDocs: string[] = [];
    for (let i = 0; i < request.config.negativeCount; i++) {
      negativeDocs.push(`负样本${i + 1}：这是与查询不相关的内容`);
    }

    return {
      queries,
      positiveDocs,
      negativeDocs,
      sourceDataIds: [sample.dataId],
      generationConfig: {
        model: request.config.model,
        temperature: request.config.temperature
      }
    };
  });

  return {
    success: true,
    data: mockData
  };
}

/**
 * Mock: 生成评测数据集
 * 真实实现需要调用 DiTing 的 synthetic_rerank_evaluation_dataset 接口
 */
export async function mockDiTingGenerateEvalDataset(
  request: DiTingGenerateEvalDatasetRequest
): Promise<DiTingGenerateEvalDatasetResponse> {
  addLog.info('[MOCK] DiTing generate eval dataset', {
    appId: request.appId,
    sampleSize: request.sampleSize
  });

  // 模拟处理延迟
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

  // 生成 Mock 评测数据集ID
  const mockDatasetId = `eval_dataset_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  return {
    success: true,
    datasetId: mockDatasetId
  };
}

/**
 * Mock: 评测 Rerank 模型
 * 真实实现需要调用 DiTing 的 evaluate_rerank 接口
 */
export async function mockDiTingEvaluateRerank(
  request: DiTingEvaluateRerankRequest
): Promise<DiTingEvaluateRerankResponse> {
  addLog.info('[MOCK] DiTing evaluate rerank', {
    evalDatasetId: request.evalDatasetId,
    modelConfigId: request.modelConfigId
  });

  // 模拟处理延迟
  await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));

  // 生成 Mock 评测结果（模拟微调后效果提升）
  const baseNdcg = 0.65 + Math.random() * 0.15;
  const baseMrr = 0.70 + Math.random() * 0.15;

  return {
    success: true,
    result: {
      ndcg: Number(baseNdcg.toFixed(4)),
      mrr: Number(baseMrr.toFixed(4)),
      precision: Number((0.60 + Math.random() * 0.15).toFixed(4)),
      recall: Number((0.55 + Math.random() * 0.15).toFixed(4))
    }
  };
}
```

### 3. AICP 训推平台 Mock 实现

#### 3.1 类型定义（基于 AICP 真实 API）

```typescript
// packages/service/core/train/rerank/external/aicp/types.ts

/** 创建优化任务请求（multipart/form-data） */
export type CreateAicpOptimizationTaskRequest = {
  datasetFile: Buffer | ReadStream;  // 数据集文件流（jsonl格式）
  taskType: 'rerank' | 'embed';      // 任务类型
  parameters?: {                     // 训练超参（可选）
    learning_rate?: number;
    epochs?: number;
    batch_size?: number;
  };
};

/** 创建优化任务响应 */
export type CreateAicpOptimizationTaskResponse = {
  task_id: string;                   // 微调任务ID
  status: 'created';                 // 固定返回 created
  message: string;
};

/** 查询优化任务状态请求 */
export type QueryAicpTaskStatusRequest = {
  taskId: string;
};

/** AICP 任务状态枚举（与 AICP API 对齐） */
export enum AicpTaskStatus {
  created = 'created',               // 任务已创建
  running = 'running',               // 训练中
  deploying = 'deploying',           // 训练完成，部署中
  completed = 'completed',           // 部署完成，已对外服务
  failed = 'failed'                  // 任务失败
}

/** 查询优化任务状态响应 */
export type QueryAicpTaskStatusResponse = {
  task_id: string;
  status: AicpTaskStatus;
  progress?: number;                 // 进度百分比 (0-100)
  message: string;

  // completed 状态时返回
  endpoint?: {
    ip: string;                      // 服务IP地址
    port: string;                    // 服务端口
    model: string;                   // 模型名称
    api_key: string;                 // 认证信息
  };

  // failed 状态时返回
  error?: string;
};
```

#### 3.2 Mock 实现（模拟 AICP 真实 API 行为）

```typescript
// packages/service/core/train/rerank/external/aicp/mock.ts

import type {
  CreateAicpOptimizationTaskRequest,
  CreateAicpOptimizationTaskResponse,
  QueryAicpTaskStatusRequest,
  QueryAicpTaskStatusResponse,
  AicpTaskStatus
} from './types';
import { addLog } from '@fastgpt/service/common/system/log';

// Mock 任务存储（内存模拟）
const mockTasks = new Map<
  string,
  {
    status: AicpTaskStatus;
    endpoint?: {
      ip: string;
      port: string;
      model: string;
      api_key: string;
    };
    createdAt: number;
  }
>();

/**
 * Mock: 创建 AICP 优化任务
 * 真实实现：POST /api/v1/optimization/tasks (multipart/form-data)
 */
export async function mockCreateAicpOptimizationTask(
  request: CreateAicpOptimizationTaskRequest
): Promise<CreateAicpOptimizationTaskResponse> {
  addLog.info('[MOCK] Create AICP optimization task', {
    taskType: request.taskType
  });

  // 模拟处理延迟
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

  const taskId = `aicp_task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // 存储 Mock 任务（初始状态：created）
  mockTasks.set(taskId, {
    status: AicpTaskStatus.created,
    createdAt: Date.now()
  });

  // 模拟状态流转：created → running → deploying → completed
  // running: 2秒后开始训练
  setTimeout(() => {
    const task = mockTasks.get(taskId);
    if (task) {
      task.status = AicpTaskStatus.running;
      mockTasks.set(taskId, task);
      addLog.info('[MOCK] AICP task status: running', { taskId });
    }
  }, 2000);

  // deploying: 10秒后训练完成，开始部署
  setTimeout(() => {
    const task = mockTasks.get(taskId);
    if (task) {
      task.status = AicpTaskStatus.deploying;
      mockTasks.set(taskId, task);
      addLog.info('[MOCK] AICP task status: deploying', { taskId });
    }
  }, 10000);

  // completed: 12秒后部署完成
  setTimeout(() => {
    const task = mockTasks.get(taskId);
    if (task) {
      task.status = AicpTaskStatus.completed;
      task.endpoint = {
        ip: '192.168.1.100',
        port: '8080',
        model: `rerank_finetuned_${Date.now()}`,
        api_key: `mock_api_key_${Math.random().toString(36).slice(2, 9)}`
      };
      mockTasks.set(taskId, task);
      addLog.info('[MOCK] AICP task status: completed', { taskId, endpoint: task.endpoint });
    }
  }, 12000);

  return {
    task_id: taskId,
    status: 'created',
    message: '微调任务已创建'
  };
}

/**
 * Mock: 查询 AICP 优化任务状态
 * 真实实现：GET /api/v1/optimization/tasks/{task_id}
 */
export async function mockQueryAicpTaskStatus(
  request: QueryAicpTaskStatusRequest
): Promise<QueryAicpTaskStatusResponse> {
  addLog.info('[MOCK] Query AICP task status', {
    taskId: request.taskId
  });

  const task = mockTasks.get(request.taskId);

  if (!task) {
    return {
      task_id: request.taskId,
      status: AicpTaskStatus.failed,
      message: '任务不存在',
      error: 'Task not found'
    };
  }

  // 计算进度
  let progress = 0;
  let message = '';

  switch (task.status) {
    case AicpTaskStatus.created:
      progress = 0;
      message = '任务已创建';
      break;
    case AicpTaskStatus.running:
      const elapsed = Date.now() - task.createdAt;
      progress = Math.min(95, Math.floor((elapsed / 10000) * 95));
      message = '微调任务进行中';
      break;
    case AicpTaskStatus.deploying:
      progress = 100;
      message = '训练完成，部署中';
      break;
    case AicpTaskStatus.completed:
      progress = 100;
      message = '训练完成，已提供推理服务';
      break;
    case AicpTaskStatus.failed:
      message = '微调任务失败';
      break;
  }

  const response: QueryAicpTaskStatusResponse = {
    task_id: request.taskId,
    status: task.status,
    progress,
    message
  };

  // completed 状态时返回 endpoint
  if (task.status === AicpTaskStatus.completed && task.endpoint) {
    response.endpoint = task.endpoint;
  }

  return response;
}
```

### 4. 统一入口

创建统一的外部服务调用入口，便于未来替换为真实实现：

```typescript
// packages/service/core/train/rerank/external/index.ts

// DiTing 服务
export {
  mockDiTingSyntheticRerankTrainData as callDiTingSyntheticRerankTrainData,
  mockDiTingGenerateEvalDataset as callDiTingGenerateEvalDataset,
  mockDiTingEvaluateRerank as callDiTingEvaluateRerank
} from './diting/mock';

// AICP 训推平台
export {
  mockCreateAicpOptimizationTask as callCreateAicpOptimizationTask,
  mockQueryAicpTaskStatus as callQueryAicpTaskStatus
} from './aicp/mock';

// 导出类型
export * from './diting/types';
export * from './aicp/types';
```

### 5. 模型配置管理（复用现有 API）

训练完成后，使用 FastGPT 现有的模型管理 API 创建 Rerank 模型配置：

```typescript
// packages/service/core/train/rerank/model/controller.ts

import { MongoSystemModel } from '../../ai/config/schema';
import { updatedReloadSystemModel } from '../../ai/config/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.d';

/**
 * 创建 Rerank 模型配置
 * 复用 FastGPT 现有的模型管理系统
 */
export async function createRerankModelConfig(params: {
  model: string;                 // 模型标识，如 'aicp-rerank-finetuned-20250112'
  name: string;                  // 模型名称
  modelAddress: string;          // AICP 模型地址
  isActive?: boolean;            // 是否激活
  charsPointsPrice?: number;     // 定价
}): Promise<string> {
  const { model, name, modelAddress, isActive = true, charsPointsPrice = 0 } = params;

  // 构造 RerankModelItemType 配置
  const metadata: RerankModelItemType = {
    type: ModelTypeEnum.rerank,
    provider: 'aicp',              // AICP 渠道
    model: model,
    name: name,
    isActive: isActive,
    isCustom: true,                // 标记为自定义模型
    requestUrl: modelAddress,      // AICP 模型地址
    charsPointsPrice: charsPointsPrice
  };

  // 保存到数据库
  await MongoSystemModel.updateOne(
    { model },
    {
      model,
      metadata
    },
    {
      upsert: true
    }
  );

  // 重新加载系统模型
  await updatedReloadSystemModel();

  return model;
}

/**
 * 更新 Rerank 模型配置状态
 */
export async function updateRerankModelStatus(
  model: string,
  isActive: boolean
): Promise<void> {
  await MongoSystemModel.updateOne(
    { model },
    {
      $set: {
        'metadata.isActive': isActive
      }
    }
  );

  await updatedReloadSystemModel();
}
```

## TODO 清单

- [ ] 创建 `packages/service/core/train/rerank/external/` 目录结构
- [ ] 实现 DiTing 类型定义 (`diting/types.ts`)
- [ ] 实现 DiTing Mock (`diting/mock.ts`)
- [ ] 实现 AICP 训推平台类型定义 (`aicp/types.ts`)
- [ ] 实现 AICP 训推平台 Mock (`aicp/mock.ts`)
- [ ] 创建统一入口 (`external/index.ts`)
- [ ] 创建模型配置管理控制器 (`model/controller.ts`)
- [ ] 编写单元测试验证 Mock 功能
- [ ] 运行 `pnpm lint` 确保代码风格正确
- [ ] Git 提交变更

## 验证标准

- [ ] 所有 Mock 函数都有清晰的注释说明真实实现的对接方式
- [ ] Mock 数据格式符合设计文档要求
- [ ] Mock 实现包含合理的延迟模拟真实网络请求
- [ ] 统一入口便于未来替换为真实实现
- [ ] 模型配置管理正确复用 FastGPT 现有 API
- [ ] 单元测试覆盖主要 Mock 功能
- [ ] Lint 检查通过

## 关键决策记录

1. **合并训推平台和 AICP**：训推平台就是 AICP，统一为 AICP 训推平台
2. **复用模型管理系统**：训练完成后通过 FastGPT 现有的 `MongoSystemModel` 创建模型配置，无需额外实现
3. **内存存储模拟状态**：AICP Mock 使用 Map 存储状态，重启后清空
4. **异步延迟模拟**：所有 Mock 函数都包含 setTimeout 模拟真实网络延迟
5. **训练任务自动完成**：AICP Mock 在 10 秒后自动将任务标记为完成
6. **统一入口设计**：使用 export alias 方式，未来替换为真实实现时只需修改 `external/index.ts`
7. **评测结果随机化**：Mock 评测结果使用随机数生成，模拟真实场景的指标波动

## Mock 实现限制说明

**重要提示**：本 Mock 实现存在以下限制，仅适用于开发测试环境：

### AICP Mock 限制
1. **内存存储**：任务状态存储在内存中（`Map` 数据结构），Node.js 进程重启后会丢失所有任务数据
2. **单实例假设**：多实例部署时，不同实例间状态不共享，可能导致任务状态查询失败
3. **训练时间模拟**：模拟训练时间为 12 秒（从 created 到 completed），与实际 AICP 训练时间（2-8 小时）差距较大
4. **无持久化**：Mock 不提供数据持久化能力，不适合长时间运行的测试场景

### DiTing Mock 限制
1. **简化数据生成**：生成的训练数据和评测数据为简单模板，不具备真实 DiTing 的语义理解能力
2. **固定评测指标**：评测结果使用随机数生成，不反映真实的模型效果

### 使用建议
- **开发环境**：Mock 可用于快速验证业务逻辑和工作流
- **集成测试**：短时间内的自动化测试可使用 Mock
- **生产环境**：必须对接真实的 AICP 和 DiTing 服务

## 后续对接真实服务的注意事项

当对接真实外部服务时：
1. **DiTing 服务**：替换 `diting/mock.ts` 为真实的 HTTP 客户端实现
2. **AICP 训推平台**：替换 `aicp/mock.ts` 为真实的 AICP API 调用
3. 真实实现文件建议命名为 `client.ts`（如 `diting/client.ts`, `aicp/client.ts`）
4. 保留 Mock 实现用于测试环境
5. 通过环境变量或配置文件控制使用 Mock 还是真实服务
6. **模型配置**：真实对接时，使用 `createRerankModelConfig` 函数，指定正确的 AICP 模型地址

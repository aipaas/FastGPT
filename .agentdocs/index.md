# FastGPT Agent 文档索引

## 产品文档
`prd/smart-customer-service.md` - 智能客服 RAG 应用整体产品方案，包含业务目标、业务模型、能力地图等

## 后端文档
`backend/api-router-guide.md` - API 路由开发规范，新增或修改任何 API 接口时必读
`backend/app-module-design.md` - APP 模块设计文档，新增应用相关功能时必读
`backend/dataset-module-design.md` - 知识库模块设计文档，新增知识库相关功能或 1:1 关联模块时必读
`backend/train-module-design.md` - Rerank 训练模块完整设计文档，包含架构、数据流、API、工作流等全局设计，实现训练相关功能时必读
`backend/api-aicp_platform.md` - AICP 训推平台 API 接口文档，对接 AICP 服务时必读

## 测试文档
`testing/mongodb-setup.md` - MongoDB 测试环境离线配置指南，首次配置测试环境或测试失败时必读

## 当前任务文档
`workflow/250112-train-module-foundation.md` - 训练模块基础设施（类型、常量、错误码、Schema 定义）
`workflow/250112-train-module-external-mocks.md` - 外部服务 Mock 实现（DiTing、AICP）
`workflow/250112-train-module-dataset-trainset.md` - 知识库训练集实现（层级1，内部缓存层）
`workflow/250112-train-module-app-trainset-basic.md` - 应用训练集基础实现（层级2，对外暴露层）
`workflow/250112-train-module-trainset-data.md` - 训练数据管理实现（数据生成、CRUD）
`workflow/250112-train-module-train-task.md` - 训练任务管理实现（4阶段工作流、checkpoint 断点续传）
`workflow/250112-train-module-integration.md` - 级联删除和集成测试

## 全局重要记忆

### 代码开发流程规范

**代码生成任务的执行流程**：所有代码生成任务必须遵循以下四步流程，确保代码质量和正确性。

1. **思考阶段 (Think)**
   - 分析任务需求，梳理业务逻辑
   - 检查现有代码规范，确定实现方案
   - 识别潜在问题和边界情况
   - 规划文件结构和模块划分

2. **代码生成阶段 (Code)**
   - 按照设计方案逐步实现代码
   - 遵循项目现有的代码规范和模式
   - 每次只完成一个小的功能点，避免一次性生成过多代码
   - 保持代码简洁、可读、可维护

3. **审查阶段 (Review)**
   - **类型检查**：运行 `pnpm lint` 确保无类型错误
   - **逻辑检查**：审查业务逻辑是否正确，边界情况是否处理
   - **规范检查**：确认是否符合项目代码规范（导入路径、Schema 定义、权限认证等）
   - **依赖检查**：确认所有导入的模块和类型是否存在

4. **测试阶段 (Test)**
   - **单元测试**：编写 vitest 单元测试，覆盖主要功能和边界情况
   - **端到端测试**：编写测试脚本验证 API 功能
     - 使用 `make dev name=app` 在根目录拉起服务
     - 编写测试脚本发起 HTTP 请求
     - 验证响应结果是否符合预期
   - **集成测试**：验证新功能与现有模块的集成是否正常

**遇到问题的处理原则**：
- 在执行任务过程中，如果发现原始设计存在实施问题、需求指向模糊、或者有多种实现方案时
- **必须立即停止代码生成**，将问题清晰地描述并抛出给用户
- 等待用户明确意见后，再继续下一步代码生成
- 不要根据假设继续实现，避免返工

### API 开发规范
- API 路由必须使用 `NextAPI` 中间件包装，位于 `projects/app/src/service/middleware/entry.ts`
- 认证函数统一使用 `authApp`、`authDataset`、`authUserPer` 等，位于 `packages/service/support/permission/`
- 创建子资源时使用条件认证：有 parentId 认证父资源权限，无则认证用户团队权限

### 权限系统
- 权限值常量：`ReadPermissionVal`(读)、`WritePermissionVal`(写)、`ManagePermissionVal`(管理)、`OwnerPermissionVal`(拥有者)
- APP 模块特有 `readChatLog` 权限，用于控制日志访问
- APP 和 Dataset 都支持 `inheritPermission` 权限继承机制

### 训练模块关键约定
- 训练模块采用 4 阶段工作流：preparing → finetuning → registering → evaluating
- checkpoint 数据按阶段组织，支持断点续传
- evaluating 阶段拆分为 4 个子步骤，支持细粒度断点续传
- 命名规范：基础模型使用 `base*`，微调模型使用 `tuned*`
- 训练数据集文件路径命名：`trainDatasetFilePath`
- **基础模型信息在任务根级别定义**：在 RerankTrainTaskSchema 根字段中定义 `baseModelConfigId` 和 `baseModelEndpoint`（与 appId、teamId 等平级），任务创建时从 App 工作流提取并解析，避免在多个 checkpoint 阶段重复存储和查询
- 使用 `updateCheckpointData(taskId, stage, data, merge?)` 统一管理 checkpoint 更新
  - `merge=false`：整体更新（替换整个阶段数据）
  - `merge=true`：部分更新（仅更新指定字段，保留其他字段）

### 单元测试正确写法
- **测试框架**：使用 vitest，导入 `{ describe, test, expect, vi, beforeEach }`
- **Mock 外部依赖**：使用 `vi.mock('module-path', () => ({ ... }))` 模拟外部依赖，避免副作用和数据库依赖
  ```typescript
  vi.mock('@fastgpt/service/common/system/log', () => ({
    addLog: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }
  }));
  ```
- **清理 Mocks**：在 `beforeEach` 钩子中调用 `vi.clearAllMocks()` 清理所有 mock 状态
- **测试文件位置**：放置在 `test/cases/service/` 目录下，按照源代码模块路径组织（如 `test/cases/service/core/train/xxx.test.ts`）
- **异步测试超时**：需要等待的异步测试使用第二个参数设置超时时间（单位ms），如 `test('...', async () => {...}, 15000)`
- **测试覆盖范围**：包含成功路径、错误路径、边界条件、数据一致性验证
- **测试结构**：使用 `describe` 分组相关测试，使用清晰的中文描述测试意图

### 代码正确写法
- **导入路径计算**：根据文件在 monorepo 中的深度准确计算相对路径层数
  - 从 `packages/service/core/module/submodule/*` (深度6) 到 `packages/service/common/`: `../../../../common/`
  - 从 `packages/service/core/module/submodule/feature/*` (深度7) 到 common: `../../../../../common/`
  - 示例：`packages/service/core/train/rerank/external/aicp/mock.ts` 到 common 需要 `../../../../../common/`
- **Schema 定义模式**：遵循项目统一的 Mongoose Schema 定义规范
  - 索引定义直接调用 `Schema.index()`，不使用 try-catch 包裹
  - export 语句不放在 try-catch 中
  - 使用 `export const MongoXxx = getMongoModel<XxxType>(collectionName, XxxSchema)` 模式
- **避免重复导出**：枚举（enum）只 export 一次作为值，不在 `export type { ... }` 块中重复导出
  ```typescript
  // ✅ 正确
  export type { RequestType, ResponseType } from './types';
  export { StatusEnum } from './types';

  // ❌ 错误
  export type { RequestType, ResponseType, StatusEnum } from './types';
  export { StatusEnum } from './types';
  ```
- **Schema 命名准确性**：import 时使用项目中的实际导出名称（使用 IDE 自动补全或查看源文件确认）
- **BullMQ 队列命名**：新增队列时在 `packages/service/common/bullmq/constant.ts` 的 `QueueNames` 枚举中添加
- **类型导入优化**：从 mongoose 导入时，优先使用 `getMongoModel` 返回的类型，避免手动导入 `Model` 类型

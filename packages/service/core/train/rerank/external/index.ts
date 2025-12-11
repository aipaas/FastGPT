/**
 * 训练模块外部服务统一入口
 *
 * 当前使用 Mock 实现，未来可替换为真实服务调用
 */

// ===== DiTing 服务 =====
export {
  mockDiTingSyntheticRerankTrainData as syntheticRerankTrainData,
  mockDiTingGenerateEvalDataset as generateEvalDataset,
  mockDiTingEvaluateRerank as evaluateRerank
} from './diting/mock';

export type {
  DiTingSyntheticTrainDataRequest,
  DiTingSyntheticTrainDataResponse,
  DiTingGenerateEvalDatasetRequest,
  DiTingGenerateEvalDatasetResponse,
  DiTingEvaluateRerankRequest,
  DiTingEvaluateRerankResponse
} from './diting/types';

// ===== AICP 服务 =====
export {
  mockCreateAicpOptimizationTask as createAicpOptimizationTask,
  mockQueryAicpTaskStatus as queryAicpTaskStatus
} from './aicp/mock';

export type {
  CreateAicpOptimizationTaskRequest,
  CreateAicpOptimizationTaskResponse,
  QueryAicpTaskStatusRequest,
  QueryAicpTaskStatusResponse
} from './aicp/types';

export { AicpTaskStatus } from './aicp/types';

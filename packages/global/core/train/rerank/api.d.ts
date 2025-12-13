import type { PaginationProps, PaginationResponse } from '../../common/fetch/type';
import type {
  RerankTrainsetSchemaType,
  RerankTrainsetDataSchemaType,
  RerankTrainTaskSchemaType
} from './type';
import type { TrainDataSourceEnum, RerankTrainTaskStatusEnum } from './constants';

/** ========== 应用训练集 API ========== */

/** 创建应用训练集 */
export type CreateRerankTrainsetBody = {
  appId: string; // 必需：与应用 1:1 绑定
  name?: string; // 可选，默认：`${appName} - 训练集`
  description?: string;
};

/** 应用训练集详情查询 */
export type RerankTrainsetDetailQuery = {
  trainsetId: string;
};

export type RerankTrainsetDetailResponse = RerankTrainsetSchemaType & {
  app: {
    _id: string;
    name: string;
    avatar: string;
  };
};

/** 应用训练集列表查询 */
export type ListRerankTrainsetBody = {
  appId?: string;
  status?: string;
  pageNum?: number;
  pageSize?: number;
};

export type ListRerankTrainsetResponse = {
  list: (RerankTrainsetSchemaType & {
    appName: string;
    appAvatar: string;
  })[];
  total: number;
};

/** 删除应用训练集 */
export type DeleteRerankTrainsetQuery = {
  trainsetId: string;
};

/** ========== 训练数据 API ========== */

/** 生成训练数据（从知识库拷贝） */
export type GenerateRerankTrainDataBody = {
  appId: string; // 必需：应用ID
  datasetIds?: string[]; // 可选：指定知识库，默认使用应用关联的所有知识库
  sampleSize?: number; // 可选：每个知识库的采样大小，默认 1000
  forceRegenerate?: boolean; // 可选：强制重新生成
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
  reason?: string; // 添加原因
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

import type { ReadStream } from 'fs';

/** 创建优化任务请求（multipart/form-data） */
export type CreateAicpOptimizationTaskRequest = {
  datasetFile: Buffer | ReadStream; // 数据集文件流（jsonl格式）
  taskType: 'rerank' | 'embed'; // 任务类型
  parameters?: {
    // 训练超参（可选）
    learning_rate?: number;
    epochs?: number;
    batch_size?: number;
  };
};

/** 创建优化任务响应 */
export type CreateAicpOptimizationTaskResponse = {
  task_id: string; // 微调任务ID
  status: 'created'; // 固定返回 created
  message: string;
};

/** 查询优化任务状态请求 */
export type QueryAicpTaskStatusRequest = {
  taskId: string;
};

/** AICP 任务状态枚举（与 AICP API 对齐） */
export enum AicpTaskStatus {
  created = 'created', // 任务已创建
  running = 'running', // 训练中
  deploying = 'deploying', // 训练完成，部署中
  completed = 'completed', // 部署完成，已对外服务
  failed = 'failed' // 任务失败
}

/** 查询优化任务状态响应 */
export type QueryAicpTaskStatusResponse = {
  task_id: string;
  status: AicpTaskStatus;
  progress?: number; // 进度百分比 (0-100)
  message: string;

  // completed 状态时返回
  endpoint?: {
    ip: string; // 服务IP地址
    port: string; // 服务端口
    model: string; // 模型名称
    api_key: string; // 认证信息
  };

  // failed 状态时返回
  error?: string;
};

/** 知识库训练集状态 */
export enum DatasetTrainsetStatusEnum {
  idle = 'idle', // 空闲（无数据）
  generating = 'generating', // 生成中
  ready = 'ready', // 就绪
  error = 'error' // 错误
}

/** 应用训练集状态 */
export enum RerankTrainsetStatusEnum {
  idle = 'idle', // 空闲（无数据）
  composing = 'composing', // 组装中（从知识库拷贝数据）
  ready = 'ready', // 就绪
  error = 'error' // 错误
}

/** 训练数据来源 */
export enum TrainDataSourceEnum {
  dataset = 'dataset', // 从知识库拷贝
  manual = 'manual' // 手动添加
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
  finetuning = 'finetuning', // 模型微调（AICP执行微调并自动部署）
  registering = 'registering', // 模型注册（在FastGPT中注册配置）
  evaluating = 'evaluating'
}

import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';

/**
 * Rerank 训练任务 Schema
 * 注意：这是占位实现，完整实现在 Task 6 (train-task.md)
 */
const RerankTrainTaskSchema = new connectionMongo.Schema({
  appId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'app',
    required: true
  },
  teamId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'team',
    required: true
  },
  tmbId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'team_member',
    required: true
  },
  trainsetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'rerank_trainset',
    required: true
  },
  status: {
    type: String,
    enum: Object.values(RerankTrainTaskStatusEnum),
    default: RerankTrainTaskStatusEnum.pending
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

// 基础索引
RerankTrainTaskSchema.index({ appId: 1, createTime: -1 });
RerankTrainTaskSchema.index({ status: 1 });

export const MongoRerankTrainTask = getMongoModel<RerankTrainTaskSchemaType>(
  'rerank_train_task',
  RerankTrainTaskSchema
);

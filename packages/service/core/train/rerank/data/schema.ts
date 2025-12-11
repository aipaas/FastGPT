import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type { RerankTrainsetDataSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { TrainDataSourceEnum } from '@fastgpt/global/core/train/rerank/constants';

/**
 * Rerank 应用训练数据 Schema
 * 注意：这是占位实现，完整实现在 Task 5 (trainset-data.md)
 */
const RerankTrainsetDataSchema = new connectionMongo.Schema({
  trainsetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'rerank_trainset',
    required: true
  },
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
  queries: {
    type: [String],
    required: true
  },
  positiveDocs: {
    type: [String],
    required: true
  },
  negativeDocs: {
    type: [String],
    required: true
  },
  source: {
    type: String,
    enum: Object.values(TrainDataSourceEnum),
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

// 基础索引
RerankTrainsetDataSchema.index({ trainsetId: 1, createTime: -1 });
RerankTrainsetDataSchema.index({ appId: 1 });

export const MongoRerankTrainsetData = getMongoModel<RerankTrainsetDataSchemaType>(
  'rerank_trainset_data',
  RerankTrainsetDataSchema
);

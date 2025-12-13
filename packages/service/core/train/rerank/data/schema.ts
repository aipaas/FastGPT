import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type { RerankTrainsetDataSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { TrainDataSourceEnum } from '@fastgpt/global/core/train/rerank/constants';

/**
 * Rerank 应用训练数据 Schema
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
  metadata: {
    type: {
      sourceInfo: {
        // 来自知识库（拷贝）
        datasetTrainsetDataId: String,
        datasetId: connectionMongo.Schema.Types.ObjectId,
        datasetName: String,
        dataIds: [String],
        // 手动添加
        manualInfo: {
          creator: String,
          createdAt: Date,
          reason: String
        }
      },
      // 生成配置（如果来自知识库）
      generationConfig: {
        model: String,
        temperature: Number
      }
    },
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

// 索引
RerankTrainsetDataSchema.index({ trainsetId: 1, createTime: -1 });
RerankTrainsetDataSchema.index({ appId: 1, createTime: -1 });
RerankTrainsetDataSchema.index({ teamId: 1 });
RerankTrainsetDataSchema.index({ source: 1 });

export const MongoRerankTrainsetData = getMongoModel<RerankTrainsetDataSchemaType>(
  'rerank_trainset_data',
  RerankTrainsetDataSchema
);

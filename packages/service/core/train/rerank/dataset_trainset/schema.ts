import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type {
  DatasetTrainsetSchemaType,
  DatasetTrainsetDataSchemaType
} from '@fastgpt/global/core/train/rerank/type';
import { DatasetTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';

/** DatasetTrainset Schema - 知识库训练集（1:1 绑定知识库） */
const DatasetTrainsetSchema = new connectionMongo.Schema({
  datasetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'dataset',
    required: true,
    unique: true // 1:1 关系
  },
  teamId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'team',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  dataCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: Object.values(DatasetTrainsetStatusEnum),
    default: DatasetTrainsetStatusEnum.idle
  },
  errorMsg: {
    type: String
  },
  generationConfig: {
    type: {
      sampleSize: Number,
      queryCount: Number,
      negativeCount: Number,
      model: String
    }
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

// 索引
DatasetTrainsetSchema.index({ datasetId: 1 }, { unique: true });
DatasetTrainsetSchema.index({ teamId: 1, status: 1 });
DatasetTrainsetSchema.index({ status: 1, updateTime: -1 });

export const MongoDatasetTrainset = getMongoModel<DatasetTrainsetSchemaType>(
  'dataset_trainset',
  DatasetTrainsetSchema
);

/** DatasetTrainsetData Schema - 知识库训练集数据 */
const DatasetTrainsetDataSchema = new connectionMongo.Schema({
  trainsetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'dataset_trainset',
    required: true
  },
  datasetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'dataset',
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
  metadata: {
    type: {
      dataIds: [String],
      generationConfig: {
        model: String,
        temperature: Number
      },
      generatedAt: Date
    },
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

// 索引
DatasetTrainsetDataSchema.index({ trainsetId: 1, createTime: -1 });
DatasetTrainsetDataSchema.index({ datasetId: 1 });
DatasetTrainsetDataSchema.index({ teamId: 1 });

export const MongoDatasetTrainsetData = getMongoModel<DatasetTrainsetDataSchemaType>(
  'dataset_trainset_data',
  DatasetTrainsetDataSchema
);

import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';

/**
 * Rerank 训练任务 Schema
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
  name: {
    type: String,
    required: true
  },
  baseModelConfigId: {
    type: String,
    required: true
  },
  baseModelEndpoint: {
    type: {
      ip: String,
      port: String,
      model: String,
      api_key: String
    },
    required: true
  },
  status: {
    type: String,
    enum: Object.values(RerankTrainTaskStatusEnum),
    default: RerankTrainTaskStatusEnum.pending
  },
  checkpoint: {
    type: {
      stage: {
        type: String,
        enum: [...Object.values(RerankTaskCheckpointStageEnum), null],
        default: null
      },
      data: {
        // 阶段1: 数据准备
        preparing: {
          trainDatasetIds: [String],
          trainDatasetFilePath: String
        },
        // 阶段2: 模型微调
        finetuning: {
          aicpTaskId: String,
          tunedModelEndpoint: {
            ip: String,
            port: String,
            model: String,
            api_key: String
          }
        },
        // 阶段3: 模型注册
        registering: {
          tunedModelConfigId: String
        },
        // 阶段4: 效果评测
        evaluating: {
          baseModelEvalDatasetId: String,
          tunedModelEvalDatasetId: String,
          baseModelEvalResult: connectionMongo.Schema.Types.Mixed,
          tunedModelEvalResult: connectionMongo.Schema.Types.Mixed
        }
      },
      stageStartTime: {
        preparing: Date,
        finetuning: Date,
        registering: Date,
        evaluating: Date
      }
    },
    default: {
      stage: null,
      data: {},
      stageStartTime: {}
    }
  },
  result: {
    type: {
      trainDatasetIds: [String],
      trainDatasetFilePath: String,
      tunedModelConfigId: String,
      baseModelEvalDatasetId: String,
      tunedModelEvalDatasetId: String,
      baseModelEvalResult: connectionMongo.Schema.Types.Mixed,
      tunedModelEvalResult: connectionMongo.Schema.Types.Mixed
    }
  },
  errorMsg: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0
  },
  jobId: {
    type: String
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  finishTime: {
    type: Date
  }
});

// 索引
RerankTrainTaskSchema.index({ appId: 1, createTime: -1 });
RerankTrainTaskSchema.index({ teamId: 1, status: 1 });
RerankTrainTaskSchema.index({ status: 1, updateTime: 1 });
RerankTrainTaskSchema.index({ jobId: 1 });
RerankTrainTaskSchema.index({ 'checkpoint.stage': 1, status: 1 });

export const MongoRerankTrainTask = getMongoModel<RerankTrainTaskSchemaType>(
  'rerank_train_task',
  RerankTrainTaskSchema
);

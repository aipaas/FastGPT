import type {
  DatasetTrainsetStatusEnum,
  RerankTrainsetStatusEnum,
  TrainDataSourceEnum,
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from './constants';

/** 知识库训练集 Schema 类型 */
export type DatasetTrainsetSchemaType = {
  _id: string;
  datasetId: string; // 1:1 关系，唯一索引
  teamId: string;

  name: string; // 自动生成：`${datasetName} - 训练集`

  // 统计信息
  dataCount: number; // 训练数据总数

  // 状态
  status: `${DatasetTrainsetStatusEnum}`;
  errorMsg?: string;

  // 生成配置（记录用）
  generationConfig?: {
    sampleSize: number;
    queryCount: number;
    negativeCount: number;
    model: string;
  };

  createTime: Date;
  updateTime: Date;
};

/** 知识库训练数据 Schema 类型 */
export type DatasetTrainsetDataSchemaType = {
  _id: string;
  trainsetId: string; // 所属知识库训练集
  datasetId: string; // 冗余，便于查询
  teamId: string;

  // Rerank 训练数据格式
  queries: string[]; // 查询变体
  positiveDocs: string[]; // 正样本文档
  negativeDocs: string[]; // 负样本文档

  // 元数据
  metadata: {
    dataIds: string[]; // 来源数据分片ID
    generationConfig: {
      model: string;
      temperature: number;
    };
    generatedAt: Date;
  };

  createTime: Date;
};

/** 应用训练集 Schema 类型 */
export type RerankTrainsetSchemaType = {
  _id: string;
  appId: string; // 1:1 关系，唯一索引
  teamId: string;
  tmbId: string; // 创建者

  name: string; // 自动生成：`${appName} - 训练集`
  description?: string;

  // 来源统计（记录数据来源分布）
  sourceSummary: Array<{
    type: 'dataset' | 'manual'; // 注意：不包含 chat_log
    datasetId?: string;
    datasetName?: string;
    count: number;
  }>;

  // 统计信息
  dataCount: number; // 总数据量
  positiveCount: number; // 正样本数
  negativeCount: number; // 负样本数

  // 状态
  status: `${RerankTrainsetStatusEnum}`;
  errorMsg?: string;

  createTime: Date;
  updateTime: Date;
};

/** 应用训练数据 Schema 类型 */
export type RerankTrainsetDataSchemaType = {
  _id: string;
  trainsetId: string; // 所属应用训练集
  appId: string; // 冗余，便于查询和权限
  teamId: string;

  // Rerank 训练数据格式
  queries: string[]; // 查询变体
  positiveDocs: string[]; // 正样本文档
  negativeDocs: string[]; // 负样本文档

  // 数据来源
  source: `${TrainDataSourceEnum}`;

  // 元数据
  metadata: {
    sourceInfo: {
      // 来自知识库（拷贝）
      datasetTrainsetDataId?: string; // 溯源：原始知识库训练数据ID
      datasetId?: string;
      datasetName?: string;
      dataIds?: string[]; // 具体数据分片ID

      // 手动添加
      manualInfo?: {
        creator: string;
        createdAt: Date;
        reason?: string;
      };

      // 注意：chatLogInfo 预留但不使用
    };

    // 生成配置（如果来自知识库）
    generationConfig?: {
      model: string;
      temperature: number;
    };
  };

  createTime: Date;
};

/** 训练任务 Schema 类型 */
export type RerankTrainTaskSchemaType = {
  _id: string;
  appId: string; // 关联的应用
  teamId: string;
  tmbId: string; // 发起者

  name: string; // 任务名称
  baseModelConfigId: string; // 当前应用rerank模型在FastGPT的模型配置ID（任务创建时从App工作流提取）
  baseModelEndpoint: {
    // 当前应用rerank模型的 endpoint 信息（任务创建时从模型配置提取）
    ip: string;
    port: string;
    model: string;
    api_key: string;
  };

  // 任务状态
  status: `${RerankTrainTaskStatusEnum}`;

  // 检查点数据（用于断点续跑，按阶段组织）
  checkpoint: {
    stage: `${RerankTaskCheckpointStageEnum}` | null; // null 表示未开始
    data?: {
      // 阶段1: 数据准备
      preparing?: {
        trainDatasetIds: string[]; // 训练数据集ID列表
        trainDatasetFilePath: string; // JSONL 数据集文件路径
      };

      // 阶段2: 模型微调
      finetuning?: {
        aicpTaskId: string; // AICP 训推平台任务ID
        tunedModelEndpoint: {
          // AICP 返回的微调后模型 endpoint 信息
          ip: string;
          port: string;
          model: string;
          api_key: string;
        };
      };

      // 阶段3: 模型注册
      registering?: {
        tunedModelConfigId: string; // 微调后模型注册到FastGPT的模型配置标识
      };

      // 阶段4: 效果评测（拆分为 4 个子步骤，支持细粒度断点续传）
      evaluating?: {
        baseModelEvalDatasetId?: string; // 子步骤1: 基于基础模型-知识库搜索节点生成的评估测试集ID
        tunedModelEvalDatasetId?: string; // 子步骤2: 基于微调模型-知识库搜索节点生成的评估测试集ID
        baseModelEvalResult?: Record<string, any>; // 子步骤3: 基础模型评测结果
        tunedModelEvalResult?: Record<string, any>; // 子步骤4: 微调模型评测结果
      };
    };
    stageStartTime?: {
      preparing?: Date;
      finetuning?: Date;
      registering?: Date;
      evaluating?: Date;
    };
  };

  // 训练结果（最终结果，用于展示）
  result?: {
    trainDatasetIds: string[];
    trainDatasetFilePath: string;
    tunedModelConfigId: string;
    baseModelEvalDatasetId: string;
    tunedModelEvalDatasetId: string;
    baseModelEvalResult: Record<string, any>;
    tunedModelEvalResult: Record<string, any>;
  };

  // 错误信息
  errorMsg?: string;
  retryCount: number; // 重试次数

  // BullMQ Job 信息
  jobId?: string;

  createTime: Date;
  updateTime: Date;
  finishTime?: Date;
};

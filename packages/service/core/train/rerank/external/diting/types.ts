/** DiTing 合成训练数据请求 */
export type DiTingSyntheticTrainDataRequest = {
  samples: Array<{
    dataId: string; // 数据分片ID
    content: string; // 分片内容
  }>;
  config: {
    queryCount: number; // 每个样本生成的查询数
    negativeCount: number; // 负样本数量
    model: string; // 使用的模型
    temperature: number;
  };
};

/** DiTing 合成训练数据响应 */
export type DiTingSyntheticTrainDataResponse = {
  success: boolean;
  data: Array<{
    queries: string[]; // 查询变体
    positiveDocs: string[]; // 正样本文档
    negativeDocs: string[]; // 负样本文档
    sourceDataIds: string[]; // 来源数据分片ID
    generationConfig: {
      model: string;
      temperature: number;
    };
  }>;
  error?: string;
};

/** DiTing 生成评测数据集请求 */
export type DiTingGenerateEvalDatasetRequest = {
  appId: string;
  sampleSize: number;
  datasetIds?: string[];
};

/** DiTing 生成评测数据集响应 */
export type DiTingGenerateEvalDatasetResponse = {
  success: boolean;
  datasetId: string; // 评测数据集ID（复用评测数据集表）
  error?: string;
};

/** DiTing 评测 Rerank 请求 */
export type DiTingEvaluateRerankRequest = {
  evalDatasetId: string; // 评测数据集ID
  modelConfigId: string; // 模型配置ID
};

/** DiTing 评测 Rerank 响应 */
export type DiTingEvaluateRerankResponse = {
  success: boolean;
  result: {
    ndcg: number; // NDCG@10
    mrr: number; // MRR
    precision: number; // Precision@10
    recall: number; // Recall@10
    [key: string]: any; // 其他指标
  };
  error?: string;
};

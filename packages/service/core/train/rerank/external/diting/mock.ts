import type {
  DiTingSyntheticTrainDataRequest,
  DiTingSyntheticTrainDataResponse,
  DiTingGenerateEvalDatasetRequest,
  DiTingGenerateEvalDatasetResponse,
  DiTingEvaluateRerankRequest,
  DiTingEvaluateRerankResponse
} from './types';
import { addLog } from '../../../../../common/system/log';

/**
 * Mock: 从知识库分片合成 Rerank 训练数据
 * 真实实现需要调用 DiTing 的 synthetic_rerank_train_data 接口
 */
export async function mockDiTingSyntheticRerankTrainData(
  request: DiTingSyntheticTrainDataRequest
): Promise<DiTingSyntheticTrainDataResponse> {
  addLog.info('[MOCK] DiTing synthetic rerank train data', {
    sampleCount: request.samples.length,
    config: request.config
  });

  // 模拟处理延迟
  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));

  // 生成 Mock 数据
  const mockData = request.samples.map((sample) => {
    const queries: string[] = [];
    for (let i = 0; i < request.config.queryCount; i++) {
      queries.push(`查询变体${i + 1}：关于${sample.content.slice(0, 20)}的问题`);
    }

    const positiveDocs = [sample.content];

    const negativeDocs: string[] = [];
    for (let i = 0; i < request.config.negativeCount; i++) {
      negativeDocs.push(`负样本${i + 1}：这是与查询不相关的内容`);
    }

    return {
      queries,
      positiveDocs,
      negativeDocs,
      sourceDataIds: [sample.dataId],
      generationConfig: {
        model: request.config.model,
        temperature: request.config.temperature
      }
    };
  });

  return {
    success: true,
    data: mockData
  };
}

/**
 * Mock: 生成评测数据集
 * 真实实现需要调用 DiTing 的 synthetic_rerank_evaluation_dataset 接口
 */
export async function mockDiTingGenerateEvalDataset(
  request: DiTingGenerateEvalDatasetRequest
): Promise<DiTingGenerateEvalDatasetResponse> {
  addLog.info('[MOCK] DiTing generate eval dataset', {
    appId: request.appId,
    sampleSize: request.sampleSize
  });

  // 模拟处理延迟
  await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));

  // 生成 Mock 评测数据集ID
  const mockDatasetId = `eval_dataset_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  return {
    success: true,
    datasetId: mockDatasetId
  };
}

/**
 * Mock: 评测 Rerank 模型
 * 真实实现需要调用 DiTing 的 evaluate_rerank 接口
 */
export async function mockDiTingEvaluateRerank(
  request: DiTingEvaluateRerankRequest
): Promise<DiTingEvaluateRerankResponse> {
  addLog.info('[MOCK] DiTing evaluate rerank', {
    evalDatasetId: request.evalDatasetId,
    modelConfigId: request.modelConfigId
  });

  // 模拟处理延迟
  await new Promise((resolve) => setTimeout(resolve, 3000 + Math.random() * 2000));

  // 生成 Mock 评测结果（模拟微调后效果提升）
  const baseNdcg = 0.65 + Math.random() * 0.15;
  const baseMrr = 0.7 + Math.random() * 0.15;

  return {
    success: true,
    result: {
      ndcg: Number(baseNdcg.toFixed(4)),
      mrr: Number(baseMrr.toFixed(4)),
      precision: Number((0.6 + Math.random() * 0.15).toFixed(4)),
      recall: Number((0.55 + Math.random() * 0.15).toFixed(4))
    }
  };
}

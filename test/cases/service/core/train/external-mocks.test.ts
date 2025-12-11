import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  syntheticRerankTrainData,
  generateEvalDataset,
  evaluateRerank,
  createAicpOptimizationTask,
  queryAicpTaskStatus,
  AicpTaskStatus
} from '@fastgpt/service/core/train/rerank/external';

// Mock addLog
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Rerank Train External Mocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DiTing Service Mocks', () => {
    test('应该成功生成 Rerank 训练数据', async () => {
      const response = await syntheticRerankTrainData({
        samples: [
          { dataId: 'data_001', content: '这是测试内容1' },
          { dataId: 'data_002', content: '这是测试内容2' }
        ],
        config: {
          queryCount: 3,
          negativeCount: 5,
          model: 'gpt-4',
          temperature: 0.7
        }
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data!.length).toBeGreaterThan(0);

      // 验证数据结构
      const firstItem = response.data![0];
      expect(firstItem.queries).toBeInstanceOf(Array);
      expect(firstItem.queries.length).toBe(3);
      expect(firstItem.positiveDocs).toBeInstanceOf(Array);
      expect(firstItem.negativeDocs).toBeInstanceOf(Array);
      expect(firstItem.negativeDocs.length).toBe(5);
      expect(firstItem.sourceDataIds).toBeInstanceOf(Array);
      expect(firstItem.generationConfig).toBeDefined();
    });

    test('应该成功生成评测数据集', async () => {
      const response = await generateEvalDataset({
        appId: 'app_test_001',
        sampleSize: 100,
        datasetIds: ['dataset_001', 'dataset_002']
      });

      expect(response.success).toBe(true);
      expect(response.datasetId).toBeDefined();
      expect(typeof response.datasetId).toBe('string');
      expect(response.datasetId.length).toBeGreaterThan(0);
    });

    test('应该成功评测 Rerank 模型', async () => {
      const response = await evaluateRerank({
        evalDatasetId: 'eval_dataset_001',
        modelConfigId: 'model_config_001'
      });

      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
      expect(typeof response.result.ndcg).toBe('number');
      expect(typeof response.result.mrr).toBe('number');
      expect(typeof response.result.precision).toBe('number');
      expect(typeof response.result.recall).toBe('number');

      // 验证指标范围
      expect(response.result.ndcg).toBeGreaterThan(0);
      expect(response.result.ndcg).toBeLessThanOrEqual(1);
      expect(response.result.mrr).toBeGreaterThan(0);
      expect(response.result.mrr).toBeLessThanOrEqual(1);
    });

    test('生成训练数据时应使用正确的配置', async () => {
      const config = {
        queryCount: 2,
        negativeCount: 3,
        model: 'test-model',
        temperature: 0.5
      };

      const response = await syntheticRerankTrainData({
        samples: [{ dataId: 'test', content: 'test content' }],
        config
      });

      expect(response.success).toBe(true);
      const firstItem = response.data![0];
      expect(firstItem.queries.length).toBe(config.queryCount);
      expect(firstItem.negativeDocs.length).toBe(config.negativeCount);
      expect(firstItem.generationConfig.model).toBe(config.model);
      expect(firstItem.generationConfig.temperature).toBe(config.temperature);
    });
  });

  describe('AICP Service Mocks', () => {
    test('应该成功创建优化任务', async () => {
      const response = await createAicpOptimizationTask({
        datasetFile: Buffer.from('mock dataset content'),
        taskType: 'rerank',
        parameters: {
          learning_rate: 0.001,
          epochs: 10,
          batch_size: 32
        }
      });

      expect(response.task_id).toBeDefined();
      expect(typeof response.task_id).toBe('string');
      expect(response.task_id.length).toBeGreaterThan(0);
      expect(response.status).toBe('created');
      expect(response.message).toBeDefined();
    });

    test('应该立即查询到 created 状态', async () => {
      const createRes = await createAicpOptimizationTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      const statusRes = await queryAicpTaskStatus({ taskId: createRes.task_id });

      expect(statusRes.task_id).toBe(createRes.task_id);
      expect(statusRes.status).toBe(AicpTaskStatus.created);
      expect(statusRes.progress).toBeDefined();
      expect(typeof statusRes.progress).toBe('number');
      expect(statusRes.progress).toBe(0);
      expect(statusRes.message).toBeDefined();
    });

    test('任务状态应随时间变化', async () => {
      const createRes = await createAicpOptimizationTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      // 等待 4 秒后应该进入 running 状态
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const runningStatus = await queryAicpTaskStatus({ taskId: createRes.task_id });
      expect(runningStatus.status).toBe(AicpTaskStatus.running);
      expect(runningStatus.progress).toBeGreaterThan(0);
      expect(runningStatus.progress).toBeLessThan(80);
    }, 10000); // 增加测试超时时间

    test('完成后应该返回 endpoint 信息', async () => {
      const createRes = await createAicpOptimizationTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      // 等待 13 秒确保任务完成
      await new Promise((resolve) => setTimeout(resolve, 13000));
      const completedStatus = await queryAicpTaskStatus({ taskId: createRes.task_id });

      expect(completedStatus.status).toBe(AicpTaskStatus.completed);
      expect(completedStatus.progress).toBe(100);
      expect(completedStatus.endpoint).toBeDefined();
      expect(completedStatus.endpoint?.ip).toBeDefined();
      expect(completedStatus.endpoint?.port).toBeDefined();
      expect(completedStatus.endpoint?.model).toBeDefined();
      expect(completedStatus.endpoint?.api_key).toBeDefined();
    }, 15000); // 增加测试超时时间

    test('查询不存在的任务应返回错误', async () => {
      const response = await queryAicpTaskStatus({ taskId: 'non_existent_task_id' });

      expect(response.status).toBe(AicpTaskStatus.failed);
      expect(response.error).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message).toContain('not found');
    });

    test('不同任务类型应被正确记录', async () => {
      const rerankTask = await createAicpOptimizationTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      const embedTask = await createAicpOptimizationTask({
        datasetFile: Buffer.from('test'),
        taskType: 'embed',
        parameters: {}
      });

      expect(rerankTask.task_id).not.toBe(embedTask.task_id);

      const rerankStatus = await queryAicpTaskStatus({ taskId: rerankTask.task_id });
      const embedStatus = await queryAicpTaskStatus({ taskId: embedTask.task_id });

      expect(rerankStatus.status).toBe(AicpTaskStatus.created);
      expect(embedStatus.status).toBe(AicpTaskStatus.created);
    });
  });

  describe('Mock 数据一致性', () => {
    test('DiTing 生成的训练数据应包含源数据 ID', async () => {
      const samples = [
        { dataId: 'id_1', content: 'content 1' },
        { dataId: 'id_2', content: 'content 2' }
      ];

      const response = await syntheticRerankTrainData({
        samples,
        config: {
          queryCount: 1,
          negativeCount: 2,
          model: 'test',
          temperature: 0.7
        }
      });

      expect(response.data!.length).toBeGreaterThan(0);
      response.data!.forEach((item) => {
        expect(item.sourceDataIds.length).toBeGreaterThan(0);
        // sourceDataIds 应该来自输入的 samples
        item.sourceDataIds.forEach((sourceId) => {
          const found = samples.some((s) => s.dataId === sourceId);
          expect(found).toBe(true);
        });
      });
    });

    test('AICP 完成的任务应包含正确格式的 model 名称', async () => {
      const createRes = await createAicpOptimizationTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      await new Promise((resolve) => setTimeout(resolve, 13000));
      const completedStatus = await queryAicpTaskStatus({ taskId: createRes.task_id });

      expect(completedStatus.endpoint?.model).toContain('tuned-rerank-model');
    }, 15000);
  });
});

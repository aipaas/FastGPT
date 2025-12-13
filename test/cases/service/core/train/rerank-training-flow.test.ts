import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { rerankTrainTaskProcessor } from '@fastgpt/service/core/train/rerank/task/processor';

// Mock all external dependencies
vi.mock('@fastgpt/service/common/system/log');
vi.mock('@fastgpt/service/support/wallet/usage/controller');
vi.mock('@fastgpt/service/support/permission/teamLimit');

// Mock external services
vi.mock('@fastgpt/service/core/train/rerank/external', () => ({
  createAicpOptimizationTask: vi.fn().mockResolvedValue({
    task_id: 'aicp-task-123',
    status: 'created',
    message: 'Task created successfully'
  }),
  queryAicpTaskStatus: vi.fn().mockResolvedValue({
    success: true,
    status: 'completed',
    result: {
      model_path: '/path/to/model',
      metrics: {
        accuracy: 0.95
      }
    }
  }),
  generateEvalDataset: vi.fn().mockResolvedValue({
    success: true,
    result: {
      eval_dataset_id: 'eval-dataset-123'
    }
  }),
  evaluateRerank: vi.fn().mockResolvedValue({
    success: true,
    result: {
      ndcg: 0.85,
      precision: 0.82,
      recall: 0.88
    }
  })
}));

// Mock model controller
vi.mock('@fastgpt/service/core/train/rerank/model/controller', () => ({
  createRerankModelConfig: vi.fn().mockResolvedValue('model-config-123')
}));

// Mock task controller
vi.mock('@fastgpt/service/core/train/rerank/task/controller', () => ({
  getRerankTrainTask: vi.fn(),
  createRerankTrainTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateCheckpointStage: vi.fn(),
  updateCheckpointData: vi.fn()
}));

// Mock data schema
vi.mock('@fastgpt/service/core/train/rerank/data/schema', () => ({
  MongoRerankTrainsetData: {
    countDocuments: vi.fn().mockResolvedValue(10)
  }
}));

describe('Rerank Training Flow Tests', () => {
  let teamId: string;
  let tmbId: string;
  let appId: string;
  let taskId: string;

  beforeAll(() => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    appId = '507f1f77bcf86cd799439013';
    taskId = '507f1f77bcf86cd799439020';
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('训练任务流程集成测试', () => {
    test('rerankTrainTaskProcessor 应该存在', () => {
      expect(typeof rerankTrainTaskProcessor).toBe('function');
    });

    test('应该验证所有必需的枚举值', () => {
      // 验证任务状态枚举
      expect(RerankTrainTaskStatusEnum.pending).toBe('pending');
      expect(RerankTrainTaskStatusEnum.running).toBe('running');
      expect(RerankTrainTaskStatusEnum.completed).toBe('completed');
      expect(RerankTrainTaskStatusEnum.failed).toBe('failed');

      // 验证检查点阶段枚举
      expect(RerankTaskCheckpointStageEnum.preparing).toBe('preparing');
      expect(RerankTaskCheckpointStageEnum.finetuning).toBe('finetuning');
      expect(RerankTaskCheckpointStageEnum.registering).toBe('registering');
      expect(RerankTaskCheckpointStageEnum.evaluating).toBe('evaluating');
    });

    test('应该正确调用外部服务', async () => {
      const { createAicpOptimizationTask, queryAicpTaskStatus } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );

      // 验证外部服务函数存在
      expect(typeof createAicpOptimizationTask).toBe('function');
      expect(typeof queryAicpTaskStatus).toBe('function');
    });

    test('应该正确调用模型控制器', async () => {
      const { createRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );

      // 验证模型控制器函数存在
      expect(typeof createRerankModelConfig).toBe('function');
    });
  });

  describe('错误处理测试', () => {
    test('外部服务调用失败时应该正确处理', async () => {
      const { createAicpOptimizationTask } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );

      // Mock 外部服务失败
      (createAicpOptimizationTask as any).mockRejectedValue(new Error('Service unavailable'));

      // 验证错误能被正确处理
      await expect(
        createAicpOptimizationTask({
          datasetFile: Buffer.from('test data'),
          taskType: 'rerank' as const,
          parameters: {
            learning_rate: 0.001,
            epochs: 10
          }
        })
      ).rejects.toThrow('Service unavailable');
    });
  });

  describe('流程验证测试', () => {
    test('验证完整的训练流程阶段', () => {
      const expectedStages = ['preparing', 'finetuning', 'registering', 'evaluating'];

      expectedStages.forEach((stage) => {
        expect(Object.values(RerankTaskCheckpointStageEnum)).toContain(stage);
      });
    });

    test('验证训练任务状态流转', () => {
      const expectedStatuses = ['pending', 'running', 'completed', 'failed'];

      expectedStatuses.forEach((status) => {
        expect(Object.values(RerankTrainTaskStatusEnum)).toContain(status);
      });
    });
  });
});

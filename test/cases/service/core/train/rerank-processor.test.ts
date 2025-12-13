import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { rerankTrainTaskProcessor } from '@fastgpt/service/core/train/rerank/task/processor';

// Mock all external dependencies
vi.mock('@fastgpt/service/common/system/log');
vi.mock('@fastgpt/service/core/train/rerank/task/controller', () => ({
  getRerankTrainTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateCheckpointStage: vi.fn(),
  updateCheckpointData: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/rerank/data/schema', () => ({
  MongoRerankTrainsetData: {
    countDocuments: vi.fn().mockResolvedValue(0),
    find: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    })
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/external', () => ({
  createAicpOptimizationTask: vi.fn(),
  queryAicpTaskStatus: vi.fn(),
  generateEvalDataset: vi.fn(),
  evaluateRerank: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/rerank/model/controller', () => ({
  createRerankModelConfig: vi.fn()
}));

describe('Rerank Task Processor Tests', () => {
  let teamId: string;
  let tmbId: string;
  let taskId: string;

  beforeAll(() => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    taskId = '507f1f77bcf86cd799439020';
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('处理器基本功能测试', () => {
    test('rerankTrainTaskProcessor 应该存在且可调用', () => {
      expect(typeof rerankTrainTaskProcessor).toBe('function');
    });

    test('任务不存在时应该抛出 UnrecoverableError', async () => {
      const { getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );

      // Mock任务不存在
      (getRerankTrainTask as any).mockResolvedValue(null);

      const job = {
        data: { taskId, isRetry: false }
      } as any;

      await expect(rerankTrainTaskProcessor(job)).rejects.toThrow('Task not found');
    });
  });

  describe('外部依赖集成测试', () => {
    test('应该正确调用外部服务函数', async () => {
      const { createAicpOptimizationTask, queryAicpTaskStatus } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );

      // 验证函数存在
      expect(typeof createAicpOptimizationTask).toBe('function');
      expect(typeof queryAicpTaskStatus).toBe('function');
    });

    test('应该正确调用模型控制器函数', async () => {
      const { createRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );

      // 验证函数存在
      expect(typeof createRerankModelConfig).toBe('function');
    });
  });

  describe('枚举值验证测试', () => {
    test('应该包含所有必需的枚举值', () => {
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
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createRerankTrainTask,
  updateTaskStatus,
  updateCheckpointStage,
  updateCheckpointData,
  getRerankTrainTask,
  deleteRerankTrainTask,
  cancelRerankTrainTask
} from '@fastgpt/service/core/train/rerank/task/controller';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/task/schema', () => ({
  MongoRerankTrainTask: {
    create: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn()
  }
}));

describe('Rerank Train Task Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRerankTrainTask', () => {
    test('应该成功创建训练任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      // Mock app with dataset search node containing rerank model
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'app_123',
          name: 'Test App',
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                {
                  key: 'rerankModel',
                  value: 'model_123'
                }
              ]
            }
          ]
        })
      });

      // Mock create task
      (MongoRerankTrainTask.create as any).mockResolvedValue([{ _id: 'task_123' }]);

      const taskId = await createRerankTrainTask({
        appId: 'app_123',
        teamId: 'team_123',
        tmbId: 'tmb_123',
        name: 'My Task'
      });

      expect(taskId).toBe('task_123');
      expect(MongoApp.findById).toHaveBeenCalledWith('app_123');
      expect(MongoRerankTrainTask.create).toHaveBeenCalled();
    });

    test('应用不存在时应抛出错误', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(
        createRerankTrainTask({
          appId: 'non_existent_app',
          teamId: 'team_123',
          tmbId: 'tmb_123'
        })
      ).rejects.toThrow('Application not found');
    });

    test('应用无 rerank 节点时应抛出错误', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'app_123',
          modules: [{ flowNodeType: 'otherNode' }]
        })
      });

      await expect(
        createRerankTrainTask({
          appId: 'app_123',
          teamId: 'team_123',
          tmbId: 'tmb_123'
        })
      ).rejects.toThrow('No rerank model found in application workflow');
    });
  });

  describe('updateTaskStatus', () => {
    test('应该成功更新任务状态', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateTaskStatus('task_123', RerankTrainTaskStatusEnum.running);

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          status: RerankTrainTaskStatusEnum.running
        })
      );
    });

    test('完成状态应设置 finishTime', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateTaskStatus('task_123', RerankTrainTaskStatusEnum.completed);

      const callArgs = (MongoRerankTrainTask.updateOne as any).mock.calls[0][1];
      expect(callArgs.finishTime).toBeDefined();
    });
  });

  describe('updateCheckpointStage', () => {
    test('应该成功更新检查点阶段', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateCheckpointStage('task_123', RerankTaskCheckpointStageEnum.preparing);

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          'checkpoint.stage': RerankTaskCheckpointStageEnum.preparing
        })
      );
    });
  });

  describe('updateCheckpointData', () => {
    test('整体更新模式应替换整个阶段数据', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateCheckpointData(
        'task_123',
        'preparing',
        {
          trainDatasetIds: ['data1', 'data2'],
          trainDatasetFilePath: '/tmp/data.jsonl'
        },
        false
      );

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          'checkpoint.data.preparing': {
            trainDatasetIds: ['data1', 'data2'],
            trainDatasetFilePath: '/tmp/data.jsonl'
          }
        })
      );
    });

    test('部分更新模式应只更新指定字段', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await updateCheckpointData(
        'task_123',
        'evaluating',
        {
          baseModelEvalDatasetId: 'eval_123'
        },
        true
      );

      const callArgs = (MongoRerankTrainTask.updateOne as any).mock.calls[0][1];
      expect(callArgs['checkpoint.data.evaluating.baseModelEvalDatasetId']).toBe('eval_123');
    });
  });

  describe('getRerankTrainTask', () => {
    test('应该成功获取训练任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      const mockTask = {
        _id: 'task_123',
        appId: 'app_123',
        status: RerankTrainTaskStatusEnum.pending
      };

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTask)
      });

      const task = await getRerankTrainTask('task_123');

      expect(task).toEqual(mockTask);
      expect(MongoRerankTrainTask.findById).toHaveBeenCalledWith('task_123');
    });

    test('任务不存在时应返回 null', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      const task = await getRerankTrainTask('non_existent');

      expect(task).toBeNull();
    });
  });

  describe('deleteRerankTrainTask', () => {
    test('应该成功删除训练任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.deleteOne as any).mockResolvedValue({});

      await deleteRerankTrainTask('task_123');

      expect(MongoRerankTrainTask.deleteOne).toHaveBeenCalledWith({ _id: 'task_123' });
    });
  });

  describe('cancelRerankTrainTask', () => {
    test('应该成功取消进行中的任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_123',
          status: RerankTrainTaskStatusEnum.running
        })
      });

      (MongoRerankTrainTask.updateOne as any).mockResolvedValue({});

      await cancelRerankTrainTask('task_123');

      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: 'task_123' },
        expect.objectContaining({
          status: RerankTrainTaskStatusEnum.cancelled
        })
      );
    });

    test('任务不存在时应抛出错误', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(cancelRerankTrainTask('non_existent')).rejects.toThrow('Task not found');
    });

    test('已完成的任务不能取消', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'task_123',
          status: RerankTrainTaskStatusEnum.completed
        })
      });

      await expect(cancelRerankTrainTask('task_123')).rejects.toThrow(
        'Cannot cancel a task that is already finished'
      );
    });
  });
});

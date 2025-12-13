import { describe, test, expect, vi, beforeEach } from 'vitest';
import { cleanupTrainModuleOnAppDelete } from '@fastgpt/service/core/app/controller';
import { cleanupTrainModuleOnDatasetDelete } from '@fastgpt/service/core/dataset/controller';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';

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
    find: vi.fn(),
    deleteMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/data/schema', () => ({
  MongoRerankTrainsetData: {
    deleteMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/trainset/schema', () => ({
  MongoRerankTrainset: {
    deleteMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/dataset_trainset/schema', () => ({
  MongoDatasetTrainset: {
    deleteMany: vi.fn()
  },
  MongoDatasetTrainsetData: {
    deleteMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/task/mq', () => ({
  rerankTrainTaskQueue: {
    getJob: vi.fn()
  }
}));

describe('Train Module Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('应用删除级联清理', () => {
    test('应该删除应用的所有训练数据', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      // Mock 无进行中的任务
      (MongoRerankTrainTask.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });

      (MongoRerankTrainTask.deleteMany as any).mockResolvedValue({ deletedCount: 2 });
      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 10 });
      (MongoRerankTrainset.deleteMany as any).mockResolvedValue({ deletedCount: 1 });

      const appIds = ['app_1', 'app_2'];
      await cleanupTrainModuleOnAppDelete(appIds);

      // 验证所有删除操作都被调用
      expect(MongoRerankTrainTask.find).toHaveBeenCalledWith(
        {
          appId: { $in: appIds },
          status: {
            $in: [RerankTrainTaskStatusEnum.pending, RerankTrainTaskStatusEnum.running]
          }
        },
        null,
        { session: undefined }
      );

      expect(MongoRerankTrainTask.deleteMany).toHaveBeenCalledWith(
        { appId: { $in: appIds } },
        { session: undefined }
      );

      expect(MongoRerankTrainsetData.deleteMany).toHaveBeenCalledWith(
        { appId: { $in: appIds } },
        { session: undefined }
      );

      expect(MongoRerankTrainset.deleteMany).toHaveBeenCalledWith(
        { appId: { $in: appIds } },
        { session: undefined }
      );
    });

    test('应该取消进行中的训练任务', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { rerankTrainTaskQueue } = await import('@fastgpt/service/core/train/rerank/task/mq');

      const mockJob = {
        remove: vi.fn().mockResolvedValue(undefined)
      };

      // Mock 有进行中的任务
      (MongoRerankTrainTask.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'task_1',
            appId: 'app_1',
            status: RerankTrainTaskStatusEnum.running,
            jobId: 'job_123'
          },
          {
            _id: 'task_2',
            appId: 'app_1',
            status: RerankTrainTaskStatusEnum.pending,
            jobId: 'job_456'
          }
        ])
      });

      (rerankTrainTaskQueue.getJob as any).mockResolvedValue(mockJob);
      (MongoRerankTrainTask.deleteMany as any).mockResolvedValue({ deletedCount: 2 });

      await cleanupTrainModuleOnAppDelete(['app_1']);

      // 验证任务被取消
      expect(rerankTrainTaskQueue.getJob).toHaveBeenCalledWith('job_123');
      expect(rerankTrainTaskQueue.getJob).toHaveBeenCalledWith('job_456');
      expect(mockJob.remove).toHaveBeenCalledTimes(2);
    });

    test('取消任务失败不应阻止删除流程', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { rerankTrainTaskQueue } = await import('@fastgpt/service/core/train/rerank/task/mq');

      // Mock 取消任务失败
      (MongoRerankTrainTask.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'task_1',
            appId: 'app_1',
            status: RerankTrainTaskStatusEnum.running,
            jobId: 'job_123'
          }
        ])
      });

      (rerankTrainTaskQueue.getJob as any).mockRejectedValue(new Error('Job not found'));
      (MongoRerankTrainTask.deleteMany as any).mockResolvedValue({ deletedCount: 1 });
      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 5 });

      // 不应抛出错误
      await expect(cleanupTrainModuleOnAppDelete(['app_1'])).resolves.not.toThrow();

      // 删除操作仍应继续
      expect(MongoRerankTrainTask.deleteMany).toHaveBeenCalled();
      expect(MongoRerankTrainsetData.deleteMany).toHaveBeenCalled();
    });

    test('空数组不应执行任何操作', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      await cleanupTrainModuleOnAppDelete([]);

      expect(MongoRerankTrainTask.find).not.toHaveBeenCalled();
      expect(MongoRerankTrainTask.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('知识库删除级联清理', () => {
    test('应该删除知识库的所有训练数据', async () => {
      const { MongoDatasetTrainset, MongoDatasetTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/schema'
      );

      (MongoDatasetTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 100 });
      (MongoDatasetTrainset.deleteMany as any).mockResolvedValue({ deletedCount: 5 });

      const datasetIds = ['dataset_1', 'dataset_2', 'dataset_3'];
      await cleanupTrainModuleOnDatasetDelete(datasetIds);

      // 验证所有删除操作都被调用
      expect(MongoDatasetTrainsetData.deleteMany).toHaveBeenCalledWith(
        { datasetId: { $in: datasetIds } },
        { session: undefined }
      );

      expect(MongoDatasetTrainset.deleteMany).toHaveBeenCalledWith(
        { datasetId: { $in: datasetIds } },
        { session: undefined }
      );
    });

    test('应该支持事务会话', async () => {
      const { MongoDatasetTrainset, MongoDatasetTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/schema'
      );

      const mockSession = { id: 'session_123' } as any;

      (MongoDatasetTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 50 });
      (MongoDatasetTrainset.deleteMany as any).mockResolvedValue({ deletedCount: 3 });

      await cleanupTrainModuleOnDatasetDelete(['dataset_1'], mockSession);

      // 验证传递了 session
      expect(MongoDatasetTrainsetData.deleteMany).toHaveBeenCalledWith(
        { datasetId: { $in: ['dataset_1'] } },
        { session: mockSession }
      );

      expect(MongoDatasetTrainset.deleteMany).toHaveBeenCalledWith(
        { datasetId: { $in: ['dataset_1'] } },
        { session: mockSession }
      );
    });

    test('空数组不应执行任何操作', async () => {
      const { MongoDatasetTrainset } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/schema'
      );

      await cleanupTrainModuleOnDatasetDelete([]);

      expect(MongoDatasetTrainset.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('级联删除数据一致性', () => {
    test('应用删除应清理所有层级的训练数据', async () => {
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      (MongoRerankTrainTask.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });

      let taskDeleted = false;
      let dataDeleted = false;
      let trainsetDeleted = false;

      (MongoRerankTrainTask.deleteMany as any).mockImplementation(() => {
        taskDeleted = true;
        return Promise.resolve({ deletedCount: 1 });
      });

      (MongoRerankTrainsetData.deleteMany as any).mockImplementation(() => {
        dataDeleted = true;
        return Promise.resolve({ deletedCount: 10 });
      });

      (MongoRerankTrainset.deleteMany as any).mockImplementation(() => {
        trainsetDeleted = true;
        return Promise.resolve({ deletedCount: 1 });
      });

      await cleanupTrainModuleOnAppDelete(['app_test']);

      // 验证所有层级的数据都被删除
      expect(taskDeleted).toBe(true);
      expect(dataDeleted).toBe(true);
      expect(trainsetDeleted).toBe(true);
    });
  });
});

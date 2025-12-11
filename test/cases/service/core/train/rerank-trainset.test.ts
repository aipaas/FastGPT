import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createRerankTrainset,
  getRerankTrainsetByAppId,
  getRerankTrainsetById,
  deleteRerankTrainset
} from '@fastgpt/service/core/train/rerank/trainset/controller';
import {
  authRerankTrainset,
  authRerankTrainsetByAppId,
  authGenerateFromDatasets
} from '@fastgpt/service/support/permission/train/rerank/auth';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/trainset/schema', () => ({
  MongoRerankTrainset: {
    create: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    deleteOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: vi.fn()
}));

describe('Rerank Trainset Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRerankTrainset', () => {
    test('应该成功创建应用训练集', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      // Mock app exists
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'app_123',
          name: 'Test App'
        })
      });

      // Mock no existing trainset
      (MongoRerankTrainset.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      // Mock create success
      (MongoRerankTrainset.create as any).mockResolvedValue([{ _id: 'trainset_123' }]);

      const trainsetId = await createRerankTrainset({
        appId: 'app_123',
        teamId: 'team_123',
        tmbId: 'tmb_123',
        name: 'My Trainset'
      });

      expect(trainsetId).toBe('trainset_123');
      expect(MongoApp.findById).toHaveBeenCalledWith('app_123');
      expect(MongoRerankTrainset.findOne).toHaveBeenCalledWith({ appId: 'app_123' });
      expect(MongoRerankTrainset.create).toHaveBeenCalled();
    });

    test('应用不存在时应抛出错误', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(
        createRerankTrainset({
          appId: 'non_existent_app',
          teamId: 'team_123',
          tmbId: 'tmb_123'
        })
      ).rejects.toThrow('App not found');
    });

    test('训练集已存在时应抛出错误（1:1关系约束）', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'app_123',
          name: 'Test App'
        })
      });

      (MongoRerankTrainset.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'existing_trainset',
          appId: 'app_123'
        })
      });

      await expect(
        createRerankTrainset({
          appId: 'app_123',
          teamId: 'team_123',
          tmbId: 'tmb_123'
        })
      ).rejects.toThrow('Trainset already exists for this app');
    });

    test('未提供名称时应使用默认名称', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      const mockApp = {
        _id: 'app_123',
        name: 'Test App'
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });
      (MongoRerankTrainset.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });
      (MongoRerankTrainset.create as any).mockResolvedValue([{ _id: 'trainset_123' }]);

      await createRerankTrainset({
        appId: 'app_123',
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      const createCall = (MongoRerankTrainset.create as any).mock.calls[0][0][0];
      expect(createCall.name).toBe('Test App - 训练集');
    });
  });

  describe('getRerankTrainsetByAppId', () => {
    test('应该通过 appId 查询训练集', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      const mockTrainset = {
        _id: 'trainset_123',
        appId: 'app_123',
        name: 'Test Trainset'
      };

      (MongoRerankTrainset.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainset)
      });

      const result = await getRerankTrainsetByAppId('app_123');

      expect(result).toEqual(mockTrainset);
      expect(MongoRerankTrainset.findOne).toHaveBeenCalledWith({ appId: 'app_123' });
    });
  });

  describe('getRerankTrainsetById', () => {
    test('应该通过 trainsetId 查询训练集', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      const mockTrainset = {
        _id: 'trainset_123',
        appId: 'app_123',
        name: 'Test Trainset'
      };

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainset)
      });

      const result = await getRerankTrainsetById('trainset_123');

      expect(result).toEqual(mockTrainset);
      expect(MongoRerankTrainset.findById).toHaveBeenCalledWith('trainset_123');
    });
  });

  describe('deleteRerankTrainset', () => {
    test('应该成功删除训练集', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      (MongoRerankTrainset.deleteOne as any).mockResolvedValue({ deletedCount: 1 });

      await deleteRerankTrainset('trainset_123');

      expect(MongoRerankTrainset.deleteOne).toHaveBeenCalledWith({ _id: 'trainset_123' });
    });
  });
});

describe('Rerank Trainset Permission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authRerankTrainset', () => {
    test('应该验证训练集权限并返回训练集信息', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { authApp } = await import('@fastgpt/service/support/permission/app/auth');

      const mockTrainset = {
        _id: 'trainset_123',
        appId: 'app_123',
        name: 'Test Trainset'
      };

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainset)
      });

      (authApp as any).mockResolvedValue({
        app: { _id: 'app_123', name: 'Test App' },
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      const result = await authRerankTrainset({
        trainsetId: 'trainset_123',
        per: 1,
        req: {} as any,
        authToken: true
      });

      expect(result.trainset).toEqual(mockTrainset);
      expect(authApp).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'app_123',
          per: 1
        })
      );
    });

    test('训练集不存在时应拒绝', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(
        authRerankTrainset({
          trainsetId: 'non_existent',
          per: 1,
          req: {} as any,
          authToken: true
        })
      ).rejects.toBeDefined();
    });
  });

  describe('authRerankTrainsetByAppId', () => {
    test('应该通过 appId 验证训练集权限', async () => {
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { authApp } = await import('@fastgpt/service/support/permission/app/auth');

      const mockTrainset = {
        _id: 'trainset_123',
        appId: 'app_123',
        name: 'Test Trainset'
      };

      (MongoRerankTrainset.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainset)
      });

      (authApp as any).mockResolvedValue({
        app: { _id: 'app_123', name: 'Test App' },
        teamId: 'team_123',
        tmbId: 'tmb_123'
      });

      const result = await authRerankTrainsetByAppId({
        appId: 'app_123',
        per: 1,
        req: {} as any,
        authToken: true
      });

      expect(result.trainset).toEqual(mockTrainset);
    });
  });

  describe('authGenerateFromDatasets', () => {
    test('应该验证所有知识库的读权限', async () => {
      const { authDataset } = await import('@fastgpt/service/support/permission/dataset/auth');

      const mockDatasets = [
        { _id: 'dataset_1', name: 'Dataset 1' },
        { _id: 'dataset_2', name: 'Dataset 2' }
      ];

      (authDataset as any)
        .mockResolvedValueOnce({ dataset: mockDatasets[0] })
        .mockResolvedValueOnce({ dataset: mockDatasets[1] });

      const result = await authGenerateFromDatasets({
        datasetIds: ['dataset_1', 'dataset_2'],
        req: {} as any,
        authToken: true
      });

      expect(result.datasets).toHaveLength(2);
      expect(authDataset).toHaveBeenCalledTimes(2);
      expect(authDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetId: 'dataset_1'
        })
      );
    });
  });
});

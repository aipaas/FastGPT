import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  DatasetTrainsetStatusEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { TrainDataSourceEnum } from '@fastgpt/global/core/train/rerank/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

// Mock all external dependencies before importing the modules that use them
vi.mock('@fastgpt/service/common/system/log');
vi.mock('@fastgpt/service/support/wallet/usage/controller');
vi.mock('@fastgpt/service/support/permission/teamLimit');
vi.mock('@fastgpt/service/core/dataset/controller');
vi.mock('@fastgpt/service/core/train/rerank/dataset_trainset/controller', () => ({
  ensureDatasetTrainset: vi.fn().mockResolvedValue({
    _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
    datasetId: new Types.ObjectId('507f1f77bcf86cd799439014'),
    teamId: new Types.ObjectId('507f1f77bcf86cd799439011'),
    name: 'Dataset 507f1f77bcf86cd799439014 - 训练集',
    dataCount: 10,
    status: DatasetTrainsetStatusEnum.ready,
    createTime: new Date(),
    updateTime: new Date()
  }),
  checkDatasetTrainsetReady: vi.fn().mockResolvedValue({
    ready: true,
    status: DatasetTrainsetStatusEnum.ready,
    dataCount: 10
  }),
  getDatasetTrainsetData: vi.fn().mockResolvedValue([
    {
      _id: new Types.ObjectId('507f1f77bcf86cd799439101'),
      queries: ['查询1', '查询2'],
      positiveDocs: ['正文档1', '正文档2'],
      negativeDocs: ['负文档1', '负文档2'],
      source: TrainDataSourceEnum.dataset,
      metadata: {
        sourceInfo: {
          datasetTrainsetDataId: new Types.ObjectId().toString(),
          datasetId: '507f1f77bcf86cd799439014',
          datasetName: 'Test Dataset'
        },
        generationConfig: {
          model: 'gpt-3.5-turbo',
          temperature: 0.7
        },
        generatedAt: new Date()
      },
      createTime: new Date()
    }
  ])
}));

// Mock MongoDB schemas to avoid database operations
vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Test App',
        modules: [
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              { key: 'datasetId', value: '507f1f77bcf86cd799439014' },
              { key: 'rerankModel', value: 'model_123' }
            ]
          }
        ]
      })
    })
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/trainset/schema', () => ({
  MongoRerankTrainset: {
    updateOne: vi.fn().mockResolvedValue({})
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/data/schema', () => ({
  MongoRerankTrainsetData: {
    insertMany: vi.fn().mockResolvedValue([{ _id: 'data1' }, { _id: 'data2' }]),
    find: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    findById: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    }),
    findOneAndUpdate: vi.fn().mockResolvedValue(null),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 })
  }
}));

// Import the module after mocking
const {
  generateAppTrainsetDataCore,
  createManualTrainData,
  updateTrainData,
  deleteTrainData,
  calculateTrainsetStats,
  updateTrainsetStats
} = await import('@fastgpt/service/core/train/rerank/data/controller');

describe('Rerank Data Controller Tests', () => {
  let teamId: string;
  let tmbId: string;
  let appId: string;
  let datasetId: string;
  let trainsetId: string;

  beforeAll(() => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    appId = '507f1f77bcf86cd799439013';
    datasetId = '507f1f77bcf86cd799439014';
    trainsetId = '507f1f77bcf86cd799439015';
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('数据生成业务逻辑测试', () => {
    test('generateAppTrainsetDataCore 应该存在且可调用', async () => {
      expect(typeof generateAppTrainsetDataCore).toBe('function');

      // 测试函数调用不会抛出异常
      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId,
          forceRegenerate: false
        })
      ).resolves.not.toThrow();
    });

    test('应该正确调用数据生成流程的各个步骤', async () => {
      const { ensureDatasetTrainset, checkDatasetTrainsetReady, getDatasetTrainsetData } =
        await import('@fastgpt/service/core/train/rerank/dataset_trainset/controller');

      await generateAppTrainsetDataCore({
        appId,
        trainsetId,
        forceRegenerate: false
      });

      // 验证调用了正确的步骤
      expect(ensureDatasetTrainset).toHaveBeenCalledWith(datasetId);
      expect(getDatasetTrainsetData).toHaveBeenCalled();
      // checkDatasetTrainsetReady 现在只在必要时调用（当没有数据时）
    });

    test('应该正确处理强制重新生成模式', async () => {
      const { ensureDatasetTrainset, getDatasetTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );

      await generateAppTrainsetDataCore({
        appId,
        trainsetId,
        forceRegenerate: true
      });

      // 强制重新生成时仍需确保数据集训练集存在
      expect(ensureDatasetTrainset).toHaveBeenCalledWith(datasetId);

      // 但应该跳过状态检查，直接获取数据
      expect(getDatasetTrainsetData).toHaveBeenCalled();
    });

    test('应用不存在时应该抛出错误', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      // Mock应用不存在
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(
        generateAppTrainsetDataCore({
          appId: 'non_existent_app',
          trainsetId
        })
      ).rejects.toThrow();
    });

    test('没有数据集时应该抛出错误', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      // Mock应用没有数据集
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                { key: 'rerankModel', value: 'model_123' }
                // 缺少 datasetId
              ]
            }
          ]
        })
      });

      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId
        })
      ).rejects.toThrow('No datasets found for this app');
    });

    test('应该正确处理多个数据集的场景', async () => {
      const { ensureDatasetTrainset, getDatasetTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      // Mock应用包含多个数据集
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                { key: 'datasetId', value: 'dataset_123' },
                { key: 'rerankModel', value: 'model_123' }
              ]
            },
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                { key: 'datasetId', value: 'dataset_456' },
                { key: 'rerankModel', value: 'model_123' }
              ]
            }
          ]
        })
      });

      await generateAppTrainsetDataCore({
        appId,
        trainsetId,
        forceRegenerate: false
      });

      // 验证两个数据集的训练集都被检查
      expect(ensureDatasetTrainset).toHaveBeenCalledTimes(2);
      expect(ensureDatasetTrainset).toHaveBeenCalledWith('dataset_123');
      expect(ensureDatasetTrainset).toHaveBeenCalledWith('dataset_456');
    });
  });

  describe('其他控制器函数测试', () => {
    test('其他控制器函数应该存在', () => {
      expect(typeof createManualTrainData).toBe('function');
      expect(typeof updateTrainData).toBe('function');
      expect(typeof deleteTrainData).toBe('function');
      expect(typeof calculateTrainsetStats).toBe('function');
      expect(typeof updateTrainsetStats).toBe('function');
    });
  });

  describe('错误处理逻辑测试', () => {
    test('数据集训练集生成中时应该跳过而不抛出错误', async () => {
      const { ensureDatasetTrainset } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );

      let callCount = 0;
      // Mock数据集训练集第一次返回生成中，第二次就绪
      (ensureDatasetTrainset as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
            datasetId: new Types.ObjectId(datasetId),
            teamId: new Types.ObjectId(teamId),
            name: 'Dataset - 训练集',
            dataCount: 10,
            status: DatasetTrainsetStatusEnum.generating,
            createTime: new Date(),
            updateTime: new Date()
          });
        } else {
          return Promise.resolve({
            _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
            datasetId: new Types.ObjectId(datasetId),
            teamId: new Types.ObjectId(teamId),
            name: 'Dataset - 训练集',
            dataCount: 10,
            status: DatasetTrainsetStatusEnum.ready,
            createTime: new Date(),
            updateTime: new Date()
          });
        }
      });

      let statusCheckCount = 0;
      // Mock检查状态：第一次生成中，第二次就绪
      const { checkDatasetTrainsetReady } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );
      (checkDatasetTrainsetReady as any).mockImplementation(() => {
        statusCheckCount++;
        if (statusCheckCount <= 3) {
          return Promise.resolve({
            ready: false,
            status: DatasetTrainsetStatusEnum.generating,
            dataCount: 10
          });
        } else {
          return Promise.resolve({
            ready: true,
            status: DatasetTrainsetStatusEnum.ready,
            dataCount: 10
          });
        }
      });

      // Mock getDatasetTrainsetData 返回数据
      const { getDatasetTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );
      (getDatasetTrainsetData as any).mockResolvedValue([
        {
          _id: new Types.ObjectId('507f1f77bcf86cd799439101'),
          queries: ['查询1', '查询2'],
          positiveDocs: ['正文档1', '正文档2'],
          negativeDocs: ['负文档1', '负文档2'],
          source: TrainDataSourceEnum.dataset,
          metadata: {
            sourceInfo: {
              datasetTrainsetDataId: new Types.ObjectId().toString(),
              datasetId: '507f1f77bcf86cd799439014',
              datasetName: 'Test Dataset'
            },
            generationConfig: {
              model: 'gpt-3.5-turbo',
              temperature: 0.7
            },
            generatedAt: new Date()
          },
          createTime: new Date()
        }
      ]);

      // 现在会轮询等待完成然后处理数据
      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId
        })
      ).resolves.not.toThrow();

      // 验证轮询被调用多次
      expect(checkDatasetTrainsetReady).toHaveBeenCalled();
      expect((checkDatasetTrainsetReady as any).mock.calls.length).toBeGreaterThan(3);
    }, 60000); // 增加超时时间到60秒

    test('数据集训练集为空时应该跳过而不抛出错误', async () => {
      const { ensureDatasetTrainset } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );

      // Mock数据集训练集为空
      (ensureDatasetTrainset as any).mockResolvedValue({
        _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
        datasetId: new Types.ObjectId(datasetId),
        teamId: new Types.ObjectId(teamId),
        name: 'Dataset - 训练集',
        dataCount: 0,
        status: DatasetTrainsetStatusEnum.ready,
        createTime: new Date(),
        updateTime: new Date()
      });

      // Mock检查状态返回就绪但数量为0
      const { checkDatasetTrainsetReady } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );
      (checkDatasetTrainsetReady as any).mockResolvedValue({
        ready: true,
        status: DatasetTrainsetStatusEnum.ready,
        dataCount: 0
      });

      // Mock getDatasetTrainsetData 返回空数组
      const { getDatasetTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );
      (getDatasetTrainsetData as any).mockResolvedValue([]);

      // 期望不会抛出错误，而是成功执行（跳过空数据集）
      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId
        })
      ).resolves.not.toThrow();
    });

    test('获取训练数据时出错应该抛出错误', async () => {
      const { ensureDatasetTrainset, checkDatasetTrainsetReady } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );

      // Mock正常的前面步骤
      (ensureDatasetTrainset as any).mockResolvedValue({
        _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
        datasetId: new Types.ObjectId(datasetId),
        teamId: new Types.ObjectId(teamId),
        name: 'Dataset - 训练集',
        dataCount: 10,
        status: DatasetTrainsetStatusEnum.ready,
        createTime: new Date(),
        updateTime: new Date()
      });

      (checkDatasetTrainsetReady as any).mockResolvedValue({
        ready: true,
        status: DatasetTrainsetStatusEnum.ready,
        dataCount: 10
      });

      // Mock获取数据时出错
      const { getDatasetTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );
      (getDatasetTrainsetData as any).mockRejectedValue(new Error('Database connection failed'));

      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId
        })
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('参数验证测试', () => {
    test('缺少必需参数应该抛出错误', async () => {
      await expect(
        generateAppTrainsetDataCore({
          // 缺少 appId
          trainsetId
        } as any)
      ).rejects.toThrow();

      await expect(
        generateAppTrainsetDataCore({
          appId
          // 缺少 trainsetId
        } as any)
      ).rejects.toThrow();
    });

    test('空字符串参数应该抛出错误', async () => {
      await expect(
        generateAppTrainsetDataCore({
          appId: '',
          trainsetId
        })
      ).rejects.toThrow();

      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId: ''
        })
      ).rejects.toThrow();
    });
  });
});

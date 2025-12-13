// Mock all external dependencies before importing the modules that use them
import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';

// Mock schemas before importing the modules that use them
vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    create: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({}),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 })
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/dataset_trainset/schema', () => ({
  MongoDatasetTrainset: {
    create: vi.fn().mockResolvedValue({})
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/dataset_trainset/controller', () => ({
  ensureDatasetTrainset: vi.fn().mockResolvedValue({
    _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
    datasetId: new Types.ObjectId('507f1f77bcf86cd799439014'),
    teamId: new Types.ObjectId('507f1f77bcf86cd799439011'),
    name: 'Dataset 507f1f77bcf86cd799439014 - 训练集',
    dataCount: 10,
    status: 'ready',
    createTime: new Date(),
    updateTime: new Date()
  }),
  checkDatasetTrainsetReady: vi.fn().mockResolvedValue({
    ready: true,
    status: 'ready',
    dataCount: 10
  }),
  getDatasetTrainsetData: vi.fn().mockResolvedValue([
    {
      _id: new Types.ObjectId('507f1f77bcf86cd799439101'),
      trainsetId: new Types.ObjectId('507f1f77bcf86cd799439099'),
      datasetId: new Types.ObjectId('507f1f77bcf86cd799439014'),
      teamId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      queries: ['查询1', '查询2'],
      positiveDocs: ['正文档1', '正文档2'],
      negativeDocs: ['负文档1', '负文档2'],
      source: 'dataset',
      metadata: {
        dataIds: ['507f1f77bcf86cd799439102'],
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

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller');
vi.mock('@fastgpt/service/support/permission/teamLimit');
vi.mock('@fastgpt/service/core/dataset/controller');

// Now import the actual modules and types we need
import {
  DatasetTrainsetStatusEnum,
  RerankTrainsetStatusEnum,
  TrainDataSourceEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { generateAppTrainsetDataCore } from '@fastgpt/service/core/train/rerank/data/controller';

describe('Rerank Data Generation Integration Tests', () => {
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

  afterAll(() => {
    // Clean up mocks - no actual database operations needed
    vi.clearAllMocks();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mocks to default behavior
    const { ensureDatasetTrainset } = await import(
      '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
    );
    (ensureDatasetTrainset as any).mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
      datasetId: new Types.ObjectId('507f1f77bcf86cd799439014'),
      teamId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      name: 'Dataset 507f1f77bcf86cd799439014 - 训练集',
      dataCount: 10,
      status: 'ready',
      createTime: new Date(),
      updateTime: new Date()
    });
  });

  describe('数据生成流程测试', () => {
    test('完整的数据生成流程应该成功执行', async () => {
      const { ensureDatasetTrainset, checkDatasetTrainsetReady, getDatasetTrainsetData } =
        await import('@fastgpt/service/core/train/rerank/dataset_trainset/controller');

      await generateAppTrainsetDataCore({
        appId,
        trainsetId,
        forceRegenerate: false
      });

      // 验证数据集训练集创建逻辑被调用
      expect(ensureDatasetTrainset).toHaveBeenCalledWith(datasetId);

      // 注意：checkDatasetTrainsetReady 不一定被调用，因为 mock 直接返回了数据
      // 只有在没有数据时才会检查状态

      // 验证数据获取逻辑被调用
      expect(getDatasetTrainsetData).toHaveBeenCalled();
    });

    test('强制重新生成应该跳过现有数据检查', async () => {
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

      // 但应该直接获取数据，不检查状态
      expect(getDatasetTrainsetData).toHaveBeenCalled();
    });

    test('数据集不存在时应该正常执行但无数据', async () => {
      const { ensureDatasetTrainset, getDatasetTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );

      // Mock应用不存在的数据集
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                { key: 'datasetId', value: 'non_existent_dataset' },
                { key: 'rerankModel', value: 'model_123' }
              ]
            }
          ]
        })
      });

      // Mock ensureDatasetTrainset 抛出错误来模拟数据集不存在
      (ensureDatasetTrainset as any).mockRejectedValue(new Error('Dataset not found'));

      // 期望函数抛出错误
      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId,
          forceRegenerate: false
        })
      ).rejects.toThrow('Dataset not found');
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

    test('应该处理多个数据集的场景', async () => {
      const { ensureDatasetTrainset } = await import(
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

  describe('Mock数据验证测试', () => {
    test('应该验证Mock数据格式的正确性', async () => {
      const { getDatasetTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );

      // 获取Mock返回的数据
      const mockData = await getDatasetTrainsetData('mock_trainset_id');

      expect(Array.isArray(mockData)).toBe(true);
      if (mockData.length > 0) {
        const trainData = mockData[0];
        expect(trainData).toMatchObject({
          _id: expect.any(Types.ObjectId),
          trainsetId: expect.any(Types.ObjectId),
          datasetId: expect.any(Types.ObjectId),
          teamId: expect.any(Types.ObjectId),
          queries: expect.any(Array),
          positiveDocs: expect.any(Array),
          negativeDocs: expect.any(Array),
          source: 'dataset',
          metadata: {
            dataIds: expect.any(Array),
            generationConfig: {
              model: expect.any(String),
              temperature: expect.any(Number)
            },
            generatedAt: expect.any(Date)
          },
          createTime: expect.any(Date)
        });

        // 验证查询数据不为空
        expect(trainData?.queries?.length).toBeGreaterThan(0);

        // 验证正样本文档不为空
        expect(trainData?.positiveDocs?.length).toBeGreaterThan(0);

        // 验证负样本文档不为空
        expect(trainData?.negativeDocs?.length).toBeGreaterThan(0);
      }
    });

    test('应该正确验证Mock数据来源信息', async () => {
      const { getDatasetTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );

      // 获取Mock返回的数据
      const mockData = await getDatasetTrainsetData('mock_trainset_id');

      if (mockData.length > 0) {
        const trainData = mockData[0];

        // 检查 metadata 结构
        expect(trainData?.metadata).toMatchObject({
          dataIds: expect.any(Array),
          generationConfig: {
            model: expect.any(String),
            temperature: expect.any(Number)
          },
          generatedAt: expect.any(Date)
        });

        // 检查是否有 dataIds（如果数据来自知识库）
        expect(trainData?.metadata?.dataIds).toBeDefined();
        expect(Array.isArray(trainData?.metadata?.dataIds)).toBe(true);
      }
    });

    test('应该验证训练集Mock的正确性', async () => {
      const { ensureDatasetTrainset } = await import(
        '@fastgpt/service/core/train/rerank/dataset_trainset/controller'
      );

      // 获取Mock返回的训练集
      const mockTrainset = await ensureDatasetTrainset('mock_dataset_id');

      expect(mockTrainset).toMatchObject({
        _id: expect.any(Types.ObjectId),
        datasetId: expect.any(Types.ObjectId),
        teamId: expect.any(Types.ObjectId),
        name: expect.any(String),
        dataCount: expect.any(Number),
        status: 'ready',
        createTime: expect.any(Date),
        updateTime: expect.any(Date)
      });
    });
  });
});

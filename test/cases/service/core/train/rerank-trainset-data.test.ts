import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createManualTrainData,
  updateTrainData,
  deleteTrainData,
  calculateTrainsetStats,
  updateTrainsetStats,
  generateAppTrainsetDataCore
} from '@fastgpt/service/core/train/rerank/data/controller';
import { TrainDataSourceEnum } from '@fastgpt/global/core/train/rerank/constants';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/data/schema', () => ({
  MongoRerankTrainsetData: {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn(),
    deleteMany: vi.fn(),
    insertMany: vi.fn(),
    countDocuments: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/trainset/schema', () => ({
  MongoRerankTrainset: {
    updateOne: vi.fn(),
    findById: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/dataset_trainset/controller', () => ({
  ensureDatasetTrainset: vi.fn(),
  checkDatasetTrainsetReady: vi.fn(),
  getDatasetTrainsetData: vi.fn()
}));

describe('Rerank Trainset Data Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createManualTrainData', () => {
    test('应该成功创建手动训练数据', async () => {
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      // Mock create
      (MongoRerankTrainsetData.create as any).mockResolvedValue([{ _id: 'data_123' }]);

      // Mock stats calculation
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            queries: ['q1'],
            positiveDocs: ['p1'],
            negativeDocs: ['n1'],
            source: TrainDataSourceEnum.manual,
            metadata: { sourceInfo: {} }
          }
        ])
      });

      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      const dataId = await createManualTrainData({
        trainsetId: 'trainset_123',
        appId: 'app_123',
        teamId: 'team_123',
        tmbId: 'tmb_123',
        queries: ['test query'],
        positiveDocs: ['positive doc'],
        negativeDocs: ['negative doc'],
        reason: 'test reason'
      });

      expect(dataId).toBe('data_123');
      expect(MongoRerankTrainsetData.create).toHaveBeenCalled();
      expect(MongoRerankTrainsetData.find).toHaveBeenCalledWith({ trainsetId: 'trainset_123' });
    });
  });

  describe('updateTrainData', () => {
    test('应该成功更新训练数据', async () => {
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      // Mock findById
      (MongoRerankTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'data_123',
          trainsetId: 'trainset_123'
        })
      });

      // Mock updateOne
      (MongoRerankTrainsetData.updateOne as any).mockResolvedValue({});

      // Mock stats
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            queries: ['updated query'],
            positiveDocs: ['p1'],
            negativeDocs: ['n1'],
            source: TrainDataSourceEnum.manual,
            metadata: { sourceInfo: {} }
          }
        ])
      });

      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      await updateTrainData({
        dataId: 'data_123',
        queries: ['updated query']
      });

      expect(MongoRerankTrainsetData.updateOne).toHaveBeenCalledWith(
        { _id: 'data_123' },
        { queries: ['updated query'] }
      );
    });
  });

  describe('deleteTrainData', () => {
    test('应该成功删除训练数据', async () => {
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      // Mock findById
      (MongoRerankTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'data_123',
          trainsetId: 'trainset_123'
        })
      });

      // Mock deleteMany
      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({
        deletedCount: 2
      });

      // Mock stats
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });

      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      const deletedCount = await deleteTrainData(['data_123', 'data_456']);

      expect(deletedCount).toBe(2);
      expect(MongoRerankTrainsetData.deleteMany).toHaveBeenCalledWith({
        _id: { $in: ['data_123', 'data_456'] },
        trainsetId: 'trainset_123'
      });
    });

    test('数据不存在时应抛出错误', async () => {
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      (MongoRerankTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(deleteTrainData(['non_existent_id'])).rejects.toThrow('Train data not found');
    });
  });

  describe('calculateTrainsetStats', () => {
    test('应该正确计算统计信息', async () => {
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      // Mock training data
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            queries: ['q1', 'q2'],
            positiveDocs: ['p1'],
            negativeDocs: ['n1', 'n2'],
            source: TrainDataSourceEnum.dataset,
            metadata: {
              sourceInfo: {
                datasetId: 'dataset_123',
                datasetName: 'Test Dataset'
              }
            }
          },
          {
            queries: ['q3'],
            positiveDocs: ['p2', 'p3'],
            negativeDocs: ['n3'],
            source: TrainDataSourceEnum.manual,
            metadata: {
              sourceInfo: {}
            }
          }
        ])
      });

      const stats = await calculateTrainsetStats('trainset_123');

      expect(stats.dataCount).toBe(2);
      expect(stats.positiveCount).toBe(3); // p1 + p2 + p3
      expect(stats.negativeCount).toBe(3); // n1 + n2 + n3
      expect(stats.sourceSummary).toHaveLength(2);
      expect(stats.sourceSummary[0].type).toBe('dataset');
      expect(stats.sourceSummary[0].count).toBe(1);
      expect(stats.sourceSummary[1].type).toBe('manual');
      expect(stats.sourceSummary[1].count).toBe(1);
    });

    test('空数据应返回零统计', async () => {
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });

      const stats = await calculateTrainsetStats('trainset_123');

      expect(stats.dataCount).toBe(0);
      expect(stats.positiveCount).toBe(0);
      expect(stats.negativeCount).toBe(0);
      expect(stats.sourceSummary).toHaveLength(0);
    });
  });

  describe('updateTrainsetStats', () => {
    test('应该更新训练集统计并设置正确状态', async () => {
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );

      // Mock data
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            queries: ['q1'],
            positiveDocs: ['p1'],
            negativeDocs: ['n1'],
            source: TrainDataSourceEnum.manual,
            metadata: { sourceInfo: {} }
          }
        ])
      });

      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      await updateTrainsetStats('trainset_123');

      expect(MongoRerankTrainset.updateOne).toHaveBeenCalledWith(
        { _id: 'trainset_123' },
        expect.objectContaining({
          dataCount: 1,
          positiveCount: 1,
          negativeCount: 1,
          status: 'ready'
        })
      );
    });
  });

  describe('generateAppTrainsetDataCore', () => {
    test('应该成功从知识库拷贝数据', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { ensureDatasetTrainset, checkDatasetTrainsetReady, getDatasetTrainsetData } =
        await import('@fastgpt/service/core/train/rerank/dataset_trainset/controller');

      // Mock app with dataset search nodes containing datasets
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'app_123',
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                {
                  key: 'datasetId',
                  value: 'dataset_123'
                }
              ]
            },
            {
              flowNodeType: 'otherNode',
              someField: 'value'
            }
          ]
        })
      });

      // Mock trainset update
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      // Mock dataset trainset
      (ensureDatasetTrainset as any).mockResolvedValue({
        _id: 'ds_trainset_123',
        name: 'Test Dataset - 训练集'
      });

      (checkDatasetTrainsetReady as any).mockResolvedValue({
        ready: true,
        status: 'ready'
      });

      (getDatasetTrainsetData as any).mockResolvedValue([
        {
          _id: 'ds_data_123',
          teamId: 'team_123',
          queries: ['query 1'],
          positiveDocs: ['doc 1'],
          negativeDocs: ['doc 2'],
          metadata: {
            dataIds: ['data_id_1'],
            generationConfig: {
              model: 'gpt-4',
              temperature: 0.7
            }
          }
        }
      ]);

      (MongoRerankTrainsetData.insertMany as any).mockResolvedValue([]);
      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({});
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            queries: ['query 1'],
            positiveDocs: ['doc 1'],
            negativeDocs: ['doc 2'],
            source: TrainDataSourceEnum.dataset,
            metadata: {
              sourceInfo: {
                datasetId: 'dataset_123',
                datasetName: 'Test Dataset'
              }
            }
          }
        ])
      });

      await generateAppTrainsetDataCore({
        appId: 'app_123',
        trainsetId: 'trainset_123',
        forceRegenerate: false
      });

      expect(ensureDatasetTrainset).toHaveBeenCalledWith('dataset_123');
      expect(checkDatasetTrainsetReady).toHaveBeenCalledWith('ds_trainset_123');
      expect(getDatasetTrainsetData).toHaveBeenCalledWith('ds_trainset_123');
      expect(MongoRerankTrainsetData.insertMany).toHaveBeenCalled();
    });

    test('应用不存在时应抛出错误', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(
        generateAppTrainsetDataCore({
          appId: 'non_existent_app',
          trainsetId: 'trainset_123'
        })
      ).rejects.toThrow('App not found');
    });

    test('没有知识库时应抛出错误', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'app_123',
          modules: [{ flowNodeType: 'otherNode', someField: 'value' }]
        })
      });

      await expect(
        generateAppTrainsetDataCore({
          appId: 'app_123',
          trainsetId: 'trainset_123'
        })
      ).rejects.toThrow('No datasets found for this app');
    });

    test('知识库训练集未就绪时应该等待超时后跳过', async () => {
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { MongoRerankTrainset } = await import(
        '@fastgpt/service/core/train/rerank/trainset/schema'
      );
      const { ensureDatasetTrainset, checkDatasetTrainsetReady, getDatasetTrainsetData } =
        await import('@fastgpt/service/core/train/rerank/dataset_trainset/controller');

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'app_123',
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                {
                  key: 'datasetId',
                  value: 'dataset_123'
                }
              ]
            }
          ]
        })
      });

      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      (ensureDatasetTrainset as any).mockResolvedValue({
        _id: 'ds_trainset_123'
      });

      // Mock 错误状态，这会立即抛出错误而不是轮询等待
      (checkDatasetTrainsetReady as any).mockResolvedValue({
        ready: false,
        status: 'error',
        errorMsg: 'Generation failed'
      });

      // 新的轮询逻辑在遇到错误状态时会抛出错误
      await expect(
        generateAppTrainsetDataCore({
          appId: 'app_123',
          trainsetId: 'trainset_123'
        })
      ).rejects.toThrow('Generation failed');
    }, 15000); // 增加超时时间到15秒
  });
});

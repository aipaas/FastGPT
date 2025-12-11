import { addLog } from '../../../common/system/log';
import { initDatasetTrainsetWorker } from './dataset_trainset/worker';

/**
 * 初始化 Rerank 训练模块的所有 Workers
 */
export const initRerankTrainWorkers = () => {
  addLog.info('Init Rerank Train Workers...');

  // 初始化知识库训练集生成 Worker
  initDatasetTrainsetWorker();
};

// 导出所有公共函数和类型
export * from './dataset_trainset/controller';
export * from './dataset_trainset/schema';

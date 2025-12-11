import { i18nT } from '../../../../web/i18n/utils';
import { type ErrType } from '../errorCode';

/* train: 502000 */
export enum RerankTrainErrEnum {
  // 应用训练集错误
  trainsetNotExist = 'trainsetNotExist',
  trainsetAlreadyExist = 'trainsetAlreadyExist',
  trainsetGenerating = 'trainsetGenerating',
  trainsetAlreadyReady = 'trainsetAlreadyReady',
  trainsetNotReady = 'trainsetNotReady',
  trainsetInUse = 'trainsetInUse',

  // 知识库训练集错误
  datasetTrainsetGenerating = 'datasetTrainsetGenerating',

  // 训练数据错误
  trainDataNotExist = 'trainDataNotExist',
  noTrainDataAvailable = 'noTrainDataAvailable',
  noDatasetAvailable = 'noDatasetAvailable',

  // 训练任务错误
  taskNotExist = 'taskNotExist',
  taskAlreadyRunning = 'taskAlreadyRunning',
  taskCannotRetry = 'taskCannotRetry',
  taskRetryExceeded = 'taskRetryExceeded',
  taskCannotCancel = 'taskCannotCancel',
  taskCannotDelete = 'taskCannotDelete',

  // 外部服务错误
  ditingServiceError = 'ditingServiceError',
  aicpServiceError = 'aicpServiceError'
}

const trainErr = [
  {
    statusText: RerankTrainErrEnum.trainsetNotExist,
    message: '训练集不存在'
  },
  {
    statusText: RerankTrainErrEnum.trainsetAlreadyExist,
    message: '该应用已存在训练集'
  },
  {
    statusText: RerankTrainErrEnum.trainsetGenerating,
    message: '训练数据生成中，请稍后'
  },
  {
    statusText: RerankTrainErrEnum.trainsetAlreadyReady,
    message: '训练集已就绪，无需重复生成'
  },
  {
    statusText: RerankTrainErrEnum.trainsetNotReady,
    message: '训练集未就绪，请先生成训练数据'
  },
  {
    statusText: RerankTrainErrEnum.trainsetInUse,
    message: '训练集正在被使用，无法删除'
  },
  {
    statusText: RerankTrainErrEnum.datasetTrainsetGenerating,
    message: '知识库训练集生成中，请稍后'
  },
  {
    statusText: RerankTrainErrEnum.trainDataNotExist,
    message: '训练数据不存在'
  },
  {
    statusText: RerankTrainErrEnum.noTrainDataAvailable,
    message: '没有可用的训练数据'
  },
  {
    statusText: RerankTrainErrEnum.noDatasetAvailable,
    message: '应用未关联知识库'
  },
  {
    statusText: RerankTrainErrEnum.taskNotExist,
    message: '训练任务不存在'
  },
  {
    statusText: RerankTrainErrEnum.taskAlreadyRunning,
    message: '该应用已有进行中的训练任务'
  },
  {
    statusText: RerankTrainErrEnum.taskCannotRetry,
    message: '任务状态不允许重试'
  },
  {
    statusText: RerankTrainErrEnum.taskRetryExceeded,
    message: '任务重试次数已达上限'
  },
  {
    statusText: RerankTrainErrEnum.taskCannotCancel,
    message: '任务状态不允许取消'
  },
  {
    statusText: RerankTrainErrEnum.taskCannotDelete,
    message: '进行中的任务不能删除'
  },
  {
    statusText: RerankTrainErrEnum.ditingServiceError,
    message: 'DiTing 服务调用失败'
  },
  {
    statusText: RerankTrainErrEnum.aicpServiceError,
    message: 'AICP 训推平台调用失败'
  }
];

export default trainErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 502000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${RerankTrainErrEnum}`>);

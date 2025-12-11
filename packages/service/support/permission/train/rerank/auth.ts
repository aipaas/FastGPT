import type { AuthModeType } from '../../type';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { authApp } from '../../app/auth';
import { authDataset } from '../../dataset/auth';
import { MongoRerankTrainset } from '../../../../core/train/rerank/trainset/schema';
import { MongoRerankTrainTask } from '../../../../core/train/rerank/task/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

/**
 * Rerank 应用训练集权限认证 - 复用 App 权限
 */
export async function authRerankTrainset({
  trainsetId,
  per,
  ...props
}: AuthModeType & {
  trainsetId: string;
  per: PermissionValueType;
}) {
  const trainset = await MongoRerankTrainset.findById(trainsetId).lean();
  if (!trainset) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotExist);
  }

  // 复用应用权限
  const result = await authApp({
    ...props,
    appId: String(trainset.appId),
    per
  });

  return { ...result, trainset };
}

/**
 * 通过 appId 认证应用训练集权限
 */
export async function authRerankTrainsetByAppId({
  appId,
  per,
  ...props
}: AuthModeType & {
  appId: string;
  per: PermissionValueType;
}) {
  const trainset = await MongoRerankTrainset.findOne({ appId }).lean();
  if (!trainset) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotExist);
  }

  const result = await authApp({
    ...props,
    appId,
    per
  });

  return { ...result, trainset };
}

/**
 * 验证从知识库生成训练数据的权限
 */
export async function authGenerateFromDatasets({
  datasetIds,
  ...props
}: AuthModeType & {
  datasetIds: string[];
}) {
  // 验证每个知识库的读权限
  const datasets = await Promise.all(
    datasetIds.map(async (datasetId) => {
      const { dataset } = await authDataset({
        ...props,
        datasetId,
        per: ReadPermissionVal
      });
      return dataset;
    })
  );

  return { datasets };
}

/**
 * Rerank 训练任务权限认证 - 复用 App 权限
 * 注意：此函数在训练任务模块中使用，这里先预定义
 */
export async function authRerankTrainTask({
  taskId,
  per,
  ...props
}: AuthModeType & {
  taskId: string;
  per: PermissionValueType;
}) {
  const task = await MongoRerankTrainTask.findById(taskId).lean();
  if (!task) {
    return Promise.reject(RerankTrainErrEnum.taskNotExist);
  }

  const result = await authApp({
    ...props,
    appId: String(task.appId),
    per
  });

  return { ...result, task };
}

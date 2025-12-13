import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { rerankTrainTaskQueue } from '@fastgpt/service/core/train/rerank/task/mq';
import {
  RerankTrainsetStatusEnum,
  RerankTrainTaskStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  CreateRerankTrainTaskBody,
  CreateRerankTrainTaskResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateRerankTrainTaskResponse>
): Promise<CreateRerankTrainTaskResponse> {
  const { appId, name } = req.body as CreateRerankTrainTaskBody;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. 认证应用写权限
  const { app, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  // 2. 检查应用训练集是否存在且就绪
  const trainset = await MongoRerankTrainset.findOne({ appId }).lean();
  if (!trainset) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotExist);
  }
  if (trainset.status !== RerankTrainsetStatusEnum.ready) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotReady);
  }
  if (trainset.dataCount === 0) {
    return Promise.reject(RerankTrainErrEnum.noTrainDataAvailable);
  }

  // 3. 检查是否有进行中的任务
  const runningTask = await MongoRerankTrainTask.findOne({
    appId,
    status: {
      $in: [RerankTrainTaskStatusEnum.pending, RerankTrainTaskStatusEnum.running]
    }
  }).lean();

  if (runningTask) {
    return Promise.reject(RerankTrainErrEnum.taskAlreadyRunning);
  }

  // 4. 创建任务
  const taskId = await createRerankTrainTask({
    appId,
    teamId,
    tmbId,
    name
  });

  // 5. 加入任务队列
  const job = await rerankTrainTaskQueue.add(
    `train-${taskId}`,
    { taskId, teamId, tmbId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );

  // 6. 更新 jobId
  await MongoRerankTrainTask.updateOne({ _id: taskId }, { jobId: job.id as string });

  return {
    taskId,
    status: RerankTrainTaskStatusEnum.pending
  };
}

export default NextAPI(handler);

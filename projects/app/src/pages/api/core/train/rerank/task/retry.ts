import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { rerankTrainTaskQueue } from '@fastgpt/service/core/train/rerank/task/mq';
import { updateTaskStatus } from '@fastgpt/service/core/train/rerank/task/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { RetryRerankTrainTaskBody } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.body as RetryRerankTrainTaskBody;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 获取任务
  const task = await MongoRerankTrainTask.findById(taskId).lean();
  if (!task) {
    return Promise.reject(RerankTrainErrEnum.taskNotExist);
  }

  // 认证用户团队权限
  const { teamId: userTeamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  // 检查任务状态
  if (task.status !== RerankTrainTaskStatusEnum.failed) {
    return Promise.reject(RerankTrainErrEnum.taskCannotRetry);
  }

  // 更新任务状态为 pending
  await updateTaskStatus(taskId, RerankTrainTaskStatusEnum.pending);

  // 增加重试计数
  await MongoRerankTrainTask.updateOne(
    { _id: taskId },
    {
      $inc: { retryCount: 1 },
      errorMsg: ''
    }
  );

  // 重新加入队列
  const job = await rerankTrainTaskQueue.add(
    `retry-train-${taskId}`,
    { taskId, teamId: userTeamId, tmbId, isRetry: true },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );

  // 更新 jobId
  await MongoRerankTrainTask.updateOne({ _id: taskId }, { jobId: job.id as string });

  return { success: true, jobId: job.id as string };
}

export default NextAPI(handler);

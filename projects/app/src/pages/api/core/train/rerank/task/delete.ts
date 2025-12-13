import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { deleteRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DeleteRerankTrainTaskQuery } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.query as DeleteRerankTrainTaskQuery;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 获取任务
  const task = await MongoRerankTrainTask.findById(taskId).lean();
  if (!task) {
    return Promise.reject(RerankTrainErrEnum.taskNotExist);
  }

  // 认证用户团队权限
  await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  // 检查任务状态 - 不能删除进行中的任务
  if (
    task.status === RerankTrainTaskStatusEnum.pending ||
    task.status === RerankTrainTaskStatusEnum.running
  ) {
    return Promise.reject(RerankTrainErrEnum.taskCannotDelete);
  }

  // 删除任务
  await deleteRerankTrainTask(taskId);

  return { success: true };
}

export default NextAPI(handler);

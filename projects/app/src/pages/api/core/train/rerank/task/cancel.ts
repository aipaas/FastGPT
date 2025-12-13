import type { NextApiRequest, NextApiResponse } from 'next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { cancelRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { CancelRerankTrainTaskBody } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.body as CancelRerankTrainTaskBody;

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

  // 取消任务
  await cancelRerankTrainTask(taskId);

  return { success: true };
}

export default NextAPI(handler);

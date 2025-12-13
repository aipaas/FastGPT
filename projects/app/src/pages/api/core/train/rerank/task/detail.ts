import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  RerankTrainTaskDetailQuery,
  RerankTrainTaskDetailResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RerankTrainTaskDetailResponse>
): Promise<RerankTrainTaskDetailResponse> {
  const { taskId } = req.query as RerankTrainTaskDetailQuery;

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
    per: ReadPermissionVal
  });

  // 获取应用信息
  const app = await MongoApp.findById(task.appId).select('_id name avatar').lean();

  return {
    ...task,
    app: {
      _id: String(app?._id || ''),
      name: app?.name || '',
      avatar: app?.avatar || ''
    }
  };
}

export default NextAPI(handler);

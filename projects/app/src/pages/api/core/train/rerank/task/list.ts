import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type {
  ListRerankTrainTaskBody,
  ListRerankTrainTaskResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListRerankTrainTaskResponse>
): Promise<ListRerankTrainTaskResponse> {
  const { appId, status, pageNum = 1, pageSize = 20 } = req.body as ListRerankTrainTaskBody;

  // 认证用户团队权限
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  // 构建查询条件
  const query: any = { teamId };
  if (appId) query.appId = appId;
  if (status) query.status = status;

  // 查询任务列表
  const [tasks, total] = await Promise.all([
    MongoRerankTrainTask.find(query)
      .sort({ createTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MongoRerankTrainTask.countDocuments(query)
  ]);

  // 获取应用信息
  const appIds = [...new Set(tasks.map((t) => String(t.appId)))];
  const apps = await MongoApp.find({ _id: { $in: appIds } })
    .select('_id name avatar')
    .lean();

  const appMap = new Map(apps.map((app) => [String(app._id), app]));

  // 组装返回数据
  const list = tasks.map((task) => {
    const app = appMap.get(String(task.appId));
    return {
      ...task,
      appName: app?.name || '',
      appAvatar: app?.avatar || ''
    };
  });

  return { list, total };
}

export default NextAPI(handler);

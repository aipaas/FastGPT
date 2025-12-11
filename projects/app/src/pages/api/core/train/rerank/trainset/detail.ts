import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainsetByAppId } from '@fastgpt/service/support/permission/train/rerank/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  RerankTrainsetDetailQuery,
  RerankTrainsetDetailResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RerankTrainsetDetailResponse>
): Promise<RerankTrainsetDetailResponse> {
  const { appId } = req.query as RerankTrainsetDetailQuery;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { app, trainset } = await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  return {
    ...trainset,
    app: {
      _id: String(app._id),
      name: app.name,
      avatar: app.avatar
    }
  };
}

export default NextAPI(handler);

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainsetByAppId } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createManualTrainData } from '@fastgpt/service/core/train/rerank/data/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { CreateRerankTrainDataBody } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { appId, queries, positiveDocs, negativeDocs, reason } =
    req.body as CreateRerankTrainDataBody;

  if (!appId || !queries?.length || !positiveDocs?.length || !negativeDocs?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { trainset, teamId, tmbId } = await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  const dataId = await createManualTrainData({
    trainsetId: String(trainset._id),
    appId,
    teamId,
    tmbId,
    queries,
    positiveDocs,
    negativeDocs,
    reason
  });

  return dataId;
}

export default NextAPI(handler);

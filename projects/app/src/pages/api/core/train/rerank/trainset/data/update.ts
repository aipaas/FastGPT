import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainsetByAppId } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { updateTrainData } from '@fastgpt/service/core/train/rerank/data/controller';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { UpdateRerankTrainDataBody } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { dataId, queries, positiveDocs, negativeDocs } = req.body as UpdateRerankTrainDataBody;

  if (!dataId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 获取数据
  const data = await MongoRerankTrainsetData.findById(dataId).lean();
  if (!data) {
    return Promise.reject(RerankTrainErrEnum.trainDataNotExist);
  }

  // 认证权限
  await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId: String(data.appId),
    per: WritePermissionVal
  });

  // 更新
  await updateTrainData({
    dataId,
    queries,
    positiveDocs,
    negativeDocs
  });

  return 'success';
}

export default NextAPI(handler);

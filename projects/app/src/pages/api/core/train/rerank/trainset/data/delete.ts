import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainsetByAppId } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteTrainData } from '@fastgpt/service/core/train/rerank/data/controller';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DeleteRerankTrainDataBody } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { dataIds } = req.body as DeleteRerankTrainDataBody;

  if (!dataIds?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 获取第一条数据
  const firstData = await MongoRerankTrainsetData.findById(dataIds[0]).lean();
  if (!firstData) {
    return Promise.reject(RerankTrainErrEnum.trainDataNotExist);
  }

  // 认证权限
  await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId: String(firstData.appId),
    per: WritePermissionVal
  });

  // 批量删除
  const deletedCount = await deleteTrainData(dataIds);

  return { deletedCount };
}

export default NextAPI(handler);

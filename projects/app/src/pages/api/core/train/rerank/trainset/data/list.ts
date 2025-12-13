import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainsetByAppId } from '@fastgpt/service/support/permission/train/rerank/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  ListRerankTrainDataBody,
  ListRerankTrainDataResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListRerankTrainDataResponse>
): Promise<ListRerankTrainDataResponse> {
  const { appId, source, pageNum = 1, pageSize = 20 } = req.body as ListRerankTrainDataBody;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { trainset } = await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  const query: any = { trainsetId: trainset._id };
  if (source) query.source = source;

  const [list, total] = await Promise.all([
    MongoRerankTrainsetData.find(query)
      .sort({ createTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MongoRerankTrainsetData.countDocuments(query)
  ]);

  return { list, total };
}

export default NextAPI(handler);

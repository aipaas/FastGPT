import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/controller';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { CreateRerankTrainsetBody } from '@fastgpt/global/core/train/rerank/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { appId, name, description } = req.body as CreateRerankTrainsetBody;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. 认证应用写权限
  const { app, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  // 2. 检查是否已存在（1:1 关系）
  const existingTrainset = await MongoRerankTrainset.findOne({ appId }).lean();
  if (existingTrainset) {
    return Promise.reject(RerankTrainErrEnum.trainsetAlreadyExist);
  }

  // 3. 创建应用训练集
  const trainsetId = await createRerankTrainset({
    appId,
    teamId,
    tmbId,
    name,
    description
  });

  // 4. 审计日志
  const trainsetName = name || `${app.name} - 训练集`;
  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.CREATE_RERANK_TRAINSET,
    params: { appName: app.name, trainsetName }
  });

  return trainsetId;
}

export default NextAPI(handler);

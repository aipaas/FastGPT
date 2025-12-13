import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  authRerankTrainsetByAppId,
  authGenerateFromDatasets
} from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { rerankTrainDataGenerateQueue } from '@fastgpt/service/core/train/rerank/data/mq';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  GenerateRerankTrainDataBody,
  GenerateRerankTrainDataResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerateRerankTrainDataResponse>
): Promise<GenerateRerankTrainDataResponse> {
  const { appId, datasetIds, forceRegenerate = false } = req.body as GenerateRerankTrainDataBody;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. 认证应用写权限
  const { app, trainset, teamId, tmbId } = await authRerankTrainsetByAppId({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  // 2. 处理知识库ID
  let authDatasetIds: string[];

  if (datasetIds?.length) {
    // 用户指定了知识库，直接使用
    authDatasetIds = datasetIds;
  } else {
    // 用户未指定，使用工具函数从应用配置中解析知识库ID
    const { extractDatasetIdsFromApp } = require('@fastgpt/service/core/train/rerank/utils');
    authDatasetIds = extractDatasetIdsFromApp(app);
  }

  if (!authDatasetIds.length) {
    return Promise.reject(RerankTrainErrEnum.noDatasetAvailable);
  }

  // 3. 认证知识库读权限
  await authGenerateFromDatasets({
    req,
    authToken: true,
    datasetIds: authDatasetIds
  });

  // 4. 检查状态
  if (trainset.status === RerankTrainsetStatusEnum.composing) {
    return Promise.reject(RerankTrainErrEnum.trainsetGenerating);
  }

  // 5. 创建异步任务
  const job = await rerankTrainDataGenerateQueue.add(`generate-${trainset._id}-${Date.now()}`, {
    appId,
    trainsetId: String(trainset._id),
    datasetIds, // 直接传递用户指定的datasetIds，让控制器层处理解析
    teamId,
    tmbId,
    forceRegenerate
  });

  return {
    jobId: job.id as string,
    status: 'pending'
  };
}

export default NextAPI(handler);

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type { CreateMetricBody } from '@fastgpt/global/core/evaluation/metric/api';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { authEvaluationMetricCreate } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(req: ApiRequestProps<CreateMetricBody, {}>, res: ApiResponseType<any>) {
  const { name, description, prompt } = req.body;

  const { teamId, tmbId } = await authEvaluationMetricCreate({
    req,
    authApiKey: true,
    authToken: true
  });

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.metricNameRequired);
  }

  if (name.trim().length > 100) {
    return Promise.reject(EvaluationErrEnum.metricNameTooLong);
  }

  if (description && typeof description !== 'string') {
    return Promise.reject(EvaluationErrEnum.metricDescriptionTooLong);
  }

  if (description && description.length > 100) {
    return Promise.reject(EvaluationErrEnum.metricDescriptionTooLong);
  }

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.metricPromptRequired);
  }

  if (prompt.trim().length > 4000) {
    return Promise.reject(EvaluationErrEnum.metricPromptTooLong);
  }

  const metric = await MongoEvalMetric.create({
    teamId: teamId,
    tmbId: tmbId,
    name: name,
    description: description ?? '',
    type: EvalMetricTypeEnum.Custom,
    prompt: prompt,
    llmRequired: true,
    userInputRequired: true,
    actualOutputRequired: true,
    expectedOutputRequired: true,
    createTime: new Date(),
    updateTime: new Date()
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_EVALUATION_METRIC,
      params: {
        metricName: name.trim()
      }
    });
  })();

  return {
    id: metric._id.toString(),
    name: metric.name,
    description: metric.description,
    createTime: metric.createTime,
    updateTime: metric.updateTime
  };
}

export default NextAPI(handler);

export { handler };

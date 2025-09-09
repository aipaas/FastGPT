import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type { EvaluationRequest } from '@fastgpt/global/core/evaluation/metric/type';
import type { DebugMetricBody } from '@fastgpt/global/core/evaluation/metric/api';
import { NextAPI } from '@/service/middleware/entry';
import { DitingEvaluator } from '@fastgpt/service/core/evaluation/evaluator';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { createEvaluationMetricDebugUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { EvalMetricTypeEnum, EvalMetricTypeValues } from '@fastgpt/global/core/evaluation/metric/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(req: ApiRequestProps<DebugMetricBody, {}>, res: ApiResponseType<any>) {
  const { evalCase, llmConfig, metricConfig } = req.body;

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  // 严格的参数校验
  // 1. evalCase 校验
  if (!evalCase) {
    return Promise.reject(EvaluationErrEnum.evalCaseRequired);
  }

  if (!evalCase.userInput || typeof evalCase.userInput !== 'string' || evalCase.userInput.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.evalCaseUserInputRequired);
  }

  if (evalCase.userInput.trim().length > 1000) {
    return Promise.reject(EvaluationErrEnum.evalCaseUserInputTooLong);
  }

  if (!evalCase.actualOutput || typeof evalCase.actualOutput !== 'string' || evalCase.actualOutput.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.evalCaseActualOutputRequired);
  }

  if (evalCase.actualOutput.trim().length > 4000) {
    return Promise.reject(EvaluationErrEnum.evalCaseActualOutputTooLong);
  }

  if (!evalCase.expectedOutput || typeof evalCase.expectedOutput !== 'string' || evalCase.expectedOutput.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.evalCaseExpectedOutputRequired);
  }

  if (evalCase.expectedOutput.trim().length > 4000) {
    return Promise.reject(EvaluationErrEnum.evalCaseExpectedOutputTooLong);
  }

  // 2. metricConfig 校验
  if (!metricConfig) {
    return Promise.reject(EvaluationErrEnum.evalCaseRequired);
  }

  if (!metricConfig.metricName || typeof metricConfig.metricName !== 'string' || metricConfig.metricName.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.metricNameRequired);
  }

  if (metricConfig.metricName.trim().length > 100) {
    return Promise.reject(EvaluationErrEnum.metricNameTooLong);
  }

  if (!metricConfig.metricType) {
    return Promise.reject(EvaluationErrEnum.metricTypeRequired);
  }

  if (!EvalMetricTypeValues.includes(metricConfig.metricType)) {
    return Promise.reject(EvaluationErrEnum.metricTypeInvalid);
  }

  if (!metricConfig.prompt || typeof metricConfig.prompt !== 'string' || metricConfig.prompt.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.metricPromptRequired);
  }

  if (metricConfig.prompt.trim().length > 4000) {
    return Promise.reject(EvaluationErrEnum.metricPromptTooLong);
  }

  // 3. llmConfig 校验
  if (!llmConfig) {
    return Promise.reject(EvaluationErrEnum.llmConfigRequired);
  }

  if (!llmConfig.name || typeof llmConfig.name !== 'string' || llmConfig.name.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.llmModelNameRequired);
  }

  if (llmConfig.name.trim().length > 100) {
    return Promise.reject(EvaluationErrEnum.llmModelNameRequired);
  }

  if (llmConfig.baseUrl !== undefined && llmConfig.baseUrl !== null) {
    if (typeof llmConfig.baseUrl !== 'string' || llmConfig.baseUrl.trim().length === 0) {
      return Promise.reject(EvaluationErrEnum.llmBaseUrlInvalid);
    }
    // 简单的 URL 格式验证
    try {
      new URL(llmConfig.baseUrl);
    } catch {
      return Promise.reject(EvaluationErrEnum.llmBaseUrlInvalid);
    }
  }

  if (llmConfig.baseUrl && llmConfig.apiKey !== undefined && llmConfig.apiKey !== null) {
    if (typeof llmConfig.apiKey !== 'string' || llmConfig.apiKey.trim().length === 0) {
      return Promise.reject(EvaluationErrEnum.llmApiKeyRequired);
    }
  }

  if (llmConfig.timeout !== undefined && llmConfig.timeout !== null) {
    if (typeof llmConfig.timeout !== 'number' || llmConfig.timeout <= 0) {
      return Promise.reject(EvaluationErrEnum.llmTimeoutInvalid);
    }
  }

  // 检查AI积分余额
  await checkTeamAIPoints(teamId);

  const ditingEvaluator = new DitingEvaluator(
    {
      metricName: metricConfig.metricName,
      metricType: metricConfig.metricType,
      prompt: metricConfig.prompt
    },
    llmConfig,
  );

  try {
    const result = await ditingEvaluator.evaluate(evalCase);
    
    // 处理计费逻辑
    if (result.totalPoints && result.totalPoints > 0) {
      await createEvaluationMetricDebugUsage({
        teamId,
        tmbId,
        metricName: metricConfig.metricName,
        totalPoints: result.totalPoints,
        model: llmConfig.name,
        inputTokens: result.usages?.reduce((sum, u) => sum + (u.prompt_tokens || 0), 0) || 0,
        outputTokens: result.usages?.reduce((sum, u) => sum + (u.completion_tokens || 0), 0) || 0
      });
    }
    
    // 异步记录审计日志
    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.DEBUG_EVALUATION_METRIC,
        params: {
          metricName: metricConfig.metricName,
        }
      });
    })();
    
    return {
      score: result.data?.score,
      reason: result.data?.reason,
      usages: result.usages,
      totalPoints: result.totalPoints
    };
  } catch (err: any) {
    // 只检查evaluator相关的错误码（510050+）
    const evaluatorErrorCodes = [
      EvaluationErrEnum.evaluatorConfigRequired,
      EvaluationErrEnum.evaluatorLlmConfigMissing,
      EvaluationErrEnum.evaluatorEmbeddingConfigMissing,
      EvaluationErrEnum.evaluatorLlmModelNotFound,
      EvaluationErrEnum.evaluatorEmbeddingModelNotFound,
      EvaluationErrEnum.evaluatorRequestTimeout,
      EvaluationErrEnum.evaluatorServiceUnavailable,
      EvaluationErrEnum.evaluatorInvalidResponse,
      EvaluationErrEnum.evaluatorNetworkError
    ];
    
    // 如果是evaluator相关错误码，直接传递
    if (evaluatorErrorCodes.includes(err.message)) {
      return Promise.reject(err.message);
    }
    
    // 其他错误使用通用的调试失败错误码
    return Promise.reject(EvaluationErrEnum.debugEvaluationFailed);
  }
}

export default NextAPI(handler);

export { handler };

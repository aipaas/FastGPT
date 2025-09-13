import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  StatsEvaluationRequest,
  EvaluationStatsResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<{}, StatsEvaluationRequest>
): Promise<EvaluationStatsResponse> {
  const { evalId } = req.query;

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  const { teamId } = await authEvaluationTaskRead(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const stats = await EvaluationTaskService.getEvaluationStats(evalId, teamId);

  return stats;
}

export default NextAPI(handler);
export { handler };

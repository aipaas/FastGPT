import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import type {
  UpdateEvaluationItemRequest,
  UpdateEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationItemWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<UpdateEvaluationItemRequest>
): Promise<UpdateEvaluationItemResponse> {
  const {
    evalItemId,
    [EvalDatasetDataKeyEnum.UserInput]: userInput,
    [EvalDatasetDataKeyEnum.ExpectedOutput]: expectedOutput,
    [EvalDatasetDataKeyEnum.Context]: context,
    targetCallParams
  } = req.body;

  const { evaluation, evaluationItem, teamId, tmbId } = await authEvaluationItemWrite(evalItemId, {
    req,
    authApiKey: true,
    authToken: true
  });

  if (!evalItemId) {
    throw new Error(EvaluationErrEnum.evalItemIdRequired);
  }

  await EvaluationTaskService.updateEvaluationItem(
    evalItemId,
    { userInput, expectedOutput, context, targetCallParams },
    teamId
  );

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_EVALUATION_TASK_ITEM,
      params: {
        taskName: evaluation.name,
        itemId: String(evaluationItem._id)
      }
    });
  })();

  return { message: 'Evaluation item updated successfully' };
}

export default NextAPI(handler);
export { handler };

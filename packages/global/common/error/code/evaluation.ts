import { type ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';

/* evaluation: 510000 */
export enum EvaluationErrEnum {
  // Dataset related errors
  evalDatasetCollectionNotFound = 'evaluationDatasetCollectionNotFound',
  evalDatasetDataNotFound = 'evaluationDatasetDataNotFound',
  
  // Metric related errors (510010+)
  metricNotFound = 'evaluationMetricNotFound',
  metricUnAuth = 'evaluationMetricUnAuth',
  metricNameRequired = 'evaluationMetricNameRequired',
  metricNameTooLong = 'evaluationMetricNameTooLong', 
  metricDescriptionTooLong = 'evaluationMetricDescriptionTooLong',
  metricPromptRequired = 'evaluationMetricPromptRequired',
  metricPromptTooLong = 'evaluationMetricPromptTooLong',
  metricTypeRequired = 'evaluationMetricTypeRequired',
  metricTypeInvalid = 'evaluationMetricTypeInvalid',
  metricBuiltinCannotModify = 'evaluationMetricBuiltinCannotModify',
  metricBuiltinCannotDelete = 'evaluationMetricBuiltinCannotDelete',
  metricIdRequired = 'evaluationMetricIdRequired',
  
  // Evaluation case related errors (510020+)
  evalCaseRequired = 'evaluationCaseRequired',
  evalCaseUserInputRequired = 'evaluationCaseUserInputRequired',
  evalCaseUserInputTooLong = 'evaluationCaseUserInputTooLong',
  evalCaseActualOutputRequired = 'evaluationCaseActualOutputRequired',
  evalCaseActualOutputTooLong = 'evaluationCaseActualOutputTooLong',
  evalCaseExpectedOutputRequired = 'evaluationCaseExpectedOutputRequired',
  evalCaseExpectedOutputTooLong = 'evaluationCaseExpectedOutputTooLong',
  
  // LLM config related errors (510030+)
  llmConfigRequired = 'evaluationLlmConfigRequired',
  llmModelNameRequired = 'evaluationLlmModelNameRequired',
  llmBaseUrlInvalid = 'evaluationLlmBaseUrlInvalid',
  llmApiKeyRequired = 'evaluationLlmApiKeyRequired',
  llmTimeoutInvalid = 'evaluationLlmTimeoutInvalid',
  
  // Debug related errors (510040+)
  debugEvaluationFailed = 'evaluationDebugFailed',
  
  // Evaluator related errors (510050+)
  evaluatorConfigRequired = 'evaluationEvaluatorConfigRequired',
  evaluatorLlmConfigMissing = 'evaluationEvaluatorLlmConfigMissing',
  evaluatorEmbeddingConfigMissing = 'evaluationEvaluatorEmbeddingConfigMissing',
  evaluatorLlmModelNotFound = 'evaluationEvaluatorLlmModelNotFound',
  evaluatorEmbeddingModelNotFound = 'evaluationEvaluatorEmbeddingModelNotFound',
  evaluatorRequestTimeout = 'evaluationEvaluatorRequestTimeout',
  evaluatorServiceUnavailable = 'evaluationEvaluatorServiceUnavailable',
  evaluatorInvalidResponse = 'evaluationEvaluatorInvalidResponse',
  evaluatorNetworkError = 'evaluationEvaluatorNetworkError'
}

const evaluationErrList = [
  // Evaluation Dataset related errors (510000+)
  {
    statusText: EvaluationErrEnum.evalDatasetCollectionNotFound,
    message: i18nT('evaluation:dataset_collection_not_found')
  },
  {
    statusText: EvaluationErrEnum.evalDatasetDataNotFound,
    message: i18nT('evaluation:dataset_data_not_found')
  },
  
  // Metric related errors (510010+)
  {
    statusText: EvaluationErrEnum.metricNotFound,
    message: i18nT('evaluation:metric_not_found')
  },
  {
    statusText: EvaluationErrEnum.metricUnAuth,
    message: i18nT('evaluation:metric_un_auth')
  },
  {
    statusText: EvaluationErrEnum.metricNameRequired,
    message: i18nT('evaluation:metric_name_required')
  },
  {
    statusText: EvaluationErrEnum.metricNameTooLong,
    message: i18nT('evaluation:metric_name_too_long')
  },
  {
    statusText: EvaluationErrEnum.metricDescriptionTooLong,
    message: i18nT('evaluation:metric_description_too_long')
  },
  {
    statusText: EvaluationErrEnum.metricPromptRequired,
    message: i18nT('evaluation:metric_prompt_required')
  },
  {
    statusText: EvaluationErrEnum.metricPromptTooLong,
    message: i18nT('evaluation:metric_prompt_too_long')
  },
  {
    statusText: EvaluationErrEnum.metricTypeRequired,
    message: i18nT('evaluation:metric_type_required')
  },
  {
    statusText: EvaluationErrEnum.metricTypeInvalid,
    message: i18nT('evaluation:metric_type_invalid')
  },
  {
    statusText: EvaluationErrEnum.metricBuiltinCannotModify,
    message: i18nT('evaluation:metric_builtin_cannot_modify')
  },
  {
    statusText: EvaluationErrEnum.metricBuiltinCannotDelete,
    message: i18nT('evaluation:metric_builtin_cannot_delete')
  },
  {
    statusText: EvaluationErrEnum.metricIdRequired,
    message: i18nT('evaluation:metric_id_required')
  },
  
  // Evaluation case related errors (510020+)
  {
    statusText: EvaluationErrEnum.evalCaseRequired,
    message: i18nT('evaluation:eval_case_required')
  },
  {
    statusText: EvaluationErrEnum.evalCaseUserInputRequired,
    message: i18nT('evaluation:eval_case_user_input_required')
  },
  {
    statusText: EvaluationErrEnum.evalCaseUserInputTooLong,
    message: i18nT('evaluation:eval_case_user_input_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalCaseActualOutputRequired,
    message: i18nT('evaluation:eval_case_actual_output_required')
  },
  {
    statusText: EvaluationErrEnum.evalCaseActualOutputTooLong,
    message: i18nT('evaluation:eval_case_actual_output_too_long')
  },
  {
    statusText: EvaluationErrEnum.evalCaseExpectedOutputRequired,
    message: i18nT('evaluation:eval_case_expected_output_required')
  },
  {
    statusText: EvaluationErrEnum.evalCaseExpectedOutputTooLong,
    message: i18nT('evaluation:eval_case_expected_output_too_long')
  },
  
  // LLM config related errors (510030+)
  {
    statusText: EvaluationErrEnum.llmConfigRequired,
    message: i18nT('evaluation:llm_config_required')
  },
  {
    statusText: EvaluationErrEnum.llmModelNameRequired,
    message: i18nT('evaluation:llm_model_name_required')
  },
  {
    statusText: EvaluationErrEnum.llmBaseUrlInvalid,
    message: i18nT('evaluation:llm_base_url_invalid')
  },
  {
    statusText: EvaluationErrEnum.llmApiKeyRequired,
    message: i18nT('evaluation:llm_api_key_required')
  },
  {
    statusText: EvaluationErrEnum.llmTimeoutInvalid,
    message: i18nT('evaluation:llm_timeout_invalid')
  },
  
  // Debug related errors (510040+)
  {
    statusText: EvaluationErrEnum.debugEvaluationFailed,
    message: i18nT('evaluation:debug_evaluation_failed')
  },
  
  // Evaluator related errors (510050+)
  {
    statusText: EvaluationErrEnum.evaluatorConfigRequired,
    message: i18nT('evaluation:evaluator_config_required')
  },
  {
    statusText: EvaluationErrEnum.evaluatorLlmConfigMissing,
    message: i18nT('evaluation:evaluator_llm_config_missing')
  },
  {
    statusText: EvaluationErrEnum.evaluatorEmbeddingConfigMissing,
    message: i18nT('evaluation:evaluator_embedding_config_missing')
  },
  {
    statusText: EvaluationErrEnum.evaluatorLlmModelNotFound,
    message: i18nT('evaluation:evaluator_llm_model_not_found')
  },
  {
    statusText: EvaluationErrEnum.evaluatorEmbeddingModelNotFound,
    message: i18nT('evaluation:evaluator_embedding_model_not_found')
  },
  {
    statusText: EvaluationErrEnum.evaluatorRequestTimeout,
    message: i18nT('evaluation:evaluator_request_timeout')
  },
  {
    statusText: EvaluationErrEnum.evaluatorServiceUnavailable,
    message: i18nT('evaluation:evaluator_service_unavailable')
  },
  {
    statusText: EvaluationErrEnum.evaluatorInvalidResponse,
    message: i18nT('evaluation:evaluator_invalid_response')
  },
  {
    statusText: EvaluationErrEnum.evaluatorNetworkError,
    message: i18nT('evaluation:evaluator_network_error')
  }
];

export default evaluationErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 510000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${EvaluationErrEnum}`>);

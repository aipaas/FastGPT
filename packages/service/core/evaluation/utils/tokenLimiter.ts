import { findModelFromAlldata, getEvaluationModel, getLLMModel } from '../../ai/model';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { addLog } from '../../../common/system/log';
import { MAX_TOKEN_FOR_EVALUATION_SUMMARY } from '@fastgpt/global/core/evaluation/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

/**
 * Get model for evaluation summary generation
 * Priority: specified llm model > default evaluation model > default llm model
 * @param llmModel - Optional specified model name from evaluator's runtimeConfig
 * @returns Model configuration for summary generation
 */
export const getEvaluationSummaryModel = (llmModel?: string): LLMModelItemType => {
  // If llm model is specified, try to get it
  if (llmModel) {
    const specifiedModel = getLLMModel(llmModel);
    if (specifiedModel) {
      addLog.debug('[EvaluationSummary] Using specified LLM model', {
        llmModel,
        modelName: specifiedModel.name
      });
      return specifiedModel;
    }
  }

  // Try to get default evaluation model
  const evaluationModel = getEvaluationModel();
  if (evaluationModel) {
    addLog.debug('[EvaluationSummary] Using default evaluation model', {
      modelName: evaluationModel.name
    });
    return evaluationModel;
  }
  // Should not reach here in normal cases
  throw new Error(EvaluationErrEnum.summaryModelInvalid);
};

/**
 * Get token limit for evaluation summary report generation
 * Based on evaluator's llm_model or default model, context length minus reserved tokens as upper limit
 */
export const getEvaluationSummaryTokenLimit = (llmModel: string): number => {
  let modelConfig: LLMModelItemType | undefined;

  // Try to get specified model configuration
  modelConfig = findModelFromAlldata(llmModel) as LLMModelItemType;

  // If no model is specified or model doesn't exist, use default LLM model
  if (!modelConfig || modelConfig.type !== 'llm') {
    throw new Error(EvaluationErrEnum.summaryModelInvalid);
  }

  // Calculate token limit: model max context - reserved tokens for response
  const tokenLimit = modelConfig.maxContext - MAX_TOKEN_FOR_EVALUATION_SUMMARY;

  addLog.debug('[EvaluationSummary] Calculate token limit', {
    llmModel: llmModel || 'default',
    modelName: modelConfig.name,
    maxContext: modelConfig.maxContext,
    tokenLimit
  });

  return tokenLimit;
};

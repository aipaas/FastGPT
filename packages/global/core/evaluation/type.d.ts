import type {
  EvaluationStatusEnum,
  EvalDatasetDataCreateFromEnum,
  EvalDatasetCollectionStatusEnum,
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataKeyEnum,
  EvaluationStatusEnum,
  ModelTypeEnum,
  EvalMetricTypeEnum
} from './constants';

export type EvalDatasetCollectionStatus = EvalDatasetCollectionStatusEnum;
export type EvalDatasetDataQualityStatus = EvalDatasetDataQualityStatusEnum;

export type EvalModelConfigType = {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  parameters?: Record<string, any>;
};

export type EvaluationSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  evalModel: string;
  appId: string;
  usageId: string;
  name: string;
  createTime: Date;
  finishTime?: Date;
  score?: number;
  errorMessage?: string;
};

export type EvalCase = {
  userInput?: string;
  expectedOutput?: string;
  actualOutput?: string;
  context?: string[];
  retrievalContext?: string[];
};

export type MetricResult = {
  metricName: string;
  status: string;
  data?: EvaluationResult;
  usages?: Usage[];
  error?: string;
};

export type EvalMetricSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  type: EvalMetricTypeEnum;
  prompt?: string;

  userInputRequired: boolean;
  actualOutputRequired: boolean;
  expectedOutputRequired: boolean;
  contextRequired: boolean;
  retrievalContextRequired: boolean;

  embeddingRequired: boolean;
  llmRequired: boolean;

  createTime: Date;
  updateTime: Date;
};

export type HttpConfig = {
  url: string;
  timeout?: number;
};

export type MetricConfig = {
  metricName: string;
  metricType: EvalMetricTypeEnum;
  prompt?: string;
};

export type EvaluationRequest = {
  evalCase: EvalCase;
  metricConfig: MetricConfig;
  embeddingConfig?: EvalModelConfigType | null;
  llmConfig?: EvalModelConfigType | null;
};

export type EvaluationResult = {
  metricName: string;
  score: number;
  reason?: string;
  run_logs?: Record<string, any>;
};

export type Usage = {
  model_type: ModelTypeEnum;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type EvaluationResponse = {
  status: string;
  data?: EvaluationResult;
  usages?: Usage[];
  error?: string;
};

export type EvalItemSchemaType = {
  evalId: string;
  question: string;
  expectedResponse: string;
  globalVariables?: Record<string, any>;
  history?: string;
  response?: string;
  responseTime?: Date;
  finishTime?: Date;
  status: EvaluationStatusEnum;
  retry: number;
  errorMessage?: string;
  accuracy?: number;
  relevance?: number;
  semanticAccuracy?: number;
  score?: number;
};

export type evaluationType = Pick<
  EvaluationSchemaType,
  'name' | 'appId' | 'createTime' | 'finishTime' | 'evalModel' | 'errorMessage' | 'score'
> & {
  _id: string;
  executorAvatar: string;
  executorName: string;
  appAvatar: string;
  appName: string;
  completedCount: number;
  errorCount: number;
  totalCount: number;
};

export type listEvalItemsItem = EvalItemSchemaType & {
  evalItemId: string;
};

export type EvalDatasetCollectionSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description: string;
  createTime: Date;
  updateTime: Date;
  metadata: Record<string, any>;
};

export type EvalDatasetDataSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  [EvalDatasetDataKeyEnum.UserInput]: string;
  [EvalDatasetDataKeyEnum.ActualOutput]: string;
  [EvalDatasetDataKeyEnum.ExpectedOutput]: string;
  [EvalDatasetDataKeyEnum.Context]: string[];
  [EvalDatasetDataKeyEnum.RetrievalContext]: string[];
  metadata: Record<string, any>;
  createFrom: EvalDatasetDataCreateFromEnum;
  createTime: Date;
  updateTime: Date;
};

export type MetricDefinition = {
  name: string;
  description: string;
  requireQuestion: boolean;
  requireActualResponse: boolean;
  requireExpectedResponse: boolean;
  requireContext: boolean;
  requireRetrievalContext: boolean;
};

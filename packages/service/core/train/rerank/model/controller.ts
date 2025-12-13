import { addLog } from '../../../../common/system/log';

/**
 * 创建 Rerank 模型配置
 * 注意：这是简化版实现，实际应该对接 FastGPT 模型管理系统
 * TODO: 对接真实的 FastGPT 模型管理 API
 */
export async function createRerankModelConfig(params: {
  model: string; // 模型标识
  name: string; // 模型名称
  modelAddress: string; // 模型地址
  isActive: boolean; // 是否激活
  charsPointsPrice: number; // 字符点数价格
}): Promise<string> {
  const { model, name, modelAddress, isActive, charsPointsPrice } = params;

  // TODO: 真实实现应该：
  // 1. 调用 MongoSystemModel.create 创建模型配置
  // 2. 调用 updatedReloadSystemModel 重新加载模型列表
  //
  // 示例代码：
  // const [{ _id }] = await MongoSystemModel.create([{
  //   model,
  //   name,
  //   maxContext: 8192,
  //   maxResponse: 4096,
  //   quoteMaxToken: 13000,
  //   maxTemperature: 1.2,
  //   charsPointsPrice,
  //   censor: false,
  //   vision: false,
  //   datasetProcess: false,
  //   usedInApp: isActive,
  //   usedInClassify: false,
  //   usedInExtractFields: false,
  //   usedInToolCall: false,
  //   usedInQueryExtension: false,
  //   toolChoice: false,
  //   functionCall: false,
  //   customCQPrompt: '',
  //   customExtractPrompt: '',
  //   defaultSystemChatPrompt: '',
  //   defaultConfig: {},
  //   provider: 'aicp' // AICP 渠道
  // }]);
  //
  // await updatedReloadSystemModel();
  //
  // return String(_id);

  // 临时实现：生成一个模拟的配置 ID
  const mockConfigId = `rerank_model_${Date.now()}`;

  addLog.info('Created rerank model config (mock implementation)', {
    model,
    name,
    modelAddress,
    isActive,
    configId: mockConfigId
  });

  return mockConfigId;
}

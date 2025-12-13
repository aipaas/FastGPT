import type { AppSchema } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export interface DatasetSelectItem {
  datasetId: string;
  name: string;
  avatar: string;
  vectorModel?: any;
  datasetType?: string;
}

/**
 * 从应用配置中提取数据集ID列表
 * @param app 应用配置对象
 * @returns 数据集ID数组
 */
export function extractDatasetIdsFromApp(app: AppSchema): string[] {
  return app.modules
    .filter((m: StoreNodeItemType) => m.flowNodeType === FlowNodeTypeEnum.datasetSearchNode)
    .flatMap((m: StoreNodeItemType) => {
      const datasetInput = m.inputs?.find((input: any) => input.key === 'datasets');
      const datasets = datasetInput?.value as DatasetSelectItem[];

      if (Array.isArray(datasets)) {
        return datasets
          .filter((dataset: any) => dataset && typeof dataset.datasetId === 'string')
          .map((dataset: any) => dataset.datasetId);
      }
      return [];
    })
    .filter(Boolean);
}

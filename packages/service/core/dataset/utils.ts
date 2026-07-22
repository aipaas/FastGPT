import {
  authDatasetByTmbId,
  getCollectionTmbPermission
} from '../../support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { S3Sources } from '../../common/s3/contracts/type';
// parseDatasetBackup2Chunks 独立文件，避免 worker 打包时带入 S3/jschardet 等无关依赖
export { parseDatasetBackup2Chunks } from './parseBackup';
import { getS3DatasetSource, S3DatasetSource } from '../../common/s3/sources/dataset';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import { jwtSignS3DownloadToken, isS3ObjectKey } from '../../common/s3/utils';
import { getLogger, LogCategories } from '../../common/logger';
import { S3Buckets } from '../../common/s3/config/constants';
import { MongoDatasetCollection } from './collection/schema';
import { MongoDataset } from './schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE);

// TODO: 需要优化成批量获取权限
export const filterDatasetsByTmbId = async ({
  datasetIds,
  tmbId
}: {
  datasetIds: string[];
  tmbId: string;
}) => {
  const permissions = await Promise.all(
    datasetIds.map(async (datasetId) => {
      try {
        await authDatasetByTmbId({
          tmbId,
          datasetId,
          per: ReadPermissionVal
        });
        return true;
      } catch (error) {
        logger.warn('Dataset access denied for member', { datasetId, error });
        return false;
      }
    })
  );

  // Then filter datasetIds based on permissions
  return datasetIds.filter((_, index) => permissions[index]);
};

/**
 * Filter collections by team member's read permission.
 * Checks collection-level permissions including independent permissions and parent inheritance.
 *
 * @param datasetIds - Dataset IDs to query collections from
 * @param tmbId - Team member ID
 * @param teamId - Team ID
 * @returns { allPass: true } if all collections pass permission checks,
 *          { allPass: false, forbiddenIds: string[] } with IDs of collections the user cannot access
 */
export const filterCollectionsByTmbId = async ({
  datasetIds,
  tmbId,
  teamId
}: {
  datasetIds: string[];
  tmbId: string;
  teamId: string;
}): Promise<{ allPass: true } | { allPass: false; forbiddenIds: string[] }> => {
  const [collections, datasets] = await Promise.all([
    MongoDatasetCollection.find(
      {
        datasetId: { $in: datasetIds },
        forbid: { $ne: true },
        deleteTime: null
      },
      '_id tmbId datasetId parentId inheritPermission type'
    ).lean(),
    MongoDataset.find({ _id: { $in: datasetIds } }, '_id type apiDatasetServer').lean()
  ]);

  if (collections.length === 0) {
    return { allPass: true };
  }

  // 构建 datasetId -> 是否开启权限同步 的映射（permissionSync 为 dataset 级配置）
  const permissionSyncDatasetIds = new Set<string>();
  for (const ds of datasets) {
    if (
      ds.type === DatasetTypeEnum.apiDataset &&
      !!(ds.apiDatasetServer as any)?.apiServer?.permissionSync
    ) {
      permissionSyncDatasetIds.add(String(ds._id));
    }
  }

  const permissions = await Promise.all(
    collections.map(async (col) => {
      try {
        const per = await getCollectionTmbPermission({
          collection: col as any,
          teamId,
          tmbId,
          isPermissionSyncDataset: permissionSyncDatasetIds.has(String(col.datasetId))
        });
        return per.hasReadPer;
      } catch (error) {
        logger.warn('Collection access check failed', {
          collectionId: col._id,
          error
        });
        return false;
      }
    })
  );

  const forbiddenIds = collections
    .filter((_, index) => !permissions[index])
    .map((col) => String(col._id));

  if (forbiddenIds.length === 0) {
    return { allPass: true };
  }

  return { allPass: false, forbiddenIds };
};

/**
 * 替换数据集引用 markdown 文本中的图片链接格式的 S3 对象键为 JWT 签名后的 URL
 *
 * @param documentQuoteText 数据集引用文本
 * @param expiredTime 过期时间
 * @returns 替换后的文本
 *
 * @example
 *
 * ```typescript
 * const datasetQuoteText = '![image.png](dataset/68fee42e1d416bb5ddc85b19/6901c3071ba2bea567e8d8db/aZos7D-214afce5-4d42-4356-9e05-8164d51c59ae.png)';
 * const replacedText = await replaceS3KeyToPreviewUrl(datasetQuoteText, addDays(new Date(), 90))
 * console.log(replacedText)
 * // '![image.png](http://localhost:3000/api/system/file/download/xxx?filename=image.png)'
 * ```
 */
export function replaceS3KeyToPreviewUrl(documentQuoteText: string, expiredTime: Date) {
  if (!documentQuoteText || typeof documentQuoteText !== 'string')
    return documentQuoteText as string;

  const prefixes = Object.values(S3Sources);
  const prefixAlternation = prefixes.map((p) => `${p}\\/`).join('|');
  const pattern = `(?:${prefixAlternation})[^)]+`;
  const regex = new RegExp(String.raw`(!?)\[([^\]]*)\]\(\s*(?!https?:\/\/)(${pattern})\s*\)`, 'g');

  const matches = Array.from(documentQuoteText.matchAll(regex));
  let content = documentQuoteText;

  for (const match of matches.slice().reverse()) {
    const [full, bang, alt, objectKey] = match;

    if (isS3ObjectKey(objectKey, 'dataset') || isS3ObjectKey(objectKey, 'chat')) {
      const url = jwtSignS3DownloadToken({
        objectKey,
        bucketName: S3Buckets.private,
        expiredTime
      });
      const replacement = `${bang}[${alt}](${url})`;
      content =
        content.slice(0, match.index) + replacement + content.slice(match.index + full.length);
    }
  }

  // Handle HTML <img> tags with S3 keys (e.g. table images from pdf2text MinerU parsing)
  const htmlSrcPattern = `(?:${prefixAlternation})[^"']+`;
  const htmlImgRegex = new RegExp(
    String.raw`<img\s+[^>]*?\bsrc\s*=\s*(["'])(?!https?:\/\/)(${htmlSrcPattern})\1[^>]*>`,
    'g'
  );

  const htmlMatches = Array.from(content.matchAll(htmlImgRegex));
  for (const match of htmlMatches.slice().reverse()) {
    const [full, , objectKey] = match;

    if (isS3ObjectKey(objectKey, 'dataset') || isS3ObjectKey(objectKey, 'chat')) {
      const url = jwtSignS3DownloadToken({
        objectKey,
        bucketName: S3Buckets.private,
        expiredTime
      });
      const replacement = full.replace(objectKey, url);
      content =
        content.slice(0, match.index) + replacement + content.slice(match.index + full.length);
    }
  }

  return content;
}

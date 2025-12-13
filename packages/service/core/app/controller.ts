import { type AppSchema } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from './schema';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { encryptSecretValue, storeSecretValue } from '../../common/secret/utils';
import { SystemToolInputTypeEnum } from '@fastgpt/global/core/app/systemTool/constants';
import { type ClientSession } from '../../common/mongo';
import { deleteChatFiles } from '../chat/controller';
import { MongoChatItem } from '../chat/chatItemSchema';
import { MongoChat } from '../chat/chatSchema';
import { MongoOutLink } from '../../support/outLink/schema';
import { MongoOpenApi } from '../../support/openapi/schema';
import { MongoAppVersion } from './version/schema';
import { MongoChatInputGuide } from '../chat/inputGuide/schema';
import { MongoResourcePermission } from '../../support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { removeImageByPath } from '../../common/file/image/controller';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoAppLogKeys } from './logs/logkeysSchema';
import { MongoRerankTrainTask } from '../train/rerank/task/schema';
import { MongoRerankTrainsetData } from '../train/rerank/data/schema';
import { MongoRerankTrainset } from '../train/rerank/trainset/schema';
import { rerankTrainTaskQueue } from '../train/rerank/task/mq';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../common/system/log';

export const beforeUpdateAppFormat = ({ nodes }: { nodes?: StoreNodeItemType[] }) => {
  if (!nodes) return;

  nodes.forEach((node) => {
    // Format header secret
    node.inputs.forEach((input) => {
      if (input.key === NodeInputKeyEnum.headerSecret && typeof input.value === 'object') {
        input.value = storeSecretValue(input.value);
      }
      if (input.key === NodeInputKeyEnum.systemInputConfig && typeof input.value === 'object') {
        input.inputList?.forEach((inputItem) => {
          if (
            inputItem.inputType === 'secret' &&
            input.value?.type === SystemToolInputTypeEnum.manual &&
            input.value?.value
          ) {
            input.value.value[inputItem.key] = encryptSecretValue(input.value.value[inputItem.key]);
          }
        });
      }
    });

    // Format dataset search
    if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
      node.inputs.forEach((input) => {
        if (input.key === NodeInputKeyEnum.datasetSelectList) {
          const val = input.value as undefined | { datasetId: string }[] | { datasetId: string };
          if (!val) {
            input.value = [];
          } else if (Array.isArray(val)) {
            // Not rewrite reference value
            if (val.length === 2 && val.every((item) => typeof item === 'string')) {
              return;
            }
            input.value = val
              .map((dataset: any & { datasetType?: DatasetTypeEnum }) => ({
                ...dataset,
                datasetId: dataset.datasetId
              }))
              .filter((item) => !!item.datasetId);
          } else if (typeof val === 'object' && val !== null) {
            input.value = [
              {
                ...(val as any & { datasetType?: DatasetTypeEnum }),
                datasetId: val.datasetId
              }
            ];
          }
        }
      });
    }
  });
};

/* Get apps */
export async function findAppAndAllChildren({
  teamId,
  appId,
  fields
}: {
  teamId: string;
  appId: string;
  fields?: string;
}): Promise<AppSchema[]> {
  const find = async (id: string) => {
    const children = await MongoApp.find(
      {
        teamId,
        parentId: id
      },
      fields
    ).lean();

    let apps = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      apps = apps.concat(grandChildrenIds);
    }

    return apps;
  };
  const [app, childDatasets] = await Promise.all([MongoApp.findById(appId, fields), find(appId)]);

  if (!app) {
    return Promise.reject('Dataset not found');
  }

  return [app, ...childDatasets];
}

export const getAppBasicInfoByIds = async ({ teamId, ids }: { teamId: string; ids: string[] }) => {
  const apps = await MongoApp.find(
    {
      teamId,
      _id: { $in: ids }
    },
    '_id name avatar'
  ).lean();

  return apps.map((item) => ({
    id: item._id,
    name: item.name,
    avatar: item.avatar
  }));
};

/**
 * 删除应用时的训练模块清理
 * 在现有的应用删除函数中调用此函数
 */
export async function cleanupTrainModuleOnAppDelete(
  appIds: string[],
  session?: ClientSession
): Promise<void> {
  if (!appIds.length) return;

  addLog.info('Cleanup train module on app delete', { appIds });

  // 1. 取消进行中的训练任务
  const runningTasks = await MongoRerankTrainTask.find(
    {
      appId: { $in: appIds },
      status: {
        $in: [RerankTrainTaskStatusEnum.pending, RerankTrainTaskStatusEnum.running]
      }
    },
    null,
    { session }
  ).lean();

  for (const task of runningTasks) {
    if (task.jobId) {
      try {
        const job = await rerankTrainTaskQueue.getJob(task.jobId);
        if (job) {
          await job.remove();
          addLog.info('Removed train task job', {
            taskId: String(task._id),
            jobId: task.jobId
          });
        }
      } catch (error) {
        addLog.error('Failed to remove train task job', error);
      }
    }
  }

  // 2. 删除所有训练任务
  await MongoRerankTrainTask.deleteMany({ appId: { $in: appIds } }, { session });

  // 3. 删除应用训练数据
  await MongoRerankTrainsetData.deleteMany({ appId: { $in: appIds } }, { session });

  // 4. 删除应用训练集
  await MongoRerankTrainset.deleteMany({ appId: { $in: appIds } }, { session });

  addLog.info('Cleanup train module completed', { appIds });
}

export const onDelOneApp = async ({
  teamId,
  appId,
  session
}: {
  teamId: string;
  appId: string;
  session?: ClientSession;
}) => {
  const apps = await findAppAndAllChildren({
    teamId,
    appId,
    fields: '_id avatar'
  });

  const deletedAppIds = apps
    .filter((app) => app.type !== AppTypeEnum.folder)
    .map((app) => String(app._id));

  const del = async (session: ClientSession) => {
    for await (const app of apps) {
      const appId = app._id;
      // Chats
      await deleteChatFiles({ appId });
      await MongoChatItem.deleteMany(
        {
          appId
        },
        { session }
      );
      await MongoChat.deleteMany(
        {
          appId
        },
        { session }
      );

      // 删除分享链接
      await MongoOutLink.deleteMany({
        appId
      }).session(session);
      // Openapi
      await MongoOpenApi.deleteMany({
        appId
      }).session(session);

      // delete version
      await MongoAppVersion.deleteMany({
        appId
      }).session(session);

      await MongoChatInputGuide.deleteMany({
        appId
      }).session(session);

      await MongoResourcePermission.deleteMany({
        resourceType: PerResourceTypeEnum.app,
        teamId,
        resourceId: appId
      }).session(session);

      await MongoAppLogKeys.deleteMany({
        appId
      }).session(session);
    }

    // 删除训练模块数据（在所有app循环完成后统一删除）
    await cleanupTrainModuleOnAppDelete(
      apps.map((app) => String(app._id)),
      session
    );

    // delete apps
    for await (const app of apps) {
      const appId = app._id;

      // delete app
      await MongoApp.deleteOne(
        {
          _id: appId
        },
        { session }
      );

      await removeImageByPath(app.avatar, session);
    }
  };

  if (session) {
    await del(session);
    return deletedAppIds;
  }

  await mongoSessionRun(del);
  return deletedAppIds;
};

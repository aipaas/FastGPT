# APP 模块设计文档

本文档记录 APP 模块的架构设计、数据模型和开发规范，供新增相关功能时参考。

## 1. 模块概述

APP 模块是 FastGPT 的核心模块，支持多种应用类型（工作流、简单应用、插件等），提供完整的应用生命周期管理。

### 1.1 应用类型
```typescript
enum AppTypeEnum {
  folder = 'folder',           // 文件夹（组织用途）
  simple = 'simple',           // 简单应用
  workflow = 'advanced',       // 工作流应用
  plugin = 'plugin',           // 插件应用
  httpPlugin = 'httpPlugin',   // HTTP 插件
  toolSet = 'toolSet',         // 工具集
  tool = 'tool',               // 单个工具
  hidden = 'hidden',           // 隐藏应用
  assistant = 'assistant'      // AI 助手
}

// 文件夹类型（可包含子应用）
const AppFolderTypeList = [AppTypeEnum.folder, AppTypeEnum.httpPlugin];
```

## 2. 目录结构

### 2.1 API 路由
```
projects/app/src/pages/api/core/app/
├── create.ts              # 创建应用
├── list.ts                # 应用列表
├── detail.ts              # 应用详情
├── update.ts              # 更新应用
├── del.ts                 # 删除应用
├── copy.ts                # 复制应用
├── folder/                # 文件夹操作
│   ├── create.ts
│   └── path.ts
├── version/               # 版本管理
│   ├── publish.ts         # 发布/自动保存
│   ├── list.ts
│   ├── detail.ts
│   └── latest.ts
├── plugin/                # 插件管理
├── httpPlugin/            # HTTP 插件
├── mcpTools/              # MCP 工具
└── logs/                  # 日志管理
```

### 2.2 服务层
```
packages/service/core/app/
├── schema.ts              # App MongoDB Schema
├── controller.ts          # 业务控制器
├── utils.ts               # 工具函数
├── version/
│   ├── schema.ts          # AppVersion Schema
│   └── controller.ts
├── plugin/
│   └── controller.ts
└── logs/
    └── chatLogsSchema.ts
```

### 2.3 全局类型
```
packages/global/core/app/
├── type.d.ts              # 核心类型
├── version.d.ts           # 版本类型
├── constants.ts           # 常量枚举
├── utils.ts               # 工具函数
└── plugin/
    └── type.d.ts
```

## 3. 数据模型

### 3.1 App (应用)
**集合名**: `apps`

```typescript
type AppSchema = {
  _id: string;
  parentId?: string;              // 父目录（支持嵌套）
  teamId: string;                 // 团队ID（必填）
  tmbId: string;                  // 创建者

  name: string;
  type: AppTypeEnum;
  avatar: string;
  intro: string;

  // 工作流编排
  modules: StoreNodeItemType[];   // 节点列表
  edges: StoreEdgeItemType[];     // 边列表

  // 聊天配置
  chatConfig: AppChatConfigType;

  // 插件数据
  pluginData?: {
    nodeVersion?: string;         // 插件节点版本ID
    apiSchemaStr?: string;        // HTTP插件API Schema
    customHeaders?: string;
  };

  // 定时触发
  scheduledTriggerConfig?: ScheduledTriggerConfigType;
  scheduledTriggerNextTime?: Date;

  // 权限
  inheritPermission?: boolean;    // 是否继承父权限
  teamTags: string[];

  updateTime: Date;
};
```

**索引**：
- `{ teamId: 1, updateTime: -1 }`
- `{ teamId: 1, type: 1 }`
- `{ type: 1 }`

### 3.2 AppVersion (版本)
**集合名**: `app_versions`

```typescript
type AppVersionSchemaType = {
  _id: string;
  appId: string;                  // 关联的应用
  tmbId: string;                  // 创建者

  nodes: StoreNodeItemType[];     // 节点快照
  edges: StoreEdgeItemType[];     // 边快照
  chatConfig: AppChatConfigType;  // 配置快照

  versionName: string;
  isPublish?: boolean;            // 是否已发布
  time: Date;
};
```

**索引**：
- `{ appId: 1, _id: -1 }`

## 4. 权限控制

### 4.1 权限等级
```typescript
enum AppPermissionKeyEnum {
  read = 0b0001,          // 读权限
  write = 0b0010,         // 写权限
  manage = 0b0100,        // 管理权限
  readChatLog = 0b1000    // 读日志权限（APP特有）
}
```

### 4.2 认证函数
```typescript
import { authApp } from '@fastgpt/service/support/permission/app/auth';

// 应用级认证
const { app, permission, teamId, tmbId } = await authApp({
  req,
  authToken: true,
  appId,
  per: ReadPermissionVal
});

// 用户权限认证（无特定资源）
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

const { teamId, tmbId } = await authUserPer({
  req,
  authToken: true,
  per: TeamAppCreatePermissionVal
});
```

### 4.3 权限继承
```typescript
// 应用支持从父目录继承权限
if (app.parentId && app.inheritPermission === true) {
  // 使用父目录权限
  permission = getParentFolderPermission(app.parentId);
} else {
  // 使用应用自身权限
  permission = getAppOwnPermission(app._id);
}
```

### 4.4 条件认证模式
创建资源时根据是否有 parentId 选择认证方式：

```typescript
const { teamId, tmbId } = parentId
  ? await authApp({
      req,
      appId: parentId,
      authToken: true,
      per: WritePermissionVal
    })
  : await authUserPer({
      req,
      authToken: true,
      per: TeamAppCreatePermissionVal
    });
```

## 5. 模块关系

```
APP 模块
    ↓
┌───┴───┬──────┬────────┬────────┬─────────┐
↓       ↓      ↓        ↓        ↓         ↓
Chat  Version Dataset  Plugin Permission OpenAPI
(聊天) (版本)  (知识库) (插件)   (权限)    (外部接入)
```

| 关联模块 | 关系 | 说明 |
|---------|------|------|
| Chat | 1:N | 应用有多个对话 |
| AppVersion | 1:N | 应用有多个版本 |
| Dataset | N:N | 应用引用知识库（通过节点） |
| Plugin | 1:N | 应用可作为插件被引用 |
| Permission | 1:N | 应用可被多用户共享 |

## 6. API 实现模式

### 6.1 创建应用
```typescript
// POST /api/core/app/create
async function handler(req: ApiRequestProps<CreateAppBody>) {
  const { parentId, name, type, modules, edges, chatConfig } = req.body;

  // 1. 参数校验
  if (!name || !type || !Array.isArray(modules)) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 2. 条件认证
  const { teamId, tmbId, userId } = parentId
    ? await authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })
    : await authUserPer({ req, per: TeamAppCreatePermissionVal, authToken: true });

  // 3. 配额检查
  await checkTeamAppLimit(teamId);

  // 4. 创建应用
  const appId = await onCreateApp({
    parentId, name, type, modules, edges, chatConfig,
    teamId, tmbId
  });

  // 5. 追踪和审计
  pushTrack.createApp({ type, uid: userId, appId });
  (async () => { addAuditLog({ ... }); })();

  return appId;
}
```

### 6.2 应用详情
```typescript
// GET /api/core/app/detail?appId=xxx
async function handler(req: ApiRequestProps) {
  const { appId } = req.query;

  const { app, teamId, isRoot } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  // 重写工作流详情（填充插件信息）
  await rewriteAppWorkflowToDetail({
    nodes: app.modules,
    teamId,
    ownerTmbId: app.tmbId,
    isRoot
  });

  // 无写权限时隐藏工作流
  if (!app.permission.hasWritePer) {
    return { ...app, modules: [], edges: [] };
  }

  return app;
}
```

### 6.3 更新应用（含移动）
```typescript
// POST /api/core/app/update?appId=xxx
async function handler(req: ApiRequestProps<AppUpdateBody>) {
  const { appId } = req.query;
  const { parentId, name, nodes, edges, chatConfig } = req.body;
  const isMove = parentId !== undefined;

  // 1. 基础认证
  const { app, permission, teamId, tmbId } = await authApp({
    req, authToken: true, appId, per: ReadPermissionVal
  });

  // 2. 移动操作额外权限检查
  if (isMove) {
    if (parentId) {
      await authApp({ req, appId: parentId, per: ManagePermissionVal, authToken: true });
    }
    if (app.parentId) {
      await authApp({ req, appId: app.parentId, per: ManagePermissionVal, authToken: true });
    }
    if (!parentId || !app.parentId) {
      await authUserPer({ req, per: TeamAppCreatePermissionVal, authToken: true });
    }
  } else {
    if (!permission.hasWritePer) {
      return Promise.reject(AppErrEnum.unAuthApp);
    }
  }

  // 3. 事务更新
  await mongoSessionRun(async (session) => {
    await MongoApp.findByIdAndUpdate(appId, { ... }, { session });

    // 移动时同步权限
    if (isMove && AppFolderTypeList.includes(app.type)) {
      await syncChildrenPermission({ ... });
    }
  });
}
```

### 6.4 版本发布
```typescript
// POST /api/core/app/version/publish?appId=xxx
async function handler(req: ApiRequestProps<PostPublishAppProps>) {
  const { appId } = req.query;
  const { nodes, edges, chatConfig, isPublish, versionName, autoSave } = req.body;

  const { app, tmbId } = await authApp({
    req, authToken: true, appId, per: WritePermissionVal
  });

  if (autoSave) {
    // 仅更新草稿
    await MongoApp.findByIdAndUpdate(appId, { modules: nodes, edges, chatConfig });
  } else {
    // 创建版本快照
    await mongoSessionRun(async (session) => {
      await MongoAppVersion.create([{
        appId, nodes, edges, chatConfig, isPublish, versionName, tmbId
      }], { session });

      await MongoApp.findByIdAndUpdate(appId, {
        modules: nodes, edges, chatConfig, updateTime: new Date()
      }, { session });
    });
  }
}
```

## 7. 级联删除

删除应用时需级联清理：

```typescript
async function onDelOneApp({ teamId, appId }) {
  // 1. 递归查找所有子应用
  const allApps = await findAppAndAllChildren({ teamId, appId });
  const appIds = allApps.map(app => app._id);

  await mongoSessionRun(async (session) => {
    // 2. 删除应用
    await MongoApp.deleteMany({ _id: { $in: appIds } }, { session });

    // 3. 删除版本历史
    await MongoAppVersion.deleteMany({ appId: { $in: appIds } }, { session });

    // 4. 删除聊天记录
    await MongoChat.deleteMany({ appId: { $in: appIds } }, { session });
    await MongoChatItem.deleteMany({ appId: { $in: appIds } }, { session });

    // 5. 删除权限记录
    await MongoResourcePermission.deleteMany({
      resourceId: { $in: appIds },
      resourceType: PerResourceTypeEnum.app
    }, { session });

    // 6. 删除外部链接
    await MongoOutLink.deleteMany({ appId: { $in: appIds } }, { session });

    // 7. 删除OpenAPI配置
    await MongoOpenApi.deleteMany({ appId: { $in: appIds } }, { session });
  });

  return appIds;
}
```

## 8. 关键服务函数

### 8.1 应用查询
```typescript
// packages/service/core/app/controller.ts

// 递归获取应用及所有子应用
async function findAppAndAllChildren({
  teamId,
  appId,
  fields?: string
}): Promise<AppSchema[]>

// 批量获取应用基本信息
async function getAppBasicInfoByIds({
  teamId,
  ids: string[]
}): Promise<{ id, name, avatar }[]>
```

### 8.2 版本管理
```typescript
// packages/service/core/app/version/controller.ts

// 获取最新发布版本
async function getAppLatestVersion(appId: string): Promise<AppVersion>

// 按ID获取版本
async function getAppVersionById({ appId, versionId }): Promise<AppVersion>

// 检查是否最新版本
async function checkIsLatestVersion({ appId, versionId }): Promise<boolean>
```

### 8.3 工作流处理
```typescript
// packages/service/core/app/utils.ts

// 重写工作流详情（填充插件信息）
async function rewriteAppWorkflowToDetail({
  nodes,
  teamId,
  ownerTmbId,
  isRoot
}): Promise<void>
```

## 9. 与知识库模块对比

| 特性 | APP 模块 | Dataset 模块 |
|-----|---------|-------------|
| 层级结构 | App (支持嵌套) | Dataset → Collection → Data |
| 版本管理 | 有独立版本表 | 无 |
| 特有权限 | readChatLog | 无 |
| 权限继承 | inheritPermission 字段 | inheritPermission 字段 |
| 关联资源 | Chat, Version, OpenAPI | Collection, Data, Training |

## 10. 开发注意事项

1. **创建应用**：必须同时创建初始版本（非文件夹类型）
2. **移动应用**：需要检查源目录和目标目录的管理权限
3. **权限隐藏**：无写权限时 `modules` 和 `edges` 返回空数组
4. **插件引用**：应用可作为插件被其他应用引用，通过 `pluginData.nodeVersion` 关联
5. **定时触发**：发布时更新 `scheduledTriggerNextTime`

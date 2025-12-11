# FastGPT API 路由开发规范

本文档定义了 FastGPT 项目中 API 路由的开发规范和最佳实践。

## 1. 目录结构

API 路由位于 `projects/app/src/pages/api/`，按功能模块组织：

```
api/
├── admin/              # 管理员操作
├── common/             # 通用功能（文件、系统、工具）
├── core/               # 核心业务
│   ├── ai/            # AI 模型相关
│   ├── app/           # 应用管理
│   ├── chat/          # 聊天相关
│   ├── dataset/       # 数据集
│   └── workflow/      # 工作流
├── support/            # 支持功能（用户、团队、权限）
├── v1/                 # v1 版本 API
└── v2/                 # v2 版本 API
```

### 1.1 文件命名规范

| 操作类型 | 文件名示例 |
|---------|-----------|
| 创建 | `create.ts` |
| 查询详情 | `detail.ts` |
| 列表查询 | `list.ts`, `getHistories.ts` |
| 更新 | `update.ts` |
| 删除 | `del.ts` |
| 复杂操作 | 描述性名称如 `clearHistories.ts` |

## 2. 基础模板

### 2.1 简单查询 API

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

export type Query = {
  appId: string;
};

async function handler(req: ApiRequestProps<{}, Query>) {
  const { appId } = req.query;

  // 1. 参数验证
  if (!appId) {
    return Promise.reject('appId is required');
  }

  // 2. 认证与权限检查
  const { app, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  // 3. 业务逻辑
  // ...

  // 4. 返回数据（由 NextAPI 自动包装为 JSON 响应）
  return app;
}

export default NextAPI(handler);
```

### 2.2 创建操作 API

```typescript
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

export type CreateBody = {
  name: string;
  description?: string;
  // ... 其他字段
};

async function handler(req: ApiRequestProps<CreateBody>) {
  const { name, description } = req.body;

  // 1. 参数验证
  if (!name) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 2. 认证
  const { teamId, tmbId, userId } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  // 3. 业务限制检查（如配额）
  // await checkTeamLimit(teamId);

  // 4. 创建资源
  const newId = await createResource({
    teamId,
    tmbId,
    name,
    description
  });

  // 5. 可选：记录审计日志（异步执行，不阻塞响应）
  (async () => {
    await addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_RESOURCE,
      params: { name }
    });
  })();

  return newId;
}

export default NextAPI(handler);
```

### 2.3 更新操作 API

```typescript
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

export type UpdateBody = {
  name?: string;
  description?: string;
};

export type UpdateQuery = {
  appId: string;
};

async function handler(req: ApiRequestProps<UpdateBody, UpdateQuery>) {
  const { appId } = req.query;
  const { name, description } = req.body;

  // 1. 参数验证
  if (!appId) {
    return Promise.reject('appId is required');
  }

  // 2. 认证与权限检查
  const { app, permission, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  // 3. 执行更新
  await MongoApp.findByIdAndUpdate(appId, {
    ...(name && { name }),
    ...(description && { description })
  });

  return 'success';
}

export default NextAPI(handler);
```

### 2.4 删除操作 API

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { appId } = req.query as { appId: string };

  if (!appId) {
    return Promise.reject('appId is required');
  }

  // 删除操作通常需要 Owner 权限
  const { app, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: OwnerPermissionVal
  });

  // 执行删除
  await deleteApp({ teamId, appId });

  // 记录审计日志
  (async () => {
    await addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_APP,
      params: { appName: app.name }
    });
  })();

  return 'success';
}

export default NextAPI(handler);
```

## 3. 认证机制

### 3.1 认证方式

项目支持三种认证方式：

| 方式 | 参数 | 适用场景 |
|-----|------|---------|
| Token | `authToken: true` | Web 端用户操作 |
| API Key | `authApiKey: true` | 第三方集成、API 调用 |
| Root Key | `authRoot: true` | 系统管理操作 |

### 3.2 认证函数

```typescript
// 应用级认证
import { authApp } from '@fastgpt/service/support/permission/app/auth';
const { app, permission, teamId, tmbId } = await authApp({
  req,
  authToken: true,
  appId,
  per: ReadPermissionVal
});

// 数据集认证
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
const { dataset, permission } = await authDataset({
  req,
  authToken: true,
  datasetId,
  per: WritePermissionVal
});

// 用户权限认证（无特定资源）
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
const { teamId, tmbId, userId } = await authUserPer({
  req,
  authToken: true,
  per: TeamAppCreatePermissionVal
});

// 聊天认证
import { authChatCrud } from '@fastgpt/service/support/permission/auth/chat';
const { teamId, tmbId, appId } = await authChatCrud({
  req,
  authToken: true,
  authApiKey: true,
  appId,
  chatId
});
```

### 3.3 权限值常量

```typescript
import {
  ReadPermissionVal,    // 0b100 - 读取权限
  WritePermissionVal,   // 0b010 - 写入权限
  ManagePermissionVal,  // 0b001 - 管理权限
  OwnerPermissionVal    // ~0 >>> 0 - 所有者权限
} from '@fastgpt/global/support/permission/constant';
```

### 3.4 权限检查模式

```typescript
// 模式1：直接要求特定权限
await authApp({ req, appId, per: WritePermissionVal, authToken: true });

// 模式2：条件认证（根据参数选择认证方式）
const { teamId, tmbId } = parentId
  ? await authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })
  : await authUserPer({ req, per: TeamAppCreatePermissionVal, authToken: true });

// 模式3：先获取数据再检查权限
const { app, permission } = await authApp({ req, appId, per: ReadPermissionVal, authToken: true });
if (!permission.hasWritePer) {
  return Promise.reject(AppErrEnum.unAuthApp);
}
```

## 4. 错误处理

### 4.1 错误返回方式

```typescript
// 使用预定义错误枚举
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

// 参数缺失
return Promise.reject(CommonErrEnum.missingParams);

// 资源不存在
return Promise.reject(AppErrEnum.unExist);

// 权限不足
return Promise.reject(AppErrEnum.unAuthApp);

// 自定义错误消息
return Promise.reject('Custom error message');
```

### 4.2 常用错误枚举

| 错误类型 | 枚举值 | 说明 |
|---------|-------|------|
| 参数缺失 | `CommonErrEnum.missingParams` | 必需参数未提供 |
| 未授权 | `ERROR_ENUM.unAuthorization` | 认证失败 |
| 资源不存在 | `AppErrEnum.unExist` | 应用/数据集等不存在 |
| 权限不足 | `AppErrEnum.unAuthApp` | 无操作权限 |
| 配额不足 | `ERROR_ENUM.insufficientQuota` | 超出使用限制 |

## 5. 类型定义

### 5.1 请求类型

```typescript
import type { ApiRequestProps } from '@fastgpt/service/type/next';

// 定义 Body 类型
export type CreateAppBody = {
  name: string;
  avatar?: string;
  type: AppTypeEnum;
};

// 定义 Query 类型
export type GetAppQuery = {
  appId: string;
};

// 在 handler 中使用
async function handler(req: ApiRequestProps<CreateAppBody, GetAppQuery>) {
  const { name, type } = req.body;
  const { appId } = req.query;
}
```

### 5.2 分页类型

```typescript
import type { PaginationProps, PaginationResponse } from '@fastgpt/service/common/api/type';

export type ListQuery = PaginationProps<{
  keyword?: string;
  status?: string;
}>;

async function handler(req: ApiRequestProps<{}, ListQuery>): Promise<PaginationResponse<ItemType>> {
  const { pageNum = 1, pageSize = 10, keyword } = req.query;

  const [list, total] = await Promise.all([
    Model.find(query).skip((pageNum - 1) * pageSize).limit(pageSize),
    Model.countDocuments(query)
  ]);

  return { list, total };
}
```

## 6. 特殊配置

### 6.1 文件上传 API

```typescript
// 禁用默认的 body 解析
export const config = {
  api: {
    bodyParser: false
  }
};
```

### 6.2 大请求体 API

```typescript
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '20mb'
  }
};
```

### 6.3 流式响应 API

```typescript
import { responseWrite, sseErrRes } from '@fastgpt/service/common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 设置流式响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 写入流式数据
    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: JSON.stringify({ content: 'Hello' })
    });

    // 结束流
    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });
  } catch (err) {
    sseErrRes(res, err);
  }
  res.end();
}

export default NextAPI(handler);
```

## 7. 最佳实践

### 7.1 事务处理

复杂的多步操作使用 MongoDB 事务确保原子性：

```typescript
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

await mongoSessionRun(async (session) => {
  await Model1.create([data1], { session });
  await Model2.updateOne(query, update, { session });
  await Model3.deleteMany(query, { session });
});
```

### 7.2 并行查询

多个独立的数据库查询使用 `Promise.all`：

```typescript
const [app, histories, config] = await Promise.all([
  MongoApp.findById(appId),
  getHistories({ appId, limit: 10 }),
  getAppConfig(appId)
]);
```

### 7.3 异步操作（不阻塞响应）

审计日志、追踪等不需要等待的操作：

```typescript
// 立即执行但不等待
(async () => {
  await addAuditLog({ ... });
  await pushTrack.createApp({ ... });
})();

return result; // 立即返回，不等待日志完成
```

### 7.4 多认证方式支持

```typescript
async function handler(req: ApiRequestProps<Body>) {
  const { shareId, outLinkUid, appId, teamToken } = req.body;

  // 根据不同参数选择认证方式
  const authResult = await (async () => {
    // 分享链接认证
    if (shareId && outLinkUid) {
      return authOutLink({ shareId, outLinkUid });
    }
    // 团队令牌认证
    if (teamToken) {
      return authTeamSpaceToken({ teamId, teamToken });
    }
    // 默认：用户令牌或 API Key
    return authCert({ req, authToken: true, authApiKey: true });
  })();

  // 使用认证结果
  const { teamId, tmbId } = authResult;
}
```

## 8. 检查清单

新增 API 时，请确保：

- [ ] 使用 `NextAPI` 包装 handler 函数
- [ ] 定义清晰的 TypeScript 类型（Body、Query、Response）
- [ ] 进行必要的参数验证
- [ ] 选择正确的认证方式和权限级别
- [ ] 使用预定义的错误枚举
- [ ] 重要操作添加审计日志
- [ ] 文件命名符合规范
- [ ] 特殊需求配置 `export const config`

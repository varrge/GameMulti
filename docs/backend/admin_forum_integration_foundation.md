# Admin 论坛联动后台接口与契约基础版

## 本次交付

仓库内新增了 Admin 侧论坛联动最小闭环骨架，覆盖 4 类后台能力：

1. **论坛账户映射列表查询**
   - 契约：`apps/api/contracts/admin_forum_integration.openapi.yaml`
   - 接口：`GET /api/admin/forum/accounts`
   - 关注字段：主站用户信息、forum account 映射、`syncStatus`、`mappingSource`

2. **论坛账户映射详情查看**
   - 契约：`apps/api/contracts/admin_forum_integration.openapi.yaml`
   - 接口：`GET /api/admin/forum/accounts/{forumAccountId}`
   - 返回：账户摘要 + 最近 ticket + 最近 sync jobs

3. **SSO ticket 状态查询**
   - 契约：`apps/api/contracts/admin_forum_integration.openapi.yaml`
   - 接口：`GET /api/admin/forum/tickets`
   - 关注字段：`status`、`redirectUrl`、`expiresAt`、`consumedAt`

4. **sync job 状态查询 + 最小人工操作（重试资料同步）**
   - 契约：`apps/api/contracts/admin_forum_integration.openapi.yaml`
   - 接口：
     - `GET /api/admin/forum/sync-jobs`
     - `POST /api/admin/forum/sync-jobs/{jobId}/retry-profile`
   - 关注字段：`jobType`、`status`、`attemptCount`、`lastErrorCode`、`lastErrorMessage`
   - 人工操作：允许 Admin 对 `sync_profile` 的 `failed/succeeded/cancelled` 任务发起一次新的 profile sync 重试请求

---

## 仓库文件路径

```text
apps/api/
  contracts/
    admin_forum_integration.openapi.yaml
  examples/
    admin_forum_integration_service.js
```

说明：

- `admin_forum_integration.openapi.yaml`：补齐 Admin 论坛联动查询/操作接口契约
- `admin_forum_integration_service.js`：复用 `ForumSsoService` 的内存状态，演示后台聚合查询与人工重试操作

---

## 数据来源与复用关系

这次没有再造一套论坛状态模型，而是直接复用现有论坛 SSO 基础模块：

- 底层服务：`apps/api/examples/forum_sso_service.js`
- 适配器骨架：`apps/api/adapters/discourse_forum_adapter.js`
- 数据模型草稿：`apps/api/schemas/forum_sso.prisma`

Admin 侧只是把这些状态按后台查询口径重新聚合出来：

- `forum_accounts` → 后台账户映射列表 / 详情
- `forum_sso_tickets` → 后台 ticket 状态页
- `forum_sync_jobs` → 后台同步任务页
- `retry-profile` → 基于现有失败任务重新 enqueue 一条 `sync_profile` 任务

这样做的好处：

- 后台看到的是与主链路一致的状态，不会前后台各说各话
- 后续真实接 Prisma repository / queue worker 时，Admin 层只需要替换 service 数据源，不用重改接口结构
- 最小人工操作先落在“重试资料同步”上，能覆盖最常见的运营排障动作

---

## 接口字段说明

### 1. forum account 摘要

关键字段：

- `forumAccountId`
- `userId`
- `username`
- `email`
- `userStatus`
- `forumProvider`
- `forumUserId`
- `forumUsername`
- `forumEmail`
- `externalUid`
- `syncStatus`
- `mappingSource`
- `lastSyncedAt`
- `lastLoginAt`

### 2. ticket 摘要

关键字段：

- `ticketId`
- `ticketPreview`（脱敏前缀，避免后台直接暴露完整 ticket）
- `status`
- `redirectUrl`
- `expiresAt`
- `consumedAt`

### 3. sync job 摘要

关键字段：

- `jobId`
- `jobType`
- `triggerSource`
- `status`
- `dedupeKey`
- `attemptCount`
- `maxAttempts`
- `nextRetryAt`
- `lastErrorCode`
- `lastErrorMessage`
- `finishedAt`

---

## 最小人工操作：retry profile sync

`POST /api/admin/forum/sync-jobs/{jobId}/retry-profile`

当前约束：

- 只允许重试 `jobType = sync_profile`
- 原任务状态必须是 `failed`、`succeeded` 或 `cancelled`
- 重试不会覆盖旧任务，而是重新 enqueue 一条新任务，保留原任务记录
- 新任务 payload 会附带：
  - `retryOfJobId`
  - `operatorId`
  - `reason`

这样可以保留后台人工干预痕迹，便于后续审计和问题回溯。

---

## 本地验证方式

在仓库根目录执行：

```bash
node apps/api/examples/admin_forum_integration_service.js
```

预期会打印：

1. forum account 列表
2. 指定 account 详情（含 recent tickets / recent sync jobs）
3. ticket 列表
4. sync job 列表
5. 一次 `retryProfileSync()` 的返回结果

其中 demo 数据包含：

- `user_1`：已完成一次正常 ticket 消费与 profile sync
- `user_2`：存在一条 `sync_profile` 失败记录，以及一条待处理 `sync_ban_state` 任务，方便验证后台人工重试入口

---

## 后续真实落地建议

下一步可以继续接：

1. 把 `admin_forum_integration_service.js` 迁移为真实 application service
2. 接 Prisma repository，查询真实 `forum_accounts` / `forum_sso_tickets` / `forum_sync_jobs`
3. 接后台鉴权和操作审计日志
4. 把 `retry-profile` 接到真实 worker / queue 生产逻辑
5. 如需更多人工操作，可继续补：
   - 手动补建 forum mapping
   - 手动禁用 forum account
   - 手动重试 ban sync

---

## 本次边界

这次交付是 **后台契约 + 示例 service**，不是完整生产 API：

- 还没接真实 HTTP controller
- 还没接数据库查询层
- 还没接真实任务队列
- 还没接后台鉴权中间件

但契约结构、字段形态、最小人工操作边界已经固定，后续接真实实现会更稳。
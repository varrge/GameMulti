# 邀请制账户与绑定真实联调闭环记录

## 结论
本次在 `GameMulti` 仓库内补齐了一条**可重复执行的最小联调闭环**，覆盖以下接口顺序：

1. `POST /api/invitations/validate`
2. `POST /api/auth/invite-register`
3. `POST /api/plugin/bindings/session`
4. `GET /api/bindings/session/by-token`
5. `POST /api/bindings/session/by-pair-code`
6. `POST /api/bindings/confirm`

联调使用仓库内的最小可运行服务 `backend/examples/invite_binding_service.js`，并通过 `backend/scripts/invite_binding_verify.js` 固化验证步骤，执行结果落在 `docs/integration/invite_binding_real_integration_result.json`。

## 交付路径
- 服务示例：`backend/examples/invite_binding_service.js`
- 验证脚本：`backend/scripts/invite_binding_verify.js`
- 验证结果：`docs/integration/invite_binding_real_integration_result.json`
- 闭环说明：`docs/integration/invite_binding_real_integration.md`
- 接口契约：`backend/contracts/invite_binding.openapi.yaml`

## 可重复执行的验证步骤
在仓库根目录执行：

```bash
node backend/scripts/invite_binding_verify.js
```

预期结果：标准输出为 JSON，包含 `path`、`state`、`summary` 三段。

### 验证步骤与接口映射

| 步骤 | 接口 | 目标 | 核心验证点 |
| --- | --- | --- | --- |
| 1 | `POST /api/invitations/validate` | 校验邀请码 | 返回 `valid=true`、`codeStatus=active` |
| 2 | `POST /api/auth/invite-register` | 邀请码注册 | 创建用户、消费邀请码、记录 usage |
| 3 | `POST /api/plugin/bindings/session` | 插件发起绑定会话 | 返回 `sessionId/token/pairCode/bindUrl/expiresIn` |
| 4 | `GET /api/bindings/session/by-token` | Web 端按 token 查询 | 返回待确认会话、`canConfirm=true` |
| 5 | `POST /api/bindings/session/by-pair-code` | Web 端按配对码查询 | 能查回同一个 `sessionId` |
| 6 | `POST /api/bindings/confirm` | 用户确认绑定 | 创建 `game_accounts` / `user_game_bindings`，会话转 `confirmed` |

## 本次联调使用的固定样例
- 邀请码：`ABCD1234`
- 注册账号：`player_one / player_one@example.com`
- 插件客户端：`demo-client`
- 游戏：`minecraft`
- 服务器：`cn-mc-01`
- 平台：`java`
- 游戏用户：`UUID-123`
- 展示名：`Steve`

## 验证结果摘要
以 `docs/integration/invite_binding_real_integration_result.json` 为准，本次执行确认了：

- `invitationCodes.usedCount` 从 `0` 增至 `1`
- 生成了 1 条 `invitationCodeUsages`
- 生成了 1 条 `bindingSessions`
- 生成了 1 条 `gameAccounts`
- 生成了 1 条 `userGameBindings`
- 最终 `bindingSessions.status = confirmed`

## 关键状态流转

### 邀请码
- 初始：`active`
- 注册消费后：仍为 `active`，但 `usedCount + 1`

### 绑定会话
- 创建后：`pending`
- 确认后：`confirmed`

### 正式绑定
- 确认后创建 `user_game_bindings`
- `bindStatus = active`
- `bindSource = binding_session_confirm`

## 当前缺口
这次补的是**仓库内最小真实联调闭环**，但仍有几块没有落成生产态：

1. 目前是内存版 service，还没接 Prisma / 数据库事务
2. 还没有 HTTP server / controller 层把 OpenAPI 契约真正暴露成接口
3. 插件鉴权目前只验证 `pluginClientKey`，还没做签名、时间戳、防重放
4. 还没有前端页面或 Minecraft 插件直接接这个脚本跑自动化联调
5. 缺少异常分支自动化覆盖，例如邀请码耗尽、会话过期、重复绑定冲突

## 下一步建议
1. 先把 `InviteBindingService` 迁移为 repository + service 结构，接入 Prisma schema
2. 用 Express / Fastify / Nest 任一框架补一层 HTTP adapter，对齐 `invite_binding.openapi.yaml`
3. 新增异常分支验证脚本，至少覆盖 `expired / exhausted / already_used / already_bound`
4. 再接 `plugin-poc/minecraft-js` 或真实插件，把 `create session -> query -> confirm` 串成端到端脚本

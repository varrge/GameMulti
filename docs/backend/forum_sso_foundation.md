# 论坛 SSO 与账户映射基础方案

## 目标

在现有“邀请制账户 + 游戏绑定 + 奖励结算”基础上，补齐 **主站账户与论坛账户之间的 SSO / 账户映射基础模块**，让后续能够继续推进：

- 主站登录后无缝进入论坛
- 首次登录论坛时自动建号或绑定已有论坛账户
- 主站资料、封禁状态可异步同步到论坛
- 同步过程具备可追踪、可重试、可审计能力

本稿优先提供：

- 领域模型与状态设计
- 数据表 / Prisma 草稿
- 服务骨架与队列处理示例
- 接入点说明与安全边界

这样后续无论论坛最终接的是 Discourse、Flarum、NodeBB 还是自研论坛，都能先用统一的内部接口承接。

---

## 一、推荐目录结构

```text
backend/
  schemas/
    forum_sso.prisma
  examples/
    forum_sso_service.js
docs/
  backend/
    forum_sso_foundation.md
```

职责说明：

- `schemas/`：论坛账户映射、SSO ticket、同步任务等核心数据模型草稿
- `examples/`：最小可运行的内存版服务骨架，验证首次同步、签发 ticket、异步任务状态流转
- `docs/`：记录模块职责、外部论坛接入点和后续扩展方向

---

## 二、核心业务链路

### 1. 主站进入论坛

1. 用户已登录主站
2. 主站请求 `ForumSsoService.issueForumEntry()`
3. 服务确保当前用户存在 `forum_accounts` 映射；若没有则尝试自动创建
4. 服务生成一次性 `forum_sso_tickets`
5. 前端跳转到论坛 `/sso/consume?ticket=xxx` 或对应桥接接口
6. 论坛桥接层消费 ticket，完成论坛登录态建立

### 2. 首次建号 / 账户映射

1. 用户第一次访问论坛
2. 系统查不到 `forum_accounts`
3. 若业务允许自动建号：
   - 创建论坛用户
   - 写入主站用户与论坛用户的映射
4. 若论坛已有人为创建的旧账户：
   - 可按邮箱 / 外部 UID 做受控匹配
   - 匹配成功后写入映射并标记来源

### 3. 主站资料同步到论坛

同步触发时机建议包括：

- 用户首次建立论坛映射
- 用户修改用户名、头像、展示名
- 用户状态变化（停用 / 封禁 / 解封）
- 后台人工触发全量补同步

同步动作不要阻塞主链路，而是写入 `forum_sync_jobs`，再异步执行。

### 4. 封禁 / 风控同步

1. 主站用户被禁用、封禁或解除限制
2. 写入 forum sync job
3. 由论坛适配层调用外部论坛 API 执行：
   - suspend / unsuspend
   - group remove
   - trust level 限制
4. 回写任务执行结果和最近错误

---

## 三、推荐数据模型

### 1. `forum_accounts`

表示：主站用户在论坛侧的唯一映射关系。

建议核心字段：

- `id`
- `user_id`
- `forum_provider`：论坛实现类型，如 `discourse` / `flarum`
- `forum_user_id`：论坛侧用户唯一 ID
- `forum_username`
- `forum_email`
- `external_uid`：传给论坛的外部身份（推荐使用主站 user id）
- `sync_status`：当前同步状态
- `last_synced_at`
- `last_login_at`
- `mapping_source`：`auto_create` / `matched_existing` / `manual_bind`
- `created_at` / `updated_at`

关键约束建议：

- `unique(user_id, forum_provider)`
- `unique(forum_provider, forum_user_id)`
- `unique(forum_provider, external_uid)`

### 2. `forum_sso_tickets`

表示：主站签发给论坛桥接层消费的一次性票据。

建议核心字段：

- `id`
- `user_id`
- `forum_account_id`
- `forum_provider`
- `ticket`
- `redirect_url`
- `status`：`issued` / `consumed` / `expired` / `cancelled`
- `expires_at`
- `consumed_at`
- `request_ip`
- `request_user_agent`
- `created_at`

设计目的：

- 让 SSO 消费动作可审计
- 限制一次性使用，降低重放风险
- 支持论坛桥接层与主站后端解耦

### 3. `forum_sync_jobs`

表示：主站写给论坛同步执行器的异步任务。

建议核心字段：

- `id`
- `user_id`
- `forum_account_id`
- `forum_provider`
- `job_type`：`create_account` / `sync_profile` / `sync_ban_state` / `sync_groups`
- `trigger_source`：`user_login` / `profile_update` / `admin_action` / `system_backfill`
- `payload`
- `status`：`pending` / `processing` / `succeeded` / `failed` / `cancelled`
- `dedupe_key`
- `attempt_count`
- `max_attempts`
- `next_retry_at`
- `last_error_code`
- `last_error_message`
- `finished_at`
- `created_at` / `updated_at`

关键约束建议：

- `unique(dedupe_key)`：避免同一用户在同一时刻被重复塞入同类任务
- 按 `status + next_retry_at` 建索引，便于轮询和批处理

---

## 四、状态设计

### 1. 论坛账户同步状态 `ForumAccountSyncStatus`

建议枚举：

- `pending_initial_sync`
- `active`
- `syncing`
- `sync_failed`
- `disabled`

说明：

- `pending_initial_sync`：刚创建映射，首轮资料尚未同步完成
- `active`：映射有效，最近一次同步成功
- `syncing`：已有同步任务在执行中
- `sync_failed`：最近一次同步失败，需要重试或人工介入
- `disabled`：映射停用，不再用于签发论坛登录

### 2. SSO ticket 状态 `ForumSsoTicketStatus`

建议枚举：

- `issued`
- `consumed`
- `expired`
- `cancelled`

### 3. 同步任务状态 `ForumSyncJobStatus`

建议枚举：

- `pending`
- `processing`
- `succeeded`
- `failed`
- `cancelled`

---

## 五、接入点与模块边界

### 1. 主站用户模块

用户登录成功后，可调用：

- `ensureForumAccountForUser(userId)`
- `issueForumEntry(userId, redirectUrl)`

推荐触发点：

- 用户点击“进入论坛”按钮
- 用户中心页显示“论坛账号状态”卡片
- 后台手动补同步按钮

### 2. 论坛适配层 `ForumProviderAdapter`

建议统一抽象接口，屏蔽具体论坛实现差异：

- `createUser(payload)`
- `findUserByExternalUid(externalUid)`
- `findUserByEmail(email)`
- `syncProfile(payload)`
- `syncBanState(payload)`
- `buildConsumeUrl(ticket)`

这样后续切换论坛实现时，只替换 adapter，不用重写主站领域逻辑。

### 3. 异步任务执行器

`forum_sync_jobs` 推荐由独立 worker / cron 拉取。

执行原则：

- 每次只 claim 有效的 `pending` 任务
- 失败后指数退避
- 对 4xx 型错误和“目标用户不存在”等业务错误要区分是否可重试
- 每次执行都要回写 attempt、错误码、错误信息

---

## 六、安全边界

### 1. 不直接信任论坛回调

如果论坛桥接层会回调主站确认 ticket：

- 必须校验 ticket 是否存在
- 必须校验状态仍为 `issued`
- 必须校验是否过期
- 消费后立即改为 `consumed`

### 2. 外部身份推荐使用不可变主键

不要把 `username` 当作论坛外部唯一身份；推荐使用主站 `user.id` 作为 `external_uid`。

### 3. 自动匹配已有论坛账户要受控

若启用“按邮箱匹配论坛旧账号”：

- 只允许在邮箱已验证的前提下触发
- 匹配成功要写明 `mapping_source = matched_existing`
- 最好保留后台审核开关，避免误绑

### 4. 同步任务要幂等

同一用户的“资料同步”“封禁同步”在短时间内可能被多次触发，必须通过 `dedupe_key` 做折叠，避免打爆论坛 API。

---

## 七、最小落地建议

如果本轮只做第一版基础模块，建议先覆盖：

1. `forum_accounts` Prisma 草稿
2. `forum_sso_tickets` Prisma 草稿
3. `forum_sync_jobs` Prisma 草稿
4. 内存版 `ForumSsoService`：
   - ensure forum account
   - issue ticket
   - consume ticket
   - enqueue sync job
   - process sync jobs
5. 文档中列清：
   - 主站接入点
   - 论坛适配层接口
   - 后续要接真实论坛 API 的位置

这样即使外部论坛接入暂未就绪，也已经把主站侧的边界和数据模型钉牢了。

---

## 八、后续扩展方向

后续可以继续补：

- 主站 / 论坛用户组映射策略
- 勋章、头衔、信任等级同步
- 论坛侧登录成功事件回流主站埋点
- 用户主动解绑论坛账户流程
- 多论坛提供方支持（同一个主站接多个社区）
- 全量 backfill / repair job

---

## 九、与当前仓库已有模块的衔接

当前仓库里已有：

- 邀请制账户基础 (`invite_binding`)
- 管理员邀请码能力 (`admin_player_invites`)
- 奖励结算 / 钱包骨架

论坛 SSO 模块与这些模块的关系：

- 依赖 `users` 作为主身份源
- 可读取 `user_game_bindings` / 钱包 / 封禁状态，决定论坛展示和权限
- 通过 `forum_sync_jobs` 与未来的封禁联动、勋章发放串起来

建议后续把“论坛同步”和“封禁联动”视为同一个外部系统集成域，避免散落在多个 service 里各自调用论坛 API。

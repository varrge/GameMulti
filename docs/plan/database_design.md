# 数据库设计说明（初版）

## 1. 设计目标

本数据库设计围绕以下核心业务展开：

1. 邀请制准入
2. 主站账户与游戏身份分离
3. 游戏内发起绑定 + Web 端确认
4. 玩家行为转金币
5. 商城兑换与发货
6. 论坛同步与封禁联动
7. 审计与风控可追踪

本文件以“业务可理解”为优先，不只列字段名，也解释每张表的职责。

---

## 2. 邀请制与主站账户

### 2.1 `users`

表示：主站正式用户身份。

推荐核心字段：

- `id`：用户唯一 ID
- `username`：主站用户名
- `email`：邮箱
- `password_hash`：密码哈希
- `status`：账户状态（正常、封禁、停用等）
- `invited_by_user_id`：这个用户是被哪个已有用户邀请进来的
- `invitation_code_id`：这个用户注册时使用了哪张邀请码
- `last_login_at`：最近一次登录时间
- `created_at` / `updated_at`

说明：

本项目是邀请制社区，因此比起“注册来源”，更重要的是“谁邀请了谁、用了哪张邀请码”。

### 2.2 `invitation_codes`

表示：系统签发的每一张邀请码。

推荐核心字段：

- `id`
- `code`：邀请码字符串
- `created_by`：谁创建了这张邀请码
- `owner_user_id`：这张邀请码归谁拥有（建议保留）
- `batch_id`：属于哪一批生成
- `max_uses`：最大可使用次数
- `used_count`：已使用次数
- `expires_at`：过期时间
- `status`：当前状态
- `remark`：备注
- `created_at`

说明：

邀请码是准入系统的一部分，不是普通附属字段。

### 2.3 `invitation_code_usages`

表示：某张邀请码在某个时间点被谁使用了一次。

推荐核心字段：

- `id`
- `invitation_code_id`
- `user_id`
- `inviter_user_id`（建议冗余存储）
- `used_ip`
- `used_user_agent`
- `used_at`

说明：

该表是邀请码的使用流水表，用于风控、审计与邀请关系追踪。

---

## 3. 游戏基础模型

### 3.1 `games`

表示：平台支持的游戏目录。

核心字段：

- `id`
- `code`：如 `minecraft`、`rust`
- `name`
- `status`
- `created_at`

### 3.2 `game_servers`

表示：某个游戏下的一台具体服务器。

核心字段：

- `id`
- `game_id`
- `server_code`
- `server_name`
- `region`
- `endpoint_host`
- `endpoint_port`
- `adapter_type`
- `status`
- `meta`
- `created_at` / `updated_at`

### 3.3 `server_plugin_clients`

表示：哪一个插件实例有权代表某台服务器和主站通信。

核心字段：

- `id`
- `server_id`
- `client_key`
- `client_secret_hash`
- `plugin_version`
- `protocol_version`
- `last_heartbeat_at`
- `status`
- `created_at` / `updated_at`

说明：

这张表属于插件接入安全模型的一部分，用于接口鉴权、插件健康检查、版本管理与审计。

---

## 4. 游戏身份与绑定

### 4.1 `game_accounts`

表示：某个玩家在某个游戏中的唯一身份。

核心字段：

- `id`
- `game_id`
- `platform`
- `game_user_id`
- `display_name`
- `normalized_game_user_id`
- `extra_meta`
- `created_at` / `updated_at`

说明：

这张表承载的是“游戏里的这个玩家是谁”。

### 4.2 `binding_sessions`

表示：从游戏内发起到网页确认完成前的临时绑定过程。

核心字段：

- `id`
- `game_id`
- `server_id`
- `plugin_client_id`
- `game_user_id`
- `platform`
- `display_name`
- `token`
- `pair_code`
- `status`
- `expires_at`
- `used_at`
- `used_by_user_id`
- `created_ip`
- `created_at` / `updated_at`

说明：

该表用于承载“游戏内发起绑定 -> 生成链接/配对码 -> 网页确认”的中间状态。

### 4.3 `user_game_bindings`

表示：主站用户与游戏身份之间的正式关系。

核心字段：

- `id`
- `user_id`
- `game_account_id`
- `server_id`
- `bind_status`
- `bind_source`
- `verified_by`
- `verified_at`
- `unbind_requested_at`
- `unbind_approved_at`
- `unbind_cooldown_until`
- `created_at` / `updated_at`

说明：

该表是主站身份与游戏身份之间的桥梁，决定后续事件是否能够归属到某个主站用户。

---

## 5. 玩家行为、时长与奖励规则

### 5.1 `game_player_events`

表示：插件从服务器上报的原始玩家行为事件。

核心字段：

- `id`
- `server_id`
- `plugin_client_id`
- `game_id`
- `game_user_id`
- `platform`
- `event_type`
- `event_unique_key`
- `event_time`
- `payload`
- `process_status`
- `processed_at`
- `created_at`

说明：

这是原始事实表，用于承载“玩家到底做了什么”。

### 5.2 `game_play_sessions`

表示：玩家从上线到下线的一次完整游玩会话。

核心字段：

- `id`
- `user_id`
- `game_account_id`
- `server_id`
- `joined_at`
- `left_at`
- `duration_seconds`
- `session_status`
- `created_at` / `updated_at`

说明：

这张表便于做在线时长型奖励，而不必从事件流中临时拼装。

### 5.3 `reward_rules`

表示：哪些行为或时长可以奖励多少金币。

核心字段：

- `id`
- `game_id`
- `server_id`
- `rule_code`
- `rule_name`
- `rule_type`
- `rule_config`
- `status`
- `priority`
- `created_at` / `updated_at`

说明：

建议尽量把可调整的奖励条件抽到规则层，而不是全部写死在代码里。

### 5.4 `coin_reward_settlements`

表示：某条事件或某段游玩时长最终被结算成的一笔奖励。

核心字段：

- `id`
- `user_id`
- `wallet_transaction_id`
- `reward_rule_id`
- `source_event_id`
- `source_session_id`
- `amount`
- `settlement_status`
- `idempotency_key`
- `settled_at`
- `created_at`

说明：

该表是事实层和钱包流水层之间的结算层，用于防重、审计和回溯。

---

## 6. 钱包与账本

### 6.1 `wallets`

表示：用户当前钱包余额快照。

核心字段：

- `id`
- `user_id`
- `balance`
- `frozen_balance`
- `status`
- `created_at` / `updated_at`

说明：

它只回答“现在还有多少金币”，不回答“钱怎么来的”。

### 6.2 `wallet_transactions`

表示：每一次金币变动的账本流水。

核心字段：

- `id`
- `wallet_id`
- `user_id`
- `direction`
- `amount`
- `balance_before`
- `balance_after`
- `business_type`
- `reference_type`
- `reference_id`
- `idempotency_key`
- `remark`
- `created_at`

说明：

这是整个金币系统最关键的审计表之一，不可省略。

---

## 7. 商城与发货

### 7.1 `redeem_items`

表示：商城中的可兑换物品。

核心字段：

- `id`
- `name`
- `slug`
- `item_type`
- `cost_coins`
- `stock`
- `status`
- `delivery_config`
- `created_at` / `updated_at`

### 7.2 `redeem_orders`

表示：用户发起的一次兑换订单。

核心字段：

- `id`
- `user_id`
- `order_no`
- `total_cost`
- `status`
- `created_at` / `updated_at`

### 7.3 `redeem_order_items`

表示：订单中的单个兑换项。

核心字段：

- `id`
- `redeem_order_id`
- `redeem_item_id`
- `quantity`
- `unit_cost`
- `total_cost`
- `delivery_status`
- `delivery_target_type`
- `delivery_target_ref`
- `created_at`

### 7.4 `reward_delivery_jobs`

表示：某个兑换结果最终如何发放出去。

核心字段：

- `id`
- `order_item_id`
- `job_type`
- `target_type`
- `target_ref`
- `payload`
- `status`
- `retry_count`
- `next_retry_at`
- `result_message`
- `created_at` / `updated_at`

说明：

商城兑换不能只扣钱，还必须记录“如何发货、发货是否成功、失败如何重试”。

---

## 8. 论坛同步

### 8.1 `forum_accounts`

表示：主站用户和论坛用户之间的映射关系。

### 8.2 `forum_sync_jobs`

表示：论坛侧的异步同步任务，例如创建用户、同步资料、封禁用户、发放勋章。

---

## 9. 封禁与审计

### 9.1 `ban_records`

表示：某个主站用户被封禁的主记录。

### 9.2 `ban_targets`

表示：这次封禁需要下发到哪些目标，如主站登录、论坛、游戏服务器。

### 9.3 `audit_logs`

表示：关键操作的统一审计日志，包括用户、管理员、系统与插件行为。

---

## 10. 设计总结

本设计遵循以下原则：

1. 邀请关系是注册模型核心
2. 主站身份与游戏身份分离
3. 绑定会话与正式绑定分离
4. 事件、规则、结算、流水分层
5. 金币系统必须具备幂等与审计能力
6. 商城兑换必须具备异步发货与补偿机制


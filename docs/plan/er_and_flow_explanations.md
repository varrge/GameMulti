# ER 关系说明与核心业务流程时序（文字版）

## 1. 目标

本文档用于用“人话”说明：

1. 各张核心表之间是什么关系
2. 核心业务流程是怎么串起来的
3. 哪些数据是事实、哪些是状态、哪些是结果

---

# 2. ER 关系说明

## 2.1 用户与邀请制关系

### 关系链
- `users`
- `invitation_codes`
- `invitation_code_usages`

### 关系解释

#### `users.invited_by_user_id -> users.id`
表示：一个用户是被另一个已有用户邀请进来的。

#### `users.invitation_code_id -> invitation_codes.id`
表示：这个用户注册时具体使用了哪张邀请码。

#### `invitation_code_usages.invitation_code_id -> invitation_codes.id`
表示：某次邀请码使用记录对应的是哪张邀请码。

#### `invitation_code_usages.user_id -> users.id`
表示：哪位用户使用了这张邀请码完成注册。

### 业务含义
这组关系解决的是：
- 谁邀请了谁
- 用了哪张邀请码
- 邀请码被谁用了几次
- 是否存在异常注册行为

---

## 2.2 主站身份、登录方式与游戏身份关系

### 关系链
- `users`
- `user_auth_accounts`
- `game_accounts`
- `user_game_bindings`

### 关系解释

#### `user_auth_accounts.user_id -> users.id`
表示：一个主站用户可以绑定多个登录来源，例如邮箱、Steam 等。

#### `user_game_bindings.user_id -> users.id`
表示：哪个主站用户绑定了游戏身份。

#### `user_game_bindings.game_account_id -> game_accounts.id`
表示：绑定的是哪个游戏玩家身份。

### 业务含义
这组关系解决的是：
- 主站上“这个人”是谁
- 这个人可以怎么登录主站
- 这个人在游戏里对应哪个玩家身份
- 一个主站用户可以绑定多个游戏身份

---

## 2.3 游戏目录、服务器与插件实例关系

### 关系链
- `games`
- `game_servers`
- `server_plugin_clients`

### 关系解释

#### `game_servers.game_id -> games.id`
表示：一台服务器属于某个具体游戏。

#### `server_plugin_clients.server_id -> game_servers.id`
表示：一个插件实例属于某台具体服务器。

### 业务含义
这组关系解决的是：
- 平台支持哪些游戏
- 每个游戏有哪些服务器
- 到底是哪个插件实例在跟主站通信

---

## 2.4 绑定临时过程与正式绑定关系

### 关系链
- `binding_sessions`
- `game_accounts`
- `user_game_bindings`

### 关系解释

#### `binding_sessions.game_id / server_id / plugin_client_id`
表示：这次绑定请求来自哪个游戏、哪台服务器、哪个插件实例。

#### `binding_sessions.used_by_user_id -> users.id`
表示：最终是哪一个主站用户确认了这次绑定。

#### 绑定成功后：
- 先确认或创建 `game_accounts`
- 再写入 `user_game_bindings`

### 业务含义
这组关系解决的是：
- 游戏内发起绑定怎么落地
- 短链接和配对码如何与正式绑定结果关联
- 为什么要区分“绑定会话”和“绑定结果”

---

## 2.5 玩家行为、会话、规则、结算、账本关系

### 关系链
- `game_player_events`
- `game_play_sessions`
- `reward_rules`
- `coin_reward_settlements`
- `wallets`
- `wallet_transactions`

### 关系解释

#### `game_player_events`
表示：插件上报的原始行为事实。

#### `game_play_sessions`
表示：从上线到下线的一次游玩时段。

#### `reward_rules`
表示：什么行为或时长应该奖励多少金币。

#### `coin_reward_settlements`
表示：某条事实依据某条规则，最终结算出了一笔奖励。

#### `wallets`
表示：用户当前余额快照。

#### `wallet_transactions`
表示：每一笔金币变动的账本流水。

### 业务含义
这组关系解决的是：
- 玩家做了什么
- 玩了多久
- 应该奖励多少
- 最终发了多少
- 钱包为什么变了

---

## 2.6 商城、订单与发货关系

### 关系链
- `redeem_items`
- `redeem_orders`
- `redeem_order_items`
- `reward_delivery_jobs`
- `wallet_transactions`

### 关系解释

#### `redeem_orders.user_id -> users.id`
表示：是谁发起了兑换订单。

#### `redeem_order_items.redeem_order_id -> redeem_orders.id`
表示：一张订单中有哪些具体兑换项。

#### `redeem_order_items.redeem_item_id -> redeem_items.id`
表示：兑换的是哪些商品。

#### `reward_delivery_jobs.order_item_id -> redeem_order_items.id`
表示：订单项对应的发货任务。

#### `wallet_transactions.reference_type/reference_id`
可以回指订单或订单项，表示金币扣减来源。

### 业务含义
这组关系解决的是：
- 用户兑换了什么
- 扣了多少金币
- 发货有没有成功
- 失败能不能重试

---

## 2.7 论坛同步关系

### 关系链
- `users`
- `forum_accounts`
- `forum_sync_jobs`

### 关系解释

#### `forum_accounts.user_id -> users.id`
表示：主站用户和论坛用户之间的映射。

#### `forum_sync_jobs.user_id -> users.id`
表示：某个用户需要执行哪些论坛同步动作。

### 业务含义
这组关系解决的是：
- 主站账户如何映射到论坛账户
- 用户信息、封禁、勋章如何异步同步到论坛

---

## 2.8 封禁与审计关系

### 关系链
- `ban_records`
- `ban_targets`
- `audit_logs`

### 关系解释

#### `ban_records.user_id -> users.id`
表示：哪个用户被封禁。

#### `ban_targets.ban_record_id -> ban_records.id`
表示：这次封禁需要下发到哪些目标系统。

#### `audit_logs`
表示：关键操作的统一记录，不一定只关联封禁，也可能关联余额调整、邀请码生成、绑定确认等。

### 业务含义
这组关系解决的是：
- 封禁是如何记录的
- 封禁如何传播到论坛和游戏服
- 关键操作怎么留痕

---

# 3. 核心业务流程时序（文字版）

## 3.1 邀请制注册流程

### 流程步骤
1. 老用户或管理员生成邀请码
2. 系统在 `invitation_codes` 写入一张邀请码记录
3. 新用户带着邀请码进入注册流程
4. 后端校验邀请码是否存在、是否过期、是否还有可用次数
5. 注册成功后：
   - 写入 `users`
   - 写入 `invitation_code_usages`
   - 更新 `invitation_codes.used_count`

### 关键结果
- 新用户正式进入社区
- 邀请关系被记录
- 邀请码使用流水被审计

---

## 3.2 游戏内发起绑定流程

### 流程步骤
1. 玩家在游戏内输入 `/register`、`/bind` 或 `/pair`
2. 插件调用主站接口创建绑定会话
3. 后端写入 `binding_sessions`
4. 后端返回 `token`、`pairCode`、`bindUrl`
5. 插件把链接或配对码返回给玩家
6. 玩家进入网页并登录主站
7. 主站根据 token 或配对码找到对应绑定会话
8. 系统确认/创建 `game_accounts`
9. 系统写入 `user_game_bindings`
10. 系统把 `binding_sessions.status` 改为 `used`

### 关键结果
- 游戏身份与主站账户正式建立关系
- 绑定来源、验证时间与会话过程都可追踪

---

## 3.3 玩家行为上报与金币结算流程

### 流程步骤
1. 插件采集玩家行为，例如上线、下线、击杀、任务完成
2. 插件调用事件上报接口，提交事件列表
3. 后端写入 `game_player_events`
4. 后端按 `event_unique_key` 去重
5. 事件处理器读取待处理事件
6. 若事件可归并为时长，则同步维护 `game_play_sessions`
7. 结算模块读取 `reward_rules`
8. 命中规则后，创建 `coin_reward_settlements`
9. 结算成功后，写入 `wallet_transactions`
10. 更新 `wallets.balance`
11. 将 `coin_reward_settlements` 标记为已结算

### 关键结果
- 游戏事实、规则、结算、记账层层分离
- 同一事件不会重复奖励
- 金币变化可追踪

---

## 3.4 商城兑换流程

### 流程步骤
1. 用户在前端查看 `redeem_items`
2. 用户提交兑换请求
3. 后端创建 `redeem_orders` 与 `redeem_order_items`
4. 同一事务内：
   - 校验余额
   - 扣减钱包余额
   - 写入 `wallet_transactions`
5. 系统根据订单项创建 `reward_delivery_jobs`
6. 异步任务执行发货逻辑
7. 发货成功则更新订单项和订单状态
8. 发货失败则写失败原因并按策略重试

### 关键结果
- 扣金币和下单是同一笔业务
- 发货失败不会把整个用户请求卡死
- 每个订单项的发货状态可审计

---

## 3.5 封禁联动流程

### 流程步骤
1. 管理员在后台发起封禁操作
2. 系统写入 `ban_records`
3. 根据封禁范围生成 `ban_targets`
4. 对论坛、游戏服务器、主站登录分别创建同步任务
5. 插件或论坛同步模块执行封禁
6. 执行结果回写到 `ban_targets`
7. 全流程写入 `audit_logs`

### 关键结果
- 一次封禁，多端联动
- 哪个目标成功、哪个目标失败可单独追踪
- 后续解封也可按同样链路处理

---

## 3.6 解绑审核流程

### 流程步骤
1. 用户发起解绑申请
2. 系统更新 `user_game_bindings.bind_status = pending_unbind`
3. 写入申请时间与冷却截止时间
4. 管理员在后台审核
5. 审核通过后更新绑定状态为 `unbound`
6. 审核拒绝则恢复有效绑定状态
7. 关键操作写入 `audit_logs`

### 关键结果
- 解绑不是即时删除关系，而是可审核、可审计、可控的状态流转

---

# 4. 推荐的数据分层理解

为了避免模型混乱，建议把数据按以下 4 层理解：

## 4.1 身份层
- `users`
- `user_auth_accounts`
- `game_accounts`
- `user_game_bindings`

负责回答：
> 这个人是谁？怎么登录？在游戏里对应谁？

## 4.2 事实层
- `game_player_events`
- `game_play_sessions`
- `server_status_snapshots`

负责回答：
> 真实发生了什么？

## 4.3 规则与结果层
- `reward_rules`
- `coin_reward_settlements`
- `ban_records`
- `ban_targets`
- `forum_sync_jobs`
- `reward_delivery_jobs`

负责回答：
> 系统根据事实做出了什么判断和动作？

## 4.4 账本与审计层
- `wallets`
- `wallet_transactions`
- `redeem_orders`
- `redeem_order_items`
- `audit_logs`

负责回答：
> 最终结果怎么落账？怎么留痕？

---

# 5. 总结

这套设计最核心的思想是：

1. 邀请关系不是附属信息，而是准入模型核心
2. 主站用户、登录来源、游戏身份必须分开建模
3. 绑定过程要有临时会话层，不能直接跳成正式绑定
4. 玩家事实、奖励规则、结算结果、钱包流水必须拆层
5. 商城兑换与发货必须异步可重试
6. 封禁和论坛同步都要可追踪、可回执、可审计


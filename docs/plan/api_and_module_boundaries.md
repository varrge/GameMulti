# 接口与模块边界草案

## 1. 目标

本文件用于明确系统模块之间的边界，以及首批推荐接口形态。当前不是 Swagger 最终稿，而是用于指导前后端与插件协作的“接口边界说明”。

---

## 2. 插件接入模块

### 2.1 发起绑定会话

**接口**
- `POST /api/plugin/bindings/session`

**作用**
- 游戏插件在玩家输入 `/register`、`/bind` 等命令后调用
- 创建一条 5 分钟有效的绑定会话
- 返回短链接 token 与配对码

**核心请求内容**
- `serverCode`
- `gameCode`
- `platform`
- `gameUserId`
- `displayName`
- `bindMode`

**核心响应内容**
- `sessionId`
- `token`
- `pairCode`
- `expiresIn`
- `bindUrl`

### 2.2 上报玩家行为事件

**接口**
- `POST /api/plugin/events`

**作用**
- 插件批量上报玩家行为事件
- 例如上线、下线、击杀、完成任务、输入绑定命令等

**要求**
- 每条事件必须带 `eventUniqueKey`
- 后端按 `plugin_client_id + event_unique_key` 去重

### 2.3 上报服务器状态

**接口**
- `POST /api/plugin/servers/status`

**作用**
- 插件定时上报当前服务器状态
- 用于前台状态卡片与后台监控

### 2.4 拉取待执行命令

**接口**
- `GET /api/plugin/commands/pending`

**作用**
- 插件轮询主站后端，获取待执行的封禁、发奖、同步等命令

### 2.5 回执命令执行结果

**接口**
- `POST /api/plugin/commands/{id}/ack`

**作用**
- 插件执行完命令后，回传结果、日志与状态

---

## 3. Web 绑定模块

### 3.1 根据 token 获取绑定会话

**接口**
- `GET /api/bindings/session/by-token`

**作用**
- 玩家从游戏内短链接进入网页后，通过 token 查询绑定会话详情

### 3.2 根据配对码查询绑定会话

**接口**
- `POST /api/bindings/session/by-pair-code`

**作用**
- 玩家手动输入配对码后，查询对应绑定会话

### 3.3 确认绑定

**接口**
- `POST /api/bindings/confirm`

**作用**
- 玩家在 Web 端完成登录后，确认绑定会话
- 后端建立 `game_accounts` 与 `user_game_bindings`

### 3.4 发起解绑申请

**接口**
- `POST /api/user/game-bindings/{bindingId}/unbind-request`

**作用**
- 用户提交解绑申请
- 进入管理员审核或冷却流程

---

## 4. 主站用户模块

### 4.1 用户基础信息
- `GET /api/me`
- `PATCH /api/me`

### 4.2 已绑定游戏身份
- `GET /api/me/game-bindings`

### 4.3 我的钱包与流水
- `GET /api/me/wallet`
- `GET /api/me/wallet/transactions`

### 4.4 我的兑换订单
- `GET /api/me/redeem-orders`
- `GET /api/me/redeem-orders/{orderId}`

---

## 5. 商城兑换模块

### 5.1 获取商品列表
- `GET /api/redeem/items`

### 5.2 创建兑换订单
- `POST /api/redeem/orders`

### 5.3 查询订单详情
- `GET /api/redeem/orders/{orderId}`

**模块边界说明**

商城模块本身只负责：
- 商品查询
- 订单创建
- 金币扣减
- 发货任务创建

真正的发货动作不在这里同步完成，而是交给异步任务模块处理。

---

## 6. 服务器状态模块

### 6.1 获取服务器列表
- `GET /api/servers`

### 6.2 获取单台服务器状态
- `GET /api/servers/{serverCode}/status`

**模块边界说明**

服务器状态模块只读取已汇总或最近快照，不应在用户请求时实时阻塞调用游戏服务器。

---

## 7. 后台管理模块

### 7.1 玩家搜索
- `GET /api/admin/users?keyword=xxx`

支持条件包括：
- UID
- 用户名
- SteamID64
- Minecraft UUID
- FiveM 标识

### 7.2 玩家详情
- `GET /api/admin/users/{userId}`

应返回：
- 主站账户信息
- 邀请信息
- 绑定游戏身份
- 钱包余额
- 金币流水
- 登录记录
- 封禁状态

### 7.3 邀请码管理
- `POST /api/admin/invitations/batch-create`
- `GET /api/admin/invitations`
- `GET /api/admin/invitations/{id}/usages`
- `POST /api/admin/invitations/{id}/disable`

### 7.4 封禁系统
- `POST /api/admin/bans`
- `POST /api/admin/bans/{id}/revoke`

### 7.5 解绑审核
- `POST /api/admin/unbind-requests/{id}/approve`
- `POST /api/admin/unbind-requests/{id}/reject`

---

## 8. 论坛同步模块

论坛同步模块建议通过内部服务封装，不直接暴露给前端。

职责包括：
- 主站用户首次登录论坛时自动创建论坛用户
- 用户资料同步
- 封禁状态同步
- 勋章/称号发放

论坛同步应以异步任务形式实现，避免阻塞主站核心请求。

---

## 9. 接口设计原则

### 9.1 插件接口必须签名认证
建议每个插件请求都带：
- `client_key`
- `timestamp`
- `nonce`
- `signature`

### 9.2 所有事件接口必须幂等
插件上报事件时必须提供事件唯一键。

### 9.3 兑换与钱包操作必须事务化
订单创建、扣金币、写流水，应在同一事务中完成。

### 9.4 发货与封禁应异步执行
不要在后台按钮动作中同步直接调用所有外部系统。

### 9.5 绑定接口必须严格校验过期与单次使用
所有绑定 token 与配对码统一执行 5 分钟过期策略，并确保使用后立即失效。


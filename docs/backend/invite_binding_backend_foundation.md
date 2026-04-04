# 邀请制账户与绑定后端基础

## 目标

在现有规划仓库基础上，先把**邀请制注册、邀请码校验、绑定会话、正式绑定**这一条主链路补成可继续开发的后端骨架。

本稿不依赖具体框架，但明确了：

- 核心领域模型
- 接口输入输出契约
- 状态流转
- 幂等与安全边界
- 推荐目录结构
- 一个最小可运行的内存版示例

这样后续无论接入 NestJS、Fastify、Express 还是其他 Node 服务框架，都能直接落地。

---

## 一、推荐目录结构

```text
apps/api/
  contracts/
    invite_binding.openapi.yaml
  schemas/
    invite_binding.prisma
  examples/
    invite_binding_service.js
```

职责说明：

- `contracts/`：接口契约与错误码约定
- `schemas/`：数据模型草稿，便于后续迁移到真实数据库
- `examples/`：最小可运行示例，验证流程与边界

---

## 二、业务主链路

### 1. 邀请制注册

1. 用户输入邀请码
2. 后端校验邀请码是否存在、未禁用、未过期、未超次数
3. 注册时创建 `users`
4. 同时写入 `invitation_code_usages`
5. 回写 `invitation_codes.used_count`
6. 初始化用户钱包或其他默认资料（后续可扩展）

### 2. 游戏内发起绑定

1. 插件调用 `POST /api/plugin/bindings/session`
2. 后端校验插件身份
3. 创建 `binding_sessions`
4. 返回 `sessionId + token + pairCode + bindUrl + expiresIn`

### 3. Web 端查询绑定会话

支持两种方式：

- token 直达
- pair code 手输

后端统一返回：

- 目标游戏
- 服务器
- 玩家展示名
- 当前会话是否可确认
- 剩余有效期

### 4. Web 端确认绑定

1. 用户已登录主站
2. 调用 `POST /api/bindings/confirm`
3. 后端再次校验会话是否存在、未过期、未使用
4. 查找或创建 `game_accounts`
5. 创建或更新 `user_game_bindings`
6. 将 `binding_sessions` 标记为 `confirmed`
7. 返回绑定结果

---

## 三、核心状态设计

### 1. 邀请码状态

建议枚举：

- `active`
- `disabled`
- `expired`
- `exhausted`

> `expired` 和 `exhausted` 也可以不落库存储，而由查询时动态推导；如果需要后台筛选和统计，建议允许持久化状态。

### 2. 绑定会话状态

建议枚举：

- `pending`：已创建，待用户确认
- `confirmed`：已完成绑定
- `expired`：已过期
- `cancelled`：人工或系统取消

### 3. 正式绑定状态

建议枚举：

- `active`
- `unbinding`
- `unbound`
- `blocked`

---

## 四、数据模型补充说明

### 1. users

补充建议：

- `source`：如 `invite_register`
- `register_ip`
- `register_user_agent`

### 2. invitation_codes

补充建议：

- `code` 建议统一大写存储
- 增加 `starts_at`（可选），便于预生成后分时启用

### 3. invitation_code_usages

建议建立唯一约束：

- `unique(user_id)`：一个用户只对应一次主邀请码使用记录

### 4. binding_sessions

建议增加：

- `bind_mode`：`register` / `bind_existing`
- `game_account_snapshot`：保留发起时玩家快照，避免展示信息被后续覆盖
- `confirmed_binding_id`
- `confirmed_game_account_id`

### 5. game_accounts

建议唯一约束：

- `(game_id, platform, normalized_game_user_id)`

### 6. user_game_bindings

建议唯一约束：

- `(user_id, game_account_id)`

业务约束建议：

- 对于同一游戏同一平台身份，只允许存在一个 `active` 主绑定
- 如果未来允许家庭号、角色号等复杂映射，再引入多重绑定策略

---

## 五、接口边界补充

### 1. 校验邀请码

**POST** `/api/invitations/validate`

请求：

```json
{
  "code": "ABCD1234"
}
```

成功响应：

```json
{
  "valid": true,
  "codeStatus": "active",
  "remainingUses": 3,
  "expiresAt": "2026-04-01T00:00:00Z"
}
```

失败响应示例：

```json
{
  "valid": false,
  "codeStatus": "expired",
  "message": "Invitation code expired"
}
```

### 2. 邀请制注册

**POST** `/api/auth/invite-register`

请求：

```json
{
  "username": "player_one",
  "email": "player@example.com",
  "password": "***",
  "inviteCode": "ABCD1234"
}
```

处理要求：

- 用户名/邮箱唯一校验
- 邀请码校验与消费必须放在同一事务
- 成功后返回用户基础信息，不返回敏感字段

### 3. 插件发起绑定会话

**POST** `/api/plugin/bindings/session`

请求：

```json
{
  "serverCode": "cn-mc-01",
  "gameCode": "minecraft",
  "platform": "java",
  "gameUserId": "uuid-123",
  "displayName": "Steve",
  "bindMode": "bind_existing"
}
```

成功响应：

```json
{
  "sessionId": "bs_xxx",
  "token": "token_xxx",
  "pairCode": "482913",
  "expiresIn": 300,
  "bindUrl": "https://example.com/bind/confirm?token=token_xxx"
}
```

### 4. 通过 token 查询绑定会话

**GET** `/api/bindings/session/by-token?token=...`

### 5. 通过 pair code 查询绑定会话

**POST** `/api/bindings/session/by-pair-code`

### 6. 确认绑定

**POST** `/api/bindings/confirm`

请求：

```json
{
  "sessionId": "bs_xxx"
}
```

处理要求：

- 必须要求登录态
- 会话必须未过期、未使用、状态为 `pending`
- 同一会话必须只能成功消费一次
- 创建或复用 `game_accounts`
- 创建或复用 `user_game_bindings`
- 记录 `used_by_user_id`、`used_at`

成功响应：

```json
{
  "bindingId": "ugb_xxx",
  "gameAccountId": "ga_xxx",
  "status": "active"
}
```

---

## 六、事务与幂等建议

### 1. 邀请注册事务

以下动作应在一个事务内完成：

- 校验邀请码仍可用
- 创建用户
- 写邀请码使用记录
- 回写邀请码已用次数
- 初始化钱包（如首版需要）

### 2. 确认绑定事务

以下动作应在一个事务内完成：

- 锁定绑定会话
- 查找或创建游戏身份
- 查找或创建正式绑定记录
- 回写绑定会话已使用信息

### 3. 幂等策略

建议：

- `binding_sessions.token` 唯一
- `binding_sessions.pair_code` 在有效窗口内唯一
- `game_accounts (game_id, platform, normalized_game_user_id)` 唯一
- `user_game_bindings (user_id, game_account_id)` 唯一

如果出现重复确认请求：

- 已成功的重复请求，可以返回同一绑定结果
- 已过期或已被他人消费，应返回明确业务错误码

---

## 七、安全边界

### 1. 邀请码

- 服务端统一 `trim + uppercase`
- 不要向前端暴露邀请码内部备注、owner 等敏感信息
- 对校验与注册接口加频率限制

### 2. 插件接口

- 必须签名鉴权
- 必须校验 `serverCode` 与插件身份一致
- 所有请求记录审计日志

### 3. 绑定确认

- 必须要求登录
- 必须校验会话过期时间
- 必须防止一个游戏身份绑定到多个不兼容主账号
- 建议对敏感确认动作写入审计日志

---

## 八、错误码建议

建议首批统一错误码：

- `INVITATION_CODE_NOT_FOUND`
- `INVITATION_CODE_DISABLED`
- `INVITATION_CODE_EXPIRED`
- `INVITATION_CODE_EXHAUSTED`
- `USERNAME_ALREADY_EXISTS`
- `EMAIL_ALREADY_EXISTS`
- `BINDING_SESSION_NOT_FOUND`
- `BINDING_SESSION_EXPIRED`
- `BINDING_SESSION_ALREADY_USED`
- `GAME_ACCOUNT_ALREADY_BOUND`
- `PLUGIN_AUTH_INVALID`
- `PLUGIN_SERVER_MISMATCH`

---

## 九、后续直接可接的实现顺序

1. 先把 `apps/api/schemas/invite_binding.prisma` 接入真实 Prisma 工程
2. 把 `apps/api/contracts/invite_binding.openapi.yaml` 作为接口契约底稿
3. 参考 `apps/api/examples/invite_binding_service.js` 迁移到正式 service 层
4. 增加数据库 migration
5. 增加单元测试与接口测试

---

## 十、验收对应说明

本次交付已经覆盖：

- 邀请码校验边界
- 邀请制注册核心模型
- 绑定会话模型
- 正式绑定模型
- 接口契约草稿
- 最小可运行的后端流程示例

后续如果要继续推进，我建议下一步直接起一个 Node 后端脚手架，把这套契约落成真实 API。
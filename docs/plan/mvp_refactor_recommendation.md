# GameMulti MVP 重构推荐方案

## 1. 结论

当前仓库适合按“单仓库 MVP 优先”的方式继续推进：

- 先保留 monorepo，不急于拆多仓库。
- 先把真实后端工程建立起来，再继续扩展前端和后台。
- 首期只打通邀请制账户、游戏绑定和论坛入口，不同时铺开金币、商城、多游戏和复杂运营后台。
- Discourse 作为独立论坛服务运行，主站只负责 SSO、账户映射和必要的状态同步。

推荐首期闭环：

```text
邀请码注册
-> 登录主站
-> 游戏内发起绑定
-> Web 确认绑定
-> 用户中心展示绑定结果
-> 从主站进入论坛
```

这条链路能验证项目最核心的价值：主站身份中心、游戏身份绑定、论坛社区入口。

## 2. 目标边界

### 2.1 首期必须做

- 主站邀请制注册与登录
- 邀请码生成、校验、使用记录
- 游戏、服务器、插件 client 基础模型
- 插件创建绑定 session
- Web 查询绑定 session
- Web 确认绑定
- 用户中心展示已绑定游戏身份
- Discourse 最小 SSO 入口
- 最小 Admin 能查询用户与邀请码
- 本地 compose 能拉起 `web + api + postgres + nginx`

### 2.2 首期暂不做

- 金币结算
- 商城兑换
- 多游戏扩展
- 高级风控
- 完整封禁联动
- 复杂后台活动系统
- 生产级监控告警
- systemd / HTTPS / 多环境发布流水线

这些能力保留设计，但不进入第一轮实现，避免首期范围失控。

## 3. 推荐仓库结构

```text
apps/
  web/        # Next.js 主站，包含注册、登录、绑定、用户中心
  admin/      # 短期保留静态 demo，后续可迁入 web/admin 或独立前端
  api/        # NestJS + Prisma 后端

infra/
  compose/    # 本地和验收 compose
  nginx/      # 反向代理配置
  deploy/     # 一键启动脚本

plugin-poc/
  minecraft-js/ # 协议验证和 PoC 脚本

docs/
  plan/
  backend/
  integration/
```

短期内不建议拆多仓库。等首个游戏绑定、论坛 SSO、金币账本都稳定后，再考虑将插件 SDK 或游戏插件拆出。

## 4. 技术选型

### 4.1 前端

- Next.js
- TypeScript
- Tailwind CSS
- 首期主站和轻量 Admin 可以共用同一个 Next.js 应用

### 4.2 后端

- NestJS
- Prisma
- PostgreSQL
- OpenAPI 作为接口契约输出

不建议继续把业务逻辑堆在 `examples/` 里。现有内存版 service 应迁移为真实 module、service、repository 和 controller。

### 4.3 基础设施

- PostgreSQL：首期强依赖
- Redis：首期可选，第二阶段做队列、限流、幂等缓存时再强依赖
- Docker Compose：本地开发和验收环境
- Nginx：统一 HTTP 入口

### 4.4 论坛

- Discourse 独立部署
- 主站后端实现 Discourse adapter
- 首期只做 SSO 入口和账户映射
- 资料同步、封禁同步、勋章同步放到下一阶段

## 5. 后端模块拆分

### 5.1 `AuthModule`

职责：

- 注册
- 登录
- 登出
- 当前用户 `GET /api/me`
- 密码哈希与认证 session / token

### 5.2 `InviteModule`

职责：

- 邀请码生成
- 邀请码校验
- 邀请码使用记录
- 邀请关系追踪

### 5.3 `GameModule`

职责：

- 游戏目录
- 游戏服务器
- 插件 client
- 插件 client 状态

### 5.4 `BindingModule`

职责：

- 插件创建绑定 session
- token 查询绑定 session
- pair code 查询绑定 session
- Web 确认绑定
- 用户游戏身份查询

### 5.5 `ForumModule`

职责：

- forum account 映射
- SSO ticket
- Discourse consume URL
- 最小 adapter

### 5.6 `AdminModule`

职责：

- 用户搜索
- 用户详情
- 邀请码管理
- 查看绑定状态

首期 Admin 只做读多写少的运营最小闭环，不承载复杂封禁和金币操作。

## 6. 第一批数据库表

首期推荐只落这些表：

```text
users
user_auth_accounts
invitation_codes
invitation_code_usages
games
game_servers
server_plugin_clients
game_accounts
binding_sessions
user_game_bindings
forum_accounts
forum_sso_tickets
audit_logs
```

金币、商城、封禁相关表暂不进入第一批 migration。原因是这些模块依赖绑定和用户体系稳定，否则会把 schema 复杂度提前放大。

## 7. 插件接口要求

插件接口不能继续只传 `pluginClientKey`。首期就应实现 HMAC 签名：

```text
client_key
timestamp
nonce
signature
```

签名建议覆盖：

- HTTP method
- path
- timestamp
- nonce
- request body hash

后端必须校验：

- client 是否存在且 active
- timestamp 是否在允许窗口内
- nonce 是否重复
- signature 是否匹配
- client 是否属于对应 server

事件上报接口后续必须要求 `eventUniqueKey`，并以 `plugin_client_id + event_unique_key` 做幂等。

## 8. API 首期范围

### 8.1 Auth

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
```

### 8.2 Invite

```text
POST /api/invitations/validate
GET  /api/admin/invitations
POST /api/admin/invitations/batch-create
GET  /api/admin/invitations/{id}/usages
```

### 8.3 Plugin Binding

```text
POST /api/plugin/bindings/session
```

### 8.4 Web Binding

```text
GET  /api/bindings/session/by-token
POST /api/bindings/session/by-pair-code
POST /api/bindings/confirm
GET  /api/me/game-bindings
```

### 8.5 Forum

```text
POST /api/forum/sso/entry
GET  /api/admin/forum/accounts
```

首期论坛 API 只需要能从主站登录态创建或查找 forum account，并返回论坛入口 URL。

## 9. 前端首期页面

推荐优先实现：

```text
/
/register
/login
/bind/confirm
/bind/pair-code
/account
/account/bindings
/admin/users
/admin/invitations
```

首页应从当前营销页调整为真实社区入口，减少夸张指标和外链素材，重点呈现：

- 邀请制社区
- 游戏身份绑定
- 论坛入口
- 当前支持的首个 PoC 游戏

## 10. 部署调整

`infra/compose/docker-compose.yml` 应从当前 `web + nginx` 调整为：

```text
web
api
postgres
nginx
```

Redis 暂时保留 profile：

```text
redis  # profile: queue
```

环境变量需要统一命名：

- `APP_URL`
- `API_URL`
- `DATABASE_URL`
- `FORUM_ORIGIN`
- `FORUM_ENTRY_PATH`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_FORUM_ORIGIN`
- `NEXT_PUBLIC_FORUM_ENTRY_PATH`

避免同时出现 `FORUM_BASE_URL` 和 `NEXT_PUBLIC_FORUM_ORIGIN` 表示同一概念。

## 11. 实施顺序

### Step 1：工程基线

- 根目录增加 workspace 配置
- 统一 Node 版本
- 统一 lint / test / build 脚本
- 明确本地启动命令

### Step 2：后端脚手架

- 创建 `apps/api` NestJS 工程
- 接 Prisma
- 接 PostgreSQL
- 建第一批 migration
- 加健康检查接口

### Step 3：邀请注册

- 实现邀请码表
- 实现用户注册
- 实现登录
- 实现 `GET /api/me`
- Admin 可查看邀请码使用记录

### Step 4：绑定闭环

- 实现插件签名认证
- 实现创建 binding session
- 实现 token / pair code 查询
- 实现确认绑定
- 用户中心展示绑定结果

### Step 5：论坛最小接入

- 实现 forum account 映射
- 实现 SSO ticket
- 实现 Discourse adapter 的真实 HTTP 访问
- 主站登录用户可进入论坛

### Step 6：compose 验收

- compose 拉起 `web + api + postgres + nginx`
- 初始化 seed 数据
- 用 PoC 插件脚本创建绑定 session
- Web 完成确认绑定
- 用户中心显示绑定结果

## 12. 验收标准

首期完成必须满足：

1. 新用户能用邀请码注册。
2. 用户能登录主站。
3. 插件请求带签名后能创建 5 分钟绑定 session。
4. 用户能通过 token 或 pair code 查到绑定 session。
5. 用户确认后生成正式 `user_game_bindings`。
6. 同一 token / pair code 只能使用一次。
7. 过期 session 不能确认。
8. 用户中心能看到绑定的游戏身份。
9. 主站能生成论坛入口 URL。
10. Admin 能查用户和邀请码使用记录。
11. 本地 compose 能一键启动并通过健康检查。

## 13. 风险与处理

### 13.1 范围失控

风险：金币、商城、封禁、多游戏提前进入首期。

处理：首期只允许做身份、绑定、论坛入口。其他能力只保留 schema 草案和接口草案。

### 13.2 论坛真实联调低估

风险：Discourse SSO、用户创建、邮箱冲突、用户名冲突会比 stub 复杂。

处理：论坛 adapter 尽早接真实测试环境，不等后期集中联调。

### 13.3 插件安全后补成本高

风险：先用 `pluginClientKey` 跑通，后续补签名会改接口和插件。

处理：首期直接做 HMAC 签名，即使 PoC 脚本也按正式协议走。

### 13.4 数据模型过早膨胀

风险：一次性落金币、商城、封禁全部表，后续字段调整成本高。

处理：第一批 migration 只覆盖首期闭环。

## 14. 后续阶段

首期稳定后再进入：

### Phase 2：金币与事件

- `game_player_events`
- `game_play_sessions`
- `reward_rules`
- `coin_reward_settlements`
- `wallets`
- `wallet_transactions`

### Phase 3：商城与发货

- `redeem_items`
- `redeem_orders`
- `reward_delivery_jobs`
- 插件命令拉取与回执

### Phase 4：后台与封禁

- 玩家聚合详情
- 封禁记录
- 游戏服封禁命令
- 论坛封禁同步
- 审计日志扩展

### Phase 5：多游戏扩展

- 插件 SDK
- 第二个游戏插件
- 多游戏规则配置
- 运营活动能力

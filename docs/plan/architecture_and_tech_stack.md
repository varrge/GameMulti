# 系统架构与技术选型

## 1. 技术选型结论

### 前端
- Next.js
- TypeScript
- Tailwind CSS
- 可选组件体系：shadcn/ui 或 Radix UI

### 后端
- NestJS
- TypeScript
- Prisma（优先推荐）

### 基础设施
- PostgreSQL：主数据库
- Redis：缓存、队列、限流、状态缓存
- Docker / Docker Compose：开发与测试环境编排

### 论坛
- Discourse（首选）

### 游戏接入
- 自定义插件为主
- RCON 作为兼容辅助手段，不作为核心主链路依赖

---

## 2. 论坛选型说明

### 推荐：Discourse

推荐原因：

1. SSO 与身份集成成熟
2. API 能力完整，适合做论坛状态同步、用户封禁同步、勋章发放
3. 用户体系、权限体系、信任等级、社区治理机制成熟
4. 更适合承担长期社区运营子系统角色

### 不优先选择 Flarum 的原因

虽然 Flarum 更轻量、界面更年轻化，但在深度业务联动、长期运营能力、复杂同步与治理方面，整体成熟度不如 Discourse。

### 不优先选择 NodeBB 的原因

NodeBB 更强调实时性，但本项目的核心难点并不在实时聊天，而在身份打通、运营后台、封禁联动、奖励体系与长期维护稳定性。

---

## 3. 总体架构

系统推荐采用以下结构：

### 3.1 主站业务平台
负责：

- 官网与用户界面
- 邀请制注册
- 用户中心
- 游戏绑定
- 金币系统
- 商城兑换
- 后台管理
- 统一身份中心

### 3.2 论坛系统
Discourse 独立部署，通过主站完成 SSO 打通，并进行必要的用户状态同步、封禁同步与勋章/称号同步。

### 3.3 游戏接入层
每个游戏服务器安装自定义插件，统一通过主站后端暴露的插件接口完成：

- 绑定会话创建
- 玩家行为事件上报
- 服务器状态上报
- 奖励命令拉取
- 封禁命令拉取

### 3.4 异步任务与风控层
通过 Redis 队列或任务机制完成：

- 金币结算
- 商城发货
- 论坛同步
- 封禁同步
- 异常重试
- 审计与补偿

---

## 4. 核心架构原则

### 4.1 主站身份与游戏身份分离

- 主站用户：`users`
- 登录来源：`user_auth_accounts`
- 游戏身份：`game_accounts`
- 主站与游戏身份正式关系：`user_game_bindings`

这样可避免把“登录方式”和“游戏身份”混为一谈。

### 4.2 绑定会话与正式绑定分离

- 临时过程：`binding_sessions`
- 最终结果：`user_game_bindings`

不能在用户一发绑定命令时就直接建立正式绑定关系，必须经过 Web 端确认。

### 4.3 事实、规则、结算、记账分层

推荐拆分为：

- 事实层：`game_player_events`、`game_play_sessions`
- 规则层：`reward_rules`
- 结算层：`coin_reward_settlements`
- 账本层：`wallet_transactions`

这样可读性高、可审计、易防刷。

### 4.4 钱包系统采用账本模型

不只保存余额，还必须保存流水、结算来源、幂等键与引用业务对象。

这对于防止重复结算、防止刷金币、支持后台审计与用户申诉至关重要。

### 4.5 插件接口必须签名认证

插件接口建议使用：

- client_key
- timestamp
- nonce
- signature

以防止伪造请求、篡改上报、批量刷接口。

---

## 5. 推荐仓库结构

建议 GitHub / GitLab 组织结构包含以下仓库：

- `apps/web`：主站前端
- `community-api`：主站后端
- `community-forum-infra`：论坛部署与对接脚本
- `community-game-sdk`：插件协议与公共定义
- `community-plugin-minecraft`
- `community-plugin-rust`
- `community-plugin-cs2`
- `community-plugin-ark`
- `community-plugin-fivem`
- `community-devops`：部署与环境管理
- `community-docs`：产品与技术文档

若团队较小，也可先合并为较少仓库，后期再拆分。

---

## 6. 分支管理建议

建议采用：

- `main`：稳定生产分支
- `develop`：日常集成分支
- `feature/*`：功能分支
- `fix/*`：缺陷修复分支
- `hotfix/*`：线上紧急修复分支

所有功能通过 Pull Request / Merge Request 合并。


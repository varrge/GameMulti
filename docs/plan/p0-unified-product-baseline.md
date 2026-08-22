# P0 统一产品基线

> 状态：冻结基线
>
> 适用范围：GameMulti 商业 MVP 的产品壳、Discourse 社区、GameMulti Bridge、运营后台及其跨系统链路。
>
> 本文是 P0 的执行合同。后续页面、API、插件和部署文档不得引入与本文冲突的身份、导航、深链或职责定义。本文只定义基线，不修改业务代码。

## 1. P0 决策

GameMulti 是跨游戏与社区的统一产品品牌，用户感知为一个产品；运行时仍保留两个独立系统：

```text
GameMulti（统一产品品牌）
  app.example.com       -> Bridge 产品壳、绑定、账户映射、游戏入口、后台入口
  community.example.com -> Discourse 社区内容与社区治理
```

- **GameMulti 产品壳**：统一品牌、导航、账户摘要、游戏/服务器上下文、绑定入口、社区深链和返回路径。
- **Discourse**：社区身份登录/注册、主题与回复、用户社区资料、通知、分类、版主和社区治理。
- **Bridge**：游戏连接、插件 API、绑定会话、游戏账号映射、服务器/插件状态、跨系统 SSO 编排、深链上下文和游戏相关权限。
- **后台**：只保留一套真实运营入口。Bridge Admin 处理游戏连接和技术运营；Discourse Admin 处理社区内容和社区治理。

P0 不把 Discourse 嵌入 Bridge，也不让两个系统共享数据库。统一体验由品牌、SSO、导航、深链协议和状态文案保证。

## 2. 组件边界冻结

| 组件 | 负责 | 不负责 | 权威数据 |
| --- | --- | --- | --- |
| GameMulti 产品壳 | 产品入口、跨系统导航、账户/绑定摘要、上下文和回程 | 论坛正文、论坛发帖/回复、完整社区通知 | 导航配置、展示用跨系统状态组合 |
| Discourse | 注册、登录、用户社区资料、主题/回复、分类、通知、举报、版主和社区用户治理 | 游戏账号绑定、插件凭证、服务器状态、游戏权限、游戏命令 | Discourse 用户、社区内容、社区治理状态 |
| Bridge | SSO 编排、游戏账号映射、绑定确认、插件认证、nonce/会话、服务器与插件状态、审计、游戏权限 | 论坛数据库访问、论坛正文复制、论坛治理替代品 | Bridge 用户映射、游戏账号、绑定、绑定会话、插件/服务器和审计 |
| Bridge Admin | 服务器、插件客户端、安装凭证、绑定异常、集成健康、技术审计 | 删除帖子、改版面、处理举报、社区封禁策略 | 游戏连接与集成运维状态 |
| Discourse Admin | 分类/主题治理、用户举报、版主、社区用户限制、站点设置和社区内容 | 签发插件密钥、确认游戏绑定、改变服务器权限 | 社区内容和治理状态 |
| 插件 | 按契约请求绑定会话、显示链接/配对码、上报事件/心跳、查询结果 | 构造论坛登录 URL、访问 Discourse、决定用户归属 | 游戏服侧运行状态 |
| PostgreSQL | 持久化 Bridge 领域数据 | 存论坛正文或作为 Discourse 数据库 | Bridge 数据库 |

`apps/api` 在运行时仍是模块化单体；`bridges/forum` 是契约、适配器和集成说明边界，不是新进程。`apps/admin` 静态 demo 不进入生产后台清单。

## 3. 统一身份与账号映射

### 3.1 身份归属

1. Discourse 用户是新用户的注册和登录入口；新用户不再创建独立的本地 Bridge 账号。
2. Bridge 会话的主体是稳定的 `discourseUserId`，而不是可变用户名或邮箱。
3. Bridge 可保留本地 `User` 影子记录和旧 Auth 路由，仅用于存量兼容、迁移和审计；它不是新用户的第二套身份。
4. 游戏账号不是用户，而是用户下的一个或多个 `GameAccount`/`UserGameBinding` 映射。
5. Discourse 登录态不自动授予游戏管理权限。每个游戏动作仍按用户、游戏账号、服务器和操作类型在 Bridge 服务端授权。

### 3.2 映射规则

```text
Discourse user
  discourseUserId (稳定唯一主键)
       |
       +-- ForumAccount / 外部身份映射
       |
       +-- GameAccount(s)
              |
              +-- UserGameBinding(s) -> gameCode + serverCode + gameUserId
```

- `discourseUserId` 是新绑定的唯一归属键；`userId` 仅为兼容字段，迁移完成后不得作为新确认的唯一依据。
- `gameUserId` 的唯一性必须限定在 `gameCode + serverCode`（具体规则由首个游戏适配器声明），不能只用显示名。
- 同一游戏账号不可同时归属两个 Bridge 用户；冲突必须进入明确的人工处理/解绑流程，不能静默覆盖。
- 用户名、邮箱和显示名仅用于展示或首次匹配，不作为长期外键；变更不得产生新映射。
- 绑定、解绑、重新绑定都写入审计；绑定会话和 SSO state 短期、单用途、不可预测并防重放。

### 3.3 统一绑定状态

跨 GameMulti、插件提示和社区入口使用以下业务状态，不以“登录成功”代替“绑定成功”：

| 状态 | 含义 | 用户动作 |
| --- | --- | --- |
| `pending` | 会话已创建，尚未完成登录/确认 | 继续登录并确认 |
| `bound` | Bridge 已事务化建立映射 | 进入游戏或社区 |
| `expired` | token/pair code 超时 | 从游戏重新生成 |
| `cancelled` | 用户取消或操作被撤销 | 返回来源 |
| `conflict` | 目标游戏账号已有其他归属或数据冲突 | 联系运营/走解绑流程 |
| `revoked` | 已解绑或管理员撤销 | 重新绑定或查看原因 |
| `denied` | 身份、服务器或操作权限不足 | 查看授权要求 |
| `unavailable` | Discourse、Bridge 或游戏连接暂不可用 | 稍后重试，保留返回上下文 |

状态转换必须由 Bridge 服务端产生，插件和 Discourse 只展示其结果或通过受控接口读取摘要。

## 4. 双向用户旅程

### 4.1 游戏进入社区或绑定

1. 玩家在游戏执行社区、绑定或帮助命令。
2. 插件调用 `POST /api/plugin/bindings/session`，提交 `gameCode`、`serverCode`、`gameUserId`、显示名和目标动作；Bridge 校验插件凭证、HMAC、时间戳、nonce 和服务器归属。
3. Bridge 返回短期 `sessionId`、`pairCode`、`expiresIn` 和玩家可访问的 `publicBindUrl`。插件只展示 Bridge 生成的 URL，不构造论坛 URL。
4. 玩家打开 `/bind/confirm?token=...`，GameMulti 壳展示服务器、游戏、目标动作、有效期和返回方式。
5. 未登录时，Bridge 发起 DiscourseConnect；登录/注册完成后回到 Bridge callback，再回到原始绑定 URL，所有上下文由受签名 state 恢复。
6. Bridge 展示当前 Discourse 身份和待绑定游戏账号；玩家确认后以 `discourseUserId` 建立绑定事务。
7. 完成页同时提供“进入该服务器社区”和“返回游戏”路径；插件通过查询/事件确认最终状态。

### 4.2 社区回到游戏

1. 用户从 Discourse 的服务器介绍、规则、公告、个人资料入口或通知点击 GameMulti 链接。
2. 链接包含签名的或服务端生成的目标，例如 `serverCode`、`gameCode`、`target` 和 `returnTo`；不得携带密码、长期密钥或可直接代表用户的敏感 token。
3. Bridge 使用当前 SSO 身份重新读取绑定和服务器权限。无绑定时显示绑定入口；无权限时显示申请/联系运营路径；不返回空白页。
4. 对支持的动作，Bridge 生成一次性回游戏链接、配对码或插件可轮询的结果；不支持自动拉回时显示服务器名称、命令和状态。
5. Bridge 完成状态后，用户可返回原社区页面或继续游戏；页面必须保留 `returnTo`，且只允许白名单域名和站内路径。

## 5. 导航、深链与返回路径基线

### 5.1 统一导航

GameMulti 壳和 Discourse 顶部入口使用同一组产品命名和目标：

- `社区`：进入 Discourse，默认落点为社区首页或当前服务器分类。
- `我的账户`：进入 Discourse 账户入口，并提供 GameMulti 绑定摘要/返回入口。
- `游戏与服务器`：进入 Bridge 的服务器/游戏上下文页。
- `绑定游戏账号`：进入 Bridge 绑定入口；没有游戏上下文时提示从游戏生成链接或输入配对码。
- `返回游戏`：优先使用当前插件/服务器上下文提供的回程方式，否则显示可执行命令和状态。
- `管理`：按权限分别进入 Bridge Admin 或 Discourse Admin，禁止用一个入口伪装成另一个后台。

### 5.2 深链上下文

Bridge 生成的上下文至少包含以下逻辑字段（可编码在短期 token 中，不要求全部出现在 URL 明文）：

| 字段 | 要求 |
| --- | --- |
| `contextId` | 服务端可追踪的上下文 ID |
| `target` | `bind_confirm`、`server`、`community`、`return_game` 等有限枚举 |
| `gameCode` / `serverCode` | 目标游戏和服务器；无目标时明确为空 |
| `bindingSessionId` | 绑定流程才有，关联短期 session |
| `returnTo` | 完成后的允许落点，必须经过 host/path 白名单校验 |
| `issuedAt` / `expiresAt` | 短期有效期 |
| `nonce` / `state` | 单次消费和 SSO 防重放 |
| `source` | `plugin`、`bridge`、`discourse` 等有限来源枚举 |

URL 只承载短期引用或签名 state；服务端重新查询权限和实体。任何未知 target、过期 context、跨用户使用或不在白名单的 returnTo 都拒绝并显示可恢复错误。

### 5.3 返回规则

- 返回优先级：插件可用的回游戏动作 > 原始 Bridge 页面 > 原始 Discourse 页面 > 产品默认入口。
- SSO 取消、绑定失败、会话过期和服务不可用都必须返回原上下文的错误页，并提供重新开始和返回来源操作。
- 成功页不得只显示“完成”而丢失服务器/游戏名称、当前状态和下一步。
- 不允许开放重定向；Discourse 与 Bridge 的跳转目标使用配置白名单和站内相对路径。

## 6. MVP 社区入口范围

### 必须保留

- DiscourseConnect 真实登录、注册、退出、回调失败和取消恢复。
- GameMulti 品牌入口及跨系统导航。
- 从游戏进入绑定、帮助和服务器社区的 `publicBindUrl`/深链。
- 从社区回到 Bridge 账户、服务器、绑定和返回游戏上下文的入口。
- 账户页的 Discourse 身份、游戏账号映射、绑定状态、最近结果和安全提示。
- 每个 MVP 服务器的介绍、规则/帮助、公告或讨论落点，内容全部使用 Discourse 原生能力。
- 最小未读/通知入口：只链接到 Discourse 原生通知或需要处理的绑定结果，不在 Bridge 重建通知中心。
- `pending`、`bound`、`expired`、`conflict`、`revoked`、`denied`、`unavailable` 的一致文案和可恢复路径。
- Discourse 举报/版主治理，以及 Bridge 凭证撤销和集成故障处理。

### 可以延后

- Bridge 内的论坛首页、帖子详情、发帖、评论、搜索、私信和完整通知聚合。
- 奖励、钱包、商城、实时聊天、复杂活动、内容镜像、多游戏统一档案。
- 自动封禁/解封联动、游戏内命令下发、异步奖励和完整安装器产品化。
- Redis、worker、队列化论坛同步，除非实际吞吐和可靠性指标证明需要。

延后能力不得在 MVP 中创建第二套入口或假状态；需要时直接链接 Discourse 原生能力或明确标记“未启用”。

## 7. Admin 职责矩阵

| 操作 | Bridge Admin | Discourse Admin | 规则 |
| --- | --- | --- | --- |
| 创建/撤销插件客户端凭证 | 负责 | 无权限 | 凭证只在 Bridge 生成、撤销和审计 |
| 查看服务器/插件健康 | 负责 | 无权限 | 来源为 Bridge 心跳和事件 |
| 查看/处理绑定冲突、解绑申请 | 负责 | 无权限 | 不得由社区管理员直接改绑定归属 |
| 查看游戏账号映射 | 负责 | 只读摘要（可选） | Bridge 是唯一权威 |
| 编辑分类、规则、公告、主题 | 无权限 | 负责 | 内容只在 Discourse 编辑 |
| 举报、版主操作、社区用户限制 | 无权限 | 负责 | 社区治理只在 Discourse 执行 |
| Discourse 用户资料/社区状态 | 无权限 | 负责 | Bridge 只保存必要外部 ID 和展示快照 |
| SSO 配置与回调健康检查 | 负责集成配置 | 负责 Discourse provider 设置 | 双方变更必须有联调和审计 |
| 查看跨系统故障链路 | 负责 Bridge 侧审计 | 负责 Discourse 侧日志/审核记录 | 通过 trace/context ID 关联，不共享数据库 |

同一动作只设置一个写入权威。Bridge Admin 不删除论坛内容，Discourse Admin 不签发游戏凭证、不确认游戏绑定、不直接改变服务器权限。

## 8. 实施闸门与验收

P0 冻结完成的判定条件：

1. 产品和技术边界表已被 API、Web、插件和部署文档引用，未出现第二套产品归属。
2. 新用户只能通过 Discourse 身份进入；遗留本地 Auth 有迁移截止、存量兼容和冲突处理说明。
3. 游戏 -> Bridge -> Discourse -> Bridge -> 绑定确认 -> 游戏，以及 Discourse -> Bridge -> 游戏 两条旅程均能保留上下文和返回路径。
4. `publicBindUrl` 由 Bridge 生成，绑定 token、SSO state、nonce 均具备过期、单次消费和重放保护。
5. 绑定所有权以 `discourseUserId` 为准，同一游戏账号冲突不会静默覆盖。
6. 必须入口均可到达，延后能力没有伪装成已实现的 Bridge 功能。
7. Bridge Admin 与 Discourse Admin 的写入边界可由权限和审计记录验证。
8. Discourse 不可用时 Bridge 显示可理解的 `unavailable` 状态；Bridge 不可用时 Discourse 不依赖 Bridge 数据库才能运行社区基础能力。

任何改变以下内容的需求都必须重新评审 P0：身份权威、`discourseUserId` 归属、状态枚举、深链字段/有效期、返回白名单、后台写入权威、Discourse 数据库访问方式。

## 9. 关联文档

- `docs/plan/commercial-mvp-architecture-review.md`
- `docs/plan/discourse_bridge_refactor_plan.md`
- `docs/plan/forum_integration_next_step_plan.md`
- `docs/backend/plugin_binding_link_contract.md`
- `docs/backend/forum_sso_foundation.md`
- `docs/deployment/discourse_production_runbook.md`

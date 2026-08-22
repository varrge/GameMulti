# 商业化最小可行架构审查报告

> 审查范围：当前仓库的代码结构、依赖关系、部署配置和主要文档。目标是把首个可商业交付版本收缩到可运营、可验证、可迭代的最小架构。本报告只给决策建议，不修改业务代码。

## 1. 执行结论

商业 MVP 不应被定义为“论坛 + 一个游戏绑定工具”，而应定义为一个让玩家在游戏与社区之间自然往返的产品：

> **GameMulti 是统一产品壳；Discourse 是社区能力底座；Bridge 是游戏连接、身份编排、上下文和产品导航的业务中枢。**

建议保留两个产品系统和一个共享数据库基础设施：

```text
Discourse（外部/独立社区系统）
  注册、登录、论坛内容、通知、普通社区治理

GameMulti Bridge（本仓库的唯一业务运行单元）
  产品入口与导航、游戏上下文、SSO 编排
  插件 API、绑定会话、游戏账号映射、插件事件/心跳
  绑定结果、社区深链、最小运营接口

PostgreSQL（Bridge 的唯一业务数据库）
```

这里的“两个系统”是两个产品运行系统，PostgreSQL 是共享的基础设施角色，不是第三个产品。主站、后台、API、Bridge 不应在商业 MVP 中作为四个部署服务存在：

- `apps/api` 保留为唯一业务后端进程，在产品命名和边界上收缩为 Bridge 模块化单体。
- `apps/web` 保留为统一产品壳的过渡实现，承载绑定、账户映射、游戏上下文和必要导航；它不再发展为第二套身份系统或独立论坛产品。
- `apps/admin` 不应作为独立应用部署。真实运营能力只保留一套，优先使用 API 已存在的 admin endpoints + `apps/web` `/admin`；社区内容和用户治理交给 Discourse Admin。
- `bridges/forum` 作为契约、适配器和集成说明边界，不拆成新进程；实际实现继续位于 `apps/api` 的相关模块。
- `services/forum` 与 `infra/forum` 保留为 Discourse 的运行/部署资产，论坛独立升级、备份和运维。

一句话决策：**先交付“玩家从游戏进入 GameMulti 社区、完成统一身份与绑定、再从社区回到具体游戏上下文”的闭环；延后奖励、商城、封禁联动、多游戏和队列化能力。** 部署收敛为 `bridge + postgres + 一个反代`，Discourse 作为独立但必须纳入验收的社区底座。

## 2. 社区-游戏一体化产品原则

### 2.1 一个身份，一个产品归属

- 玩家只应感知一个 GameMulti 账户身份；Discourse 是身份注册、登录和社区资料的权威入口，Bridge 保存必要的外部身份映射。
- 游戏账号不是第二个用户，而是同一用户下的一个或多个可审计映射。绑定、解绑、重新授权和冲突处理必须明确显示归属。
- 任何入口都不能要求玩家重复注册、重复输入密码或理解“论坛账号”和“游戏账号”是两套产品身份。
- 本地 Auth 仅作为迁移兼容路径，不接受新用户长期并行注册；必须定义关闭条件和存量账号迁移策略。

### 2.2 游戏上下文优先于泛化门户

从游戏发起的链接必须携带短期、最小化的上下文，例如服务器、绑定会话、目标动作和过期时间。Bridge 负责将其转成玩家可理解的页面状态，并在完成后返回原游戏场景或明确的继续游戏动作。社区链接也应能回到具体服务器、游戏、绑定状态或活动，而不是只回到一个无上下文首页。

上下文不是权限本身：权限仍由 Bridge 服务端根据用户、会话、服务器和映射关系重新验证。URL 中不得放置长期密钥、密码或可直接代表用户的敏感凭证。

### 2.3 社区内容与游戏功能分工清晰

Discourse 负责内容、讨论、通知、用户社区资料和社区治理；Bridge 负责游戏连接、绑定关系、服务器/插件状态、游戏侧 API、跨系统导航和游戏相关权限。Bridge 不复制论坛发帖、评论、搜索、通知中心等能力，只提供带品牌和上下文的入口、深链和必要状态摘要。

### 2.4 统一体验不等于统一进程

两个系统可以独立部署、独立升级和独立备份，但必须统一：品牌名称和视觉基线、登录跳转、导航信息架构、返回路径、错误语言、账户状态和关键实体命名。产品一致性由 Bridge 的壳、SSO 契约、深链协议和验收标准保证，而不是通过共享数据库或把 Discourse 嵌入 Bridge 实现。

## 3. 关键用户旅程

### 3.1 玩家从游戏进入社区

1. 玩家在服务器内执行“社区/绑定/帮助”命令。
2. 插件向 Bridge 请求一次性短期链接或 pair code，带上服务器和目标动作上下文；Bridge 通过 HMAC、时间戳、nonce 和服务器凭证验证来源。
3. 玩家打开 `publicBindUrl` 或社区深链，看到 GameMulti 的统一产品壳、当前服务器名称、目标动作和有效期，而不是一个无法解释的裸论坛页面。
4. 未登录时，Bridge 将玩家带到 Discourse SSO；登录/注册完成后回到原始 Bridge 上下文，不能丢失服务器、动作或返回路径。
5. Bridge 展示当前账户、已有游戏账号映射、待确认操作和社区入口。玩家确认后，绑定关系写入 Bridge。
6. 完成页同时提供明确的“返回游戏”提示/深链（在插件支持时）和“进入该服务器社区/讨论”的入口；绑定结果可在游戏命令和社区账户页面查看。

### 3.2 玩家从社区回到游戏

1. 玩家从 Discourse 的个人资料、主题、服务器介绍或通知中点击 GameMulti 入口。
2. 链接回到 Bridge 时带有经过签名或服务端生成的目标上下文，例如服务器详情、绑定状态或安装/加入指引。
3. Bridge 读取当前 SSO 身份与自己的映射，展示该玩家可操作的服务器和游戏账号；没有权限时展示可执行的绑定/申请路径，而不是空白或越权页面。
4. 对支持的动作，Bridge 生成一次性回游戏链接、pair code 或插件可轮询的完成状态；不支持自动跳转时提供清晰的服务器名称、命令和状态。
5. 用户回到游戏后，插件通过状态查询或事件确认结果；Bridge 和社区侧不显示相互矛盾的绑定状态。

### 3.3 服主/运营旅程

服主通过统一入口获取安装凭证、查看服务器和插件健康状态、进入该服务器的社区页面，并可将社区深链放入游戏欢迎信息。运营人员在 Bridge 后台处理服务器、凭证、绑定和集成故障，在 Discourse Admin 处理内容、用户治理和版面配置；两者不要求在两个后台重复执行同一项操作。

## 4. 代码现状与依据

### 4.1 后端已经是模块化单体，不是多服务系统

`apps/api/src/app.module.ts:15-28` 一次性装配了 `PrismaModule`、认证基础设施、插件认证、Auth、Invite、Game、Binding、Bridge、Forum、Admin 共 11 个模块。其依赖共享同一个进程和 Prisma 数据库；当前拆目录不会带来运行时隔离，反而增加部署边界和文档成本。

主要已实现闭环集中在：

- `apps/api/src/modules/auth`：本地注册、登录、当前用户。
- `apps/api/src/modules/invite`：邀请码。
- `apps/api/src/modules/binding`：插件创建 session、网页查询/确认、游戏账号列表。
- `apps/api/src/modules/game`：插件事件与服务器心跳。
- `apps/api/src/modules/bridge` 和 `security/discourse-sso`：Discourse SSO 回调与 Bridge 页面。
- `apps/api/src/modules/forum`：论坛入口/映射适配。
- `apps/api/src/modules/admin`：服务器、插件客户端、事件、论坛摘要、部署操作。

因此首期应维持“模块化单体 + 明确 API 分区”，而不是拆成 `api-service`、`bridge-service`、`forum-service`、`admin-service`。

### 4.2 Web 与 Admin 存在重复产品壳

`apps/web/src/app` 已有首页、账户、绑定、论坛和 `/admin` 页面；`apps/web/src/components/admin-shell.tsx` 已请求管理员服务器、插件事件和论坛摘要。与此同时 `apps/admin/index.html` 是静态假数据 demo，README 明确写着“不会真的请求后端，也不会持久化数据”（`apps/admin/README.md:78-84`）。

建议立即将 `apps/admin` 决策为原型资产，不进入生产部署清单；保留其字段/交互作为验收参考，迁移后删除或归档。后台真实入口只保留一套。Bridge 产品壳和后台不应重做 Discourse 的内容管理，社区内容和用户治理交给 Discourse Admin。

### 4.3 Forum Bridge 的物理边界尚未与目录边界一致

`bridges/forum/README.md` 只有“后续逐步归位”的说明；实际 SSO 控制器位于 `apps/api/src/modules/bridge/bridge-auth.controller.ts`，论坛适配/状态也由 API 模块直接使用。该目录更适合作为契约、适配器和部署说明的归档位置，而不是新进程。

现有目标文档（`docs/plan/discourse_bridge_refactor_plan.md:5-46`）已经给出更小的目标边界：Discourse 负责注册、登录、论坛和用户管理，Bridge 负责插件、绑定、映射、事件、心跳。需要补充的是：Bridge 还负责统一产品入口、上下文和回程体验，这是“两个系统仍像一个产品”的关键责任。

## 5. MVP 社区能力

### 5.1 必须进入 MVP

- DiscourseConnect/SSO 的真实登录、注册回跳、退出和错误恢复。
- GameMulti 品牌下的统一导航：社区首页、当前账户、绑定、服务器/游戏入口和返回游戏路径。
- 从游戏生成的绑定、帮助、服务器社区深链，以及从社区回到 Bridge/游戏上下文的深链。
- 账户页展示 Discourse 身份、已绑定游戏账号、绑定状态、解绑/重新绑定规则和安全提示。
- 服务器的基础社区落点：服务器介绍、规则/帮助、公告或讨论入口；具体内容使用 Discourse 原生能力。
- 最小社区通知/未读入口，至少能让用户知道需要处理的绑定或社区动作；不在 Bridge 重建完整通知系统。
- 社区与游戏之间的状态一致性：绑定成功、待确认、已过期、无权限、已解绑等状态有统一定义和可追踪结果。
- 基础社区安全运营：Discourse 的用户举报/版主治理、必要的账号封禁边界和 Bridge 侧服务器/插件凭证撤销。

### 5.2 可以延后

奖励、金币、钱包、商城、游戏内命令下发、自动封禁联动、多游戏统一档案、复杂活动系统、论坛内容镜像、完整社区搜索聚合、实时聊天、Redis/worker 驱动的异步奖励与通知，以及独立安装器产品化均不属于 MVP。它们只有在真实使用指标证明需要时进入后续阶段，并分别定义数据归属、幂等和运营责任。

MVP 不要求 Bridge 拥有完整论坛首页或帖子详情渲染；但必须提供可识别、可回返、保留上下文的 Discourse 入口，否则“社区能力已接入”不能视为完成。

## 6. 组件取舍决策

| 组件 | MVP 决策 | 商业 MVP 责任 | 依据/处理 |
| --- | --- | --- | --- |
| `apps/api` | 必须保留 | 唯一业务后端/Bridge 单体 | 承载身份编排、插件、绑定、上下文、状态和运营 API；不拆进程 |
| PostgreSQL/Prisma | 必须保留 | Bridge 的持久化数据 | 保存内部用户、游戏、绑定、插件、会话和审计关系；不存论坛正文 |
| `apps/web` | 合并/收缩 | 统一产品壳、账户映射、绑定和导航 | 保留实际页面，去除与 Discourse 重复的身份/论坛实现 |
| `apps/web` 本地注册/登录 | 下线/迁移 | 仅存量兼容 | 不作为新用户主路径；设定迁移截止和冲突处理 |
| `apps/web` `/bindings`、`/bind/confirm` | 保留 | 绑定确认、结果、返回游戏和社区深链 | 直接对应游戏闭环 |
| `apps/web` `/forums` | 收缩/延后 | 带 SSO、上下文和回返的社区入口 | 不复制 Discourse 内容能力 |
| `apps/admin` | 不部署，短期归档 | 字段/操作原型参考 | 静态 demo，无后端、无持久化、无 package 配置 |
| `apps/web` `/admin` 或 API admin HTML | 保留一套 | 服务器、插件凭证、绑定和故障排查 | Bridge 运营职责；社区治理交给 Discourse Admin |
| `services/forum`/`infra/forum` | 保留为外部依赖 | Discourse 运行、备份、升级边界 | 与 Bridge 发布解耦 |
| `bridges/forum` | 契约/适配器文档 | SSO/API/事件契约与集成测试说明 | 不直接读库，不单独部署 |
| `plugin-poc/minecraft-js` | 保留为验收工具 | 协议回归、深链和绑定 smoke test | Node 模拟骨架，不是生产插件 |
| Paper/Java 插件 | 延后但作为首个适配器 | 游戏命令、事件、状态回传 | 复用冻结的 Bridge 契约，不负责论坛登录 |
| Redis/queue/worker | 延后，默认关闭 | 未来异步重试、奖励和通知 | 先用数据库状态和同步调用 |
| Nginx/Caddy | 保留一个 | TLS、统一域名路由、`/api`、`/bind`、社区跳转 | 只保留单一配置来源 |
| Compose | 保留但重写为发布产物 | 单机/验收部署 | 当前配置是开发模式，不能直接视为生产基线 |

## 7. 统一边界、请求流与数据安全

### 7.1 推荐域名与体验边界

```text
community.example.com -> Discourse
app.example.com       -> GameMulti Bridge（统一产品壳、API、绑定页）
```

入口可以采用子域名，但导航、品牌、SSO、返回路径和错误处理必须一致。主域名如需存在，只做明确的产品入口或跳转，不引入第二套身份 API。

### 7.2 SSO、API 与事件如何保持一致

1. Bridge 创建短期、单用途、带过期时间的上下文；插件使用 HMAC、timestamp、nonce 请求绑定 session。
2. 无 Bridge 会话时，Bridge 发起 DiscourseConnect；回调签名、时间窗口、state/return target 和重放保护必须校验。
3. Bridge 只保存 Discourse 的稳定外部 ID、必要的显示资料快照、同步时间和映射状态；不保存 Discourse 密码或论坛正文。
4. 需要读取社区状态时，使用 Discourse 官方 API/服务账号，按最小权限调用；不得让插件直接调用 Discourse，也不得让 Bridge 直连论坛数据库。
5. 绑定、解绑和凭证撤销以 Bridge 事务为准；需要在社区显示的摘要通过受控 API 或未来事件同步。事件必须带事件 ID、版本、时间和来源，消费端幂等。
6. API 失败、SSO 取消、上下文过期或同步延迟都要返回可理解状态；不能以“登录成功”掩盖“绑定未完成”。

### 7.3 数据与安全边界

- Discourse 是社区身份、帖子、评论、社区通知和内容治理的权威系统。
- Bridge 是游戏账号映射、绑定会话、插件客户端凭证、服务器状态、游戏事件和跨系统审计的权威系统。
- PostgreSQL 只保存 Bridge 领域数据和必要的外部身份引用；论坛数据库只由 Discourse 自身访问。
- 插件凭证只在 claim 阶段返回并加密保存；绑定链接和 SSO state 短期、单用途、不可预测。
- 访问控制以用户、服务器、游戏账号和操作类型为维度；Discourse 的登录态不能自动授予游戏管理权限。
- 记录 SSO、绑定、解绑、凭证签发/撤销和管理员操作审计；敏感 token、密码和完整 cookie 不写日志。

## 8. 避免割裂的验收标准

以下全部满足，才可称为社区-游戏一体化 MVP：

1. 玩家从游戏发起社区/绑定入口后，能看到当前服务器和目标动作；完成 Discourse 登录后回到原动作，不丢失上下文。
2. 首次用户只完成一次注册/登录；已有用户不会被要求再创建一套 Bridge 或论坛账号。
3. 绑定成功、待确认、已过期、已解绑和无权限在游戏、Bridge 和社区入口中使用一致的状态文案与结果。
4. 玩家能从 Bridge 账户页进入社区，也能从社区入口回到自己的绑定/服务器上下文；返回游戏路径在支持时可验证，不支持时有明确可执行指引。
5. 社区服务器介绍/规则/公告入口与游戏服务器标识一致，不出现无法关联的重复名称或孤立页面。
6. Bridge 不实现论坛发帖、评论、版主和完整通知替代品；用户进入这些操作时通过 SSO 无感切换到 Discourse，并能返回 GameMulti。
7. Discourse Admin 与 Bridge Admin 的职责不重叠：前者治理内容/社区用户，后者管理服务器、插件凭证、绑定和技术故障。
8. 伪造、过期、重放、跨用户或跨服务器的链接/回调会被拒绝，且不会创建绑定；论坛数据库不可被 Bridge 或插件直接访问。
9. Discourse 不可用时，Bridge 能展示明确的降级状态；Bridge 不可用时，Discourse 的基础阅读和社区治理不被数据库耦合拖垮。
10. 用 JS PoC 至少回归一条真实链路：插件请求、SSO、绑定确认、状态回传、社区深链和返回游戏提示；再以同一契约验收 Paper/Java 插件。

## 9. Minecraft PoC 与安装流程的位置

`plugin-poc/minecraft-js` 应继续作为 HMAC 请求协议、`publicBindUrl`/pair code、绑定确认、`installToken -> claim -> client credentials` 和 API 兼容性 smoke test 的可执行回归客户端。它不是 Minecraft 服务器可安装插件，不应被包装成商业安装包或长期运行服务。

商业交付顺序：

1. 冻结 HTTP、HMAC、防重放、安装 claim、绑定 session、游戏上下文和心跳/事件契约。
2. 用 JS PoC 完成真实 Discourse + Bridge 的端到端验收，包括登录回跳和双向深链。
3. 实现 Paper/Java 插件，复用同一 API；只负责游戏侧命令、事件采集、有限重试和配置。
4. 安装向导首期只生成服务器记录、短期 token 和配置说明；`setup/installer` 不发展为独立安装服务。
5. 奖励发放、命令下发、封禁联动、持久化插件队列放到商业验证后的下一阶段。

## 10. 基础设施审查

### 10.1 Compose 与发布

`infra/compose/docker-compose.yml` 运行时执行 `npm install`、Prisma 生成、`db push`、seed 和开发服务器；`infra/compose/docker-compose.prod.yml` 仍在启动时安装依赖、`db push`、seed、build。这会造成启动不可重复、生产编译漂移和 schema 误改。

商业 MVP 应改为：CI/镜像阶段安装依赖、生成 Prisma client、编译 API/Web；运行镜像只带生产依赖和产物；发布执行 `prisma migrate deploy`，禁止生产 `db push` 和自动 seed；Web 使用构建产物；Bridge、PostgreSQL 和单一反代完成健康检查、备份和恢复演练。

### 10.2 Nginx、数据库与 Redis

`infra/nginx/default.conf`、`with-web.conf`、`onepanel-origin.conf` 存在路由重复；`infra/deploy/up.sh` 的 `ENABLE_WEB` 与 README 默认拓扑漂移。应选择一个统一产品壳和单一事实来源，不用隐含开关决定生产拓扑。

PostgreSQL 是绑定、映射、插件、事件和审计所需的唯一业务数据库。当前 schema 中钱包、奖励、商城等未来模型不应被首期 migration 反向绑架。Redis 在 MVP 下线运行配置；只有事件积压、论坛异步同步或可靠奖励投递可量化后才引入，并同时定义 worker、幂等、重试和死信策略。

## 11. 迁移闸门与优先级

### P0：确定统一产品壳与身份归属

P0 的规范性基线见 [`docs/plan/p0-unified-product-baseline.md`](./p0-unified-product-baseline.md)。该文档是后续产品、API、插件、后台和部署工作的冻结合同，覆盖组件边界、`discourseUserId` 归属、绑定状态、双向旅程、导航、深链上下文、返回路径、MVP 社区入口以及两个 Admin 的写入权威。

- 明确 GameMulti 为跨游戏/社区产品品牌，Discourse 为社区身份和内容底座，Bridge 为游戏与上下文中枢。
- 冻结玩家双向旅程、域名、导航、深链、状态模型和返回路径；`publicBindUrl` 由 Bridge 生成，插件不构造论坛 URL。
- 决定 Discourse 为注册/登录/论坛/社区管理主系统；本地注册冻结为存量兼容路径并设迁移截止条件。
- 以 `discourseUserId` 作为新绑定归属键，游戏账号冲突不得静默覆盖；Bridge 登录态不等于游戏权限。
- 保留 Bridge SSO、绑定确认、游戏映射、插件 API；冻结 `apps/admin` 不生产化，Bridge Admin 与 Discourse Admin 各自只拥有本域写入权。
- 明确 `bridges/forum` 为契约/适配器文档位置，不拆进程；Bridge 不直连 Discourse 数据库。
- 任何改变身份权威、绑定归属、状态枚举、深链字段/有效期、返回白名单或后台写入权威的需求，必须重新评审 P0 基线。

### P1：交付不割裂的真实集成

- 在真实 Discourse 环境验证 SSO、回跳上下文、用户名/邮箱冲突、回调重放、cookie、跨域和失败恢复。
- 交付统一账户页、绑定状态、服务器社区深链、社区回 Bridge/游戏路径和一致错误状态。
- 以验收标准验证 Discourse Admin 与 Bridge Admin 的职责边界。
- 统一域名和环境变量，删除默认弱 secret、demo forum provider 和裸论坛入口。
- 生成不可变 API/Bridge 镜像；运行时只做 migration deploy，不做 install/db push/seed/build。
- 用单一反代 + Bridge + PostgreSQL 完成部署、备份、恢复和健康检查；Discourse 作为独立系统纳入联调和恢复演练。

### P2：首个游戏商业适配

- 冻结并发布 Paper/Java Minecraft 插件，覆盖上下文链接、绑定、状态回传和离线行为。
- 将 JS PoC 作为协议回归和安装验收工具，不作为生产插件。
- 明确有限重试、幂等键、版本兼容、密钥轮换和插件失联提示。

### P3：按指标扩展

只有真实使用指标证明必要时，才增加 Redis/worker、论坛异步同步、奖励结算、商城、封禁联动、社区聚合和第二个游戏插件。每项扩展先定义独立业务需求、数据归属、失败语义和运维责任人。

## 12. 当前审查发现的风险

1. **产品定义过窄**：若只验收“绑定成功”，用户仍会在论坛和游戏之间迷失；双向旅程和上下文必须成为 MVP 门槛。
2. **生产配置名不副实**：`infra/compose/docker-compose.prod.yml` 仍运行时安装、`db push`、seed 和 build，不能作为商业生产发布方案。
3. **拓扑文档漂移**：README 宣称默认启动 Web，但 `up.sh` 默认不启 Web；Nginx 默认配置也只代理 Bridge。
4. **重复身份系统**：本地 Auth 与 Discourse SSO 并存，长期会产生账号归属和权限分叉。
5. **后台交付物不一致**：静态 `apps/admin` 与实际 `apps/web/admin` 并存，前者不能请求后端，容易被误部署或误验收。
6. **论坛实现状态被高估**：真实 SSO、社区权限、上下文回跳和失败恢复仍应视为集成风险，而不是仅凭控制器存在即视为完成。
7. **数据边界风险**：任何让 Bridge 或插件直连 Discourse 数据库、复制论坛正文或把 SSO 当游戏权限的方案都应拒绝。
8. **未来模型过宽**：钱包、商城、奖励、封禁、多游戏模型和接口文档较多，但不应阻塞社区-游戏一体化首期。

## 13. 最终决策清单

**必须保留**：`apps/api` 模块化单体、PostgreSQL/Prisma、GameMulti 统一产品壳、Discourse SSO、账户映射、绑定页、游戏上下文与双向深链、HMAC 插件协议、Minecraft 首个商业适配方向、一个反代、备份与密钥管理。

**合并/收缩**：主站与 Bridge 的重复账户/论坛能力；后台统一到 `apps/web/admin` 或 Bridge 运维页；`bridges/forum` 并入 API 契约/适配器边界；论坛保持独立部署但只通过 SSO/API/受控事件对接；Bridge 不复制 Discourse 内容能力。

**下线或延后**：生产中的独立 `apps/admin` demo、主站本地新用户注册、独立 bridge/forum 进程、Redis/queue/worker、奖励结算、钱包商城、封禁联动、命令下发、第二个游戏、完整 installer 产品化、论坛内容镜像。

**商业 MVP 的完成定义**：真实 Discourse 用户可以从游戏进入 GameMulti 社区并在保留上下文的情况下完成登录与 Minecraft 绑定，也可以从社区回到自己的服务器/游戏上下文；玩家、服主和运营看到一致的身份、绑定和状态；运营可以查看服务器/插件/绑定健康状态；系统可用单一 Bridge 镜像、PostgreSQL、Discourse 和反代完成可重复部署、备份与恢复。
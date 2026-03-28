# 论坛 SSO 可配置接入方案

## 目标

把现有“论坛 SSO / 账户映射基础模块”推进到 **可配置接入版本**，让仓库里已经具备下面几类交付：

- 可以直接抄走的环境变量样例
- 稳定的主站服务边界与论坛适配器契约
- 针对 Discourse 的接入骨架示例
- 清晰的账户映射关系与状态流转说明
- 一套本地可执行的验证脚本与验证步骤

当前版本仍然是 **集成骨架 + 接入说明**，不会直接替你操作真实论坛 API，但已经把后续真实接入时最容易返工的配置项、映射字段、边界约束和验证方法固定下来。

---

## 仓库内交付清单

```text
backend/
  adapters/
    forum_provider_adapter.js
    discourse_forum_adapter.js
  config/
    forum_sso.example.env
  examples/
    forum_sso_service.js
  schemas/
    forum_sso.prisma
  scripts/
    forum_sso_verify.js
docs/
  backend/
    forum_sso_foundation.md
```

职责划分：

- `schemas/forum_sso.prisma`：沉淀论坛账户映射、SSO ticket、同步任务的数据模型
- `examples/forum_sso_service.js`：提供主站侧 SSO 编排服务骨架
- `adapters/forum_provider_adapter.js`：定义论坛适配器统一契约
- `adapters/discourse_forum_adapter.js`：提供 Discourse 定向接入骨架
- `config/forum_sso.example.env`：收敛可配置项，方便环境落地
- `scripts/forum_sso_verify.js`：本地验证主流程是否打通
- `docs/backend/forum_sso_foundation.md`：记录接入方式、映射关系和验证方法

---

## 一、推荐接入方式

主站侧统一通过 `ForumSsoService` 编排论坛进入逻辑，外部论坛差异全部压到 `ForumProviderAdapter`。

### 主链路

1. 主站用户已登录
2. 用户点击“进入论坛”
3. 主站调用 `issueForumEntry({ userId, forumProvider, redirectUrl })`
4. 服务确保本地存在 `forum_accounts` 映射
5. 若无映射，尝试匹配现有论坛账户；匹配不到则按配置决定是否自动建号
6. 生成一次性 `forum_sso_tickets`
7. 跳转到适配器构建出的论坛消费地址
8. 论坛桥接层消费 ticket，建立论坛登录态
9. 首次访问或资料变更时，把资料同步任务写入 `forum_sync_jobs`

### 模块边界

- 主站用户模块：提供 userId / 用户资料 / 状态变更事件
- `ForumSsoService`：负责映射查找、ticket 签发、同步任务编排
- `ForumProviderAdapter`：负责对接具体论坛 API 或 SSO 桥接能力
- Worker / Queue：异步处理 profile / ban / group sync

这样做的好处是：

- 论坛从 Discourse 切到 Flarum / NodeBB 时，主站逻辑不用推倒重来
- 主链路只关注“能不能进入论坛”，同步重任务不阻塞登录
- 配置项集中后，测试、预发、生产环境切换更稳

---

## 二、环境变量与配置项

样例文件：`backend/config/forum_sso.example.env`

### 必填项

| 变量 | 说明 |
| --- | --- |
| `FORUM_SSO_PROVIDER` | 当前论坛提供方标识，默认示例是 `discourse` |
| `FORUM_SSO_BASE_URL` | 论坛根地址，例如 `https://forum.example.com` |
| `FORUM_SSO_CONSUME_PATH` | ticket 消费路径，例如 `/session/sso_login` |
| `FORUM_SSO_SHARED_SECRET` | 主站与论坛桥接层共享密钥 |
| `FORUM_SSO_BRIDGE_CALLBACK_URL` | 论坛回调主站的桥接地址 |

### 常用行为开关

| 变量 | 说明 | 推荐值 |
| --- | --- | --- |
| `FORUM_SSO_ALLOW_AUTO_CREATE` | 未匹配到论坛账户时是否允许自动建号 | `true` |
| `FORUM_SSO_MATCH_BY` | 首次绑定优先按什么匹配现有论坛账户 | `email` |
| `FORUM_SSO_SYNC_PROFILE` | 是否开启资料同步 | `true` |
| `FORUM_SSO_SYNC_BAN_STATE` | 是否开启封禁/解封同步 | `true` |
| `FORUM_SSO_SYNC_GROUPS` | 是否开启用户组同步 | `false` |

### 安全与运行时参数

| 变量 | 说明 | 推荐值 |
| --- | --- | --- |
| `FORUM_SSO_TICKET_TTL_SECONDS` | ticket 有效期 | `300` |
| `FORUM_SSO_ALLOWED_REDIRECT_HOSTS` | 允许跳转的论坛域名白名单 | `forum.example.com,community.example.com` |
| `FORUM_SSO_REQUEST_TIMEOUT_MS` | 对论坛 API 的请求超时 | `5000` |
| `FORUM_SSO_RETRY_MAX_ATTEMPTS` | 异步同步最大重试次数 | `5` |
| `FORUM_SSO_RETRY_BASE_DELAY_MS` | 同步重试基础退避时间 | `60000` |

### 字段映射参数

| 变量 | 说明 |
| --- | --- |
| `FORUM_SSO_EXTERNAL_UID_FIELD` | 论坛侧承接主站外部身份的字段名，推荐 `external_id` |
| `FORUM_SSO_LOGIN_REDIRECT_URL` | 登录完成后的默认论坛落点 |

> 实际落地时，不要把真实密钥直接提交到仓库。仓库里只保留 example env，真实值放部署平台 Secret / CI 变量里。

---

## 三、账户映射关系

### 1. 主站与论坛的身份映射

推荐使用主站 `user.id` 作为论坛外部身份 `external_uid`，避免用户名、邮箱变更后映射漂移。

| 主站字段 | 论坛映射字段 | 用途 |
| --- | --- | --- |
| `user.id` | `external_uid` / `external_id` | 稳定唯一绑定键 |
| `username` | `forum_username` | 展示用户名 |
| `email` | `forum_email` | 首次匹配 / 通知 |
| `status` | suspend / ban state | 风控状态同步 |

### 2. forum_accounts

`forum_accounts` 表示主站用户与论坛账户的唯一映射关系。

关键约束：

- `unique(user_id, forum_provider)`
- `unique(forum_provider, forum_user_id)`
- `unique(forum_provider, external_uid)`

映射来源建议保留：

- `auto_create`
- `matched_existing`
- `manual_bind`

### 3. forum_sso_tickets

一次性票据用于把主站登录态安全转给论坛桥接层。

建议：

- 只允许单次消费
- 带过期时间
- 记录 `request_ip` / `request_user_agent`
- 记录 `redirect_url`

### 4. forum_sync_jobs

资料同步、封禁同步、用户组同步全部走异步任务，避免阻塞主链路。

建议任务类型：

- `create_account`
- `sync_profile`
- `sync_ban_state`
- `sync_groups`

---

## 四、状态流转建议

### ForumAccountSyncStatus

- `pending_initial_sync`：刚建映射，初始同步未完成
- `active`：最近一次同步成功，可正常签发登录
- `syncing`：已有同步任务在执行中
- `sync_failed`：最近同步失败，需要重试或人工处理
- `disabled`：映射停用，不允许再签发论坛登录

### ForumSsoTicketStatus

- `issued`
- `consumed`
- `expired`
- `cancelled`

### ForumSyncJobStatus

- `pending`
- `processing`
- `succeeded`
- `failed`
- `cancelled`

---

## 五、适配器契约

统一契约文件：`backend/adapters/forum_provider_adapter.js`

具体论坛实现至少要补齐以下方法：

- `findUserByExternalUid(externalUid)`
- `findUserByEmail(email)`
- `createUser(payload)`
- `syncProfile(payload)`
- `syncBanState(payload)`
- `buildConsumeUrl(ticket, redirectUrl)`

### 为什么必须有这层契约

因为不同论坛在下面这些点上差异很大：

- 用户创建 API 形态不同
- SSO 登录入口不同
- 外部 UID 承接字段不同
- 封禁 / 解封能力不同
- 用户组同步能力不同

把这些差异收口到 adapter，可以保证：

- 主站只关心统一领域动作
- 接口测试可以围绕 service 做
- 论坛切换时影响面最小

---

## 六、Discourse 接入骨架说明

示例文件：`backend/adapters/discourse_forum_adapter.js`

当前仓库里给的是 **安全骨架版**，特点：

- 已定义 Discourse 适配器类
- 已实现 `buildConsumeUrl()` 的可运行逻辑
- `createUser()` / `syncProfile()` / `syncBanState()` 提供返回结构样例
- `findUserByExternalUid()` / `findUserByEmail()` 留作真实 API 接入点

你在真实环境里需要补的主要是：

1. 论坛 API 认证方式（API Key / admin token / internal bridge）
2. 按 `external_id` 查用户的实际调用
3. 创建用户接口参数映射
4. 资料同步与封禁同步的真实请求
5. 请求失败后的错误码归一化

---

## 七、最小验证方法

验证脚本：`backend/scripts/forum_sso_verify.js`

### 本地验证命令

```bash
cd /home/yinan/.openclaw/workspace/GameMulti
set -a
source backend/config/forum_sso.example.env
set +a
node backend/scripts/forum_sso_verify.js
```

### 脚本验证内容

脚本会完成以下动作：

1. 初始化内存版论坛适配器与主站服务
2. 生成一名测试用户 `user_1`
3. 调用 `issueForumEntry()` 签发 ticket
4. 调用 `consumeTicket()` 验证 ticket 单次消费链路
5. 调用 `processPendingSyncJobs()` 验证 profile sync 成功落账
6. 打印最终 `forumAccounts`、`forumSyncJobs`、`consumeUrl`

### 通过标准

终端输出中应能看到：

- `entry.consumeUrl` 按配置项拼接出的论坛地址
- `consumed.forumUserId` 正常返回
- `syncResults[0].status === "succeeded"`
- `forumAccounts[0].syncStatus === "active"`

---

## 八、真实环境接入步骤

1. **确认目标论坛实现**：至少明确是 Discourse / Flarum / NodeBB / 自研
2. **准备环境变量**：基于 `backend/config/forum_sso.example.env` 注入真实值
3. **实现具体 adapter**：优先补齐用户查询、用户创建、资料同步、封禁同步
4. **接主站入口**：在“进入论坛”按钮或用户中心调用 `issueForumEntry()`
5. **接论坛桥接消费端**：论坛侧落 ticket 消费与登录态建立逻辑
6. **接异步执行器**：把 `forum_sync_jobs` 接到现有 worker / queue
7. **联调回归**：验证首次建号、已存在账户匹配、资料更新、封禁同步、ticket 过期

---

## 九、当前依赖与边界

当前仓库版本依赖：

- Node.js 运行脚本示例
- Prisma schema 作为数据建模草稿
- 真实论坛 API 尚未接入
- 真实消息队列 / 定时 worker 尚未接入

所以它现在解决的是：

- 配置口径统一
- 字段映射不再飘
- 主站/论坛边界稳定
- 本地验证有抓手

还没解决的是：

- 真实论坛账号登录态的最终桥接实现
- 生产环境密钥托管
- 真正的 API 限流、审计和报警

---

## 十、建议的下一步

如果后续继续推进，我建议按这个顺序落地：

1. 先确认论坛实现与 SSO 方式
2. 再把 `DiscourseForumAdapter` 替换成真实 HTTP 客户端实现
3. 把 `forum_sync_jobs` 接到现有 worker
4. 在 Admin 补一个“论坛账户状态 / 手工补同步”面板
5. 最后做预发联调和失败补偿

这样推进，风险最低，也最不容易返工。

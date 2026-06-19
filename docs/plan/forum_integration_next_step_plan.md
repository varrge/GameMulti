# 论坛联通下一步方案

## 目标

先把 GameMulti 的账号体系、邀请注册、游戏绑定与论坛入口打通，形成可验证的用户闭环：

1. 用户通过邀请码注册并登录 GameMulti。
2. 用户完成游戏账号绑定。
3. 用户从 GameMulti 进入论坛。
4. 论坛侧能识别或接收 GameMulti 用户身份。
5. 管理后台能排查用户、绑定、论坛联通状态。

这一步优先处理论坛联通，不急着把插件放进真实 MC 服务器。当前插件仍是 Node PoC，已经验证协议链路，但还不是可部署到 Paper/Spigot 的 Java 插件。

## 当前状态

已完成：

- Web/API/Docker 本地链路跑通：`http://127.0.0.1:8080`
- 邀请码注册、登录、绑定确认可用
- 插件 HMAC 签名、防重放、绑定 session、事件、心跳已验证
- Admin 页面可查看服务器心跳和插件事件：`/admin`
- smoke 覆盖网页、账号、绑定、插件遥测、admin 查询

尚未完成：

- 真实论坛实例未接入
- 论坛 SSO/外部登录链路未端到端验证
- 用户进入论坛后的身份映射、昵称、邮箱同步策略未固化
- 论坛联通状态还没有后台可视化

## 推荐论坛方案

建议优先接 Discourse。

原因：

- SSO 和外部身份能力成熟
- 管理后台完整，方便早期运营
- Docker 部署资料多，后续可独立维护
- 比从零做论坛更符合当前项目目标

备选方案：

- Flarum：轻量，但插件生态和 SSO 集成要评估
- NodeBB：Node 技术栈接近，但论坛运维复杂度不一定更低
- 现有论坛：如果已有生产论坛，需要按它的 SSO/API 能力重新设计适配器

## 本阶段范围

### 1. 明确论坛运行方式

本地开发建议二选一：

- 接一个已有 Discourse 测试站
- 用 Docker 单独起 Discourse 测试实例

短期更推荐已有测试站，因为 Discourse 本地容器较重，启动和邮件配置成本高。只要能拿到测试站管理员权限、SSO secret、回调配置，就可以更快验证主流程。

### 2. 固化论坛配置

需要新增或确认这些环境变量：

```env
FORUM_PROVIDER=discourse
FORUM_ORIGIN=https://forum.example.com
FORUM_ENTRY_PATH=/
FORUM_SSO_SECRET=change-me
FORUM_SSO_RETURN_URL=http://127.0.0.1:8080/forums/discourse-connect
NEXT_PUBLIC_FORUM_ORIGIN=https://forum.example.com
NEXT_PUBLIC_FORUM_ENTRY_PATH=/
```

注意：

- `FORUM_SSO_SECRET` 不能提交到 git
- 本地 compose 用 `.env` 管理
- Web 只暴露公开入口，不暴露 secret

### 3. API 侧打通 SSO 流程

建议实现或补齐这些接口：

- `GET /api/forum/entry`
  - 登录用户访问时生成论坛跳转地址
  - 未登录时返回需要登录的状态

- `GET /api/forum/sso/start`
  - 发起 Discourse SSO
  - 校验当前 GameMulti 登录态
  - 跳转到 Discourse `/session/sso`

- `GET /forums/discourse-connect`
  - 接收 Discourse 带来的 `sso/sig`
  - 调用 `/api/forum/sso/authorize`
  - 校验签名
  - 绑定或更新 `ForumAccount`
  - 跳转回 Discourse `/session/sso_login`

- `GET /api/me/forum-account`
  - 前端账号页展示论坛绑定状态

如果 Discourse 使用“DiscourseConnect”模式，核心校验是 payload 和 sig；签名必须严格按官方规则处理，不能用临时字符串拼接绕过。

### 4. 数据模型使用

项目里已经有这些概念，可以继续沿用：

- `ForumAccount`
- `ForumSsoTicket`
- `ForumAccountSyncStatus`
- `ForumSsoTicketStatus`

本阶段不建议新增复杂表，优先把现有模型跑通。

需要确认字段含义：

- `ForumAccount.userId`：GameMulti 用户
- `ForumAccount.forumProvider`：例如 `discourse`
- `ForumAccount.forumUserId`：论坛用户 ID
- `ForumAccount.forumUsername`：论坛用户名
- `ForumAccount.externalUid`：用于论坛识别 GameMulti 用户的稳定 ID，建议使用 GameMulti user id
- `ForumSsoTicket.ticket`：SSO nonce/ticket
- `ForumSsoTicket.status`：issued/consumed/expired/cancelled

### 5. Web 页面调整

建议改动：

- `/account` 增加论坛状态区
  - 已联通：显示论坛用户名、同步状态、进入论坛按钮
  - 未联通：显示“进入论坛”按钮，点击后走 SSO

- 首页论坛入口不再只是静态链接
  - 已登录：进入 `/api/forum/sso/start` 或 `/api/forum/entry`
  - 未登录：引导到 `/account`

- `/admin` 增加论坛联通状态
  - 用户总数
  - 已绑定论坛账号数
  - 最近 SSO ticket
  - sync_failed 列表

### 6. Smoke 验收

至少补这些 smoke：

- 未登录访问论坛入口返回明确状态
- 登录后能拿到论坛 entry/start URL
- SSO callback 签名错误会拒绝
- SSO callback 签名正确会消费 ticket
- `ForumAccount` 创建或更新成功
- admin 能看到论坛账号统计

如果没有真实 Discourse 测试站，先做“签名协议级 smoke”，等测试站就绪后再补真实跳转验收。

## 执行顺序

建议按下面顺序做：

1. 选择论坛目标：默认 Discourse。
2. 确认测试论坛地址和 SSO secret。
3. 整理 `FORUM_*` 环境变量和 compose 配置。
4. 补 API 的 forum entry/start/callback/me 状态接口。
5. 补 Web 的账号页论坛状态和入口按钮。
6. 补 Admin 的论坛联通统计。
7. 补 smoke，先跑本地协议验收。
8. 接真实论坛测试站，跑真实跳转验收。
9. 再决定是否开始真实 Paper 插件开发。

## 需要你提供的信息

开始实现前，需要确认：

1. 是否确定使用 Discourse？
2. 是否已经有测试论坛地址？
3. 是否能拿到论坛管理员权限和 SSO secret？
4. 本地开发是否接受先用 mock/protocol smoke，等论坛站点准备好再真实联调？

## 不建议现在做的事

暂不建议：

- 现在就写真实 MC Paper 插件
- 现在就把 Node PoC 放到 MC 服务器测试
- 现在就做复杂论坛权限/RBAC 同步
- 现在就做生产部署迁移冻结

原因是论坛身份闭环还没定。如果先做真实 MC 插件，后面论坛身份和用户体系调整时，插件侧也容易跟着返工。

## 下一步建议

下一步直接做“论坛联通基础实现”：

- 以 Discourse 为目标
- 先实现 API 协议和 Web 入口
- 用本地 smoke 验证签名和账号映射
- 等测试论坛准备好后再做真实跳转联调

完成后，项目主流程会变成：

```text
邀请码注册 -> 登录 -> 游戏绑定 -> 进入论坛 -> 后台排查用户/绑定/论坛状态
```

这个闭环比现在继续深入 MC 插件更关键。

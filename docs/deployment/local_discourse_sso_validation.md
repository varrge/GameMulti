# Local Discourse SSO Validation

本地验证是服务器部署前的门槛。目标不是只让容器返回 `200`，而是确认
Bridge 能生成指向本地 Discourse provider 的登录 URL，并在完成 Discourse
首次初始化后通过真实浏览器完成绑定登录。论坛自身的注册/登录必须保留在 Discourse，
不能被 GameMulti 接管。

## 当前本地地址

```text
GameMulti: http://127.0.0.1:8080
Discourse: http://localhost
```

GameMulti 本地 env 需要指向本地论坛：

```env
FORUM_PROVIDER=discourse
FORUM_ORIGIN=http://localhost
FORUM_ENTRY_PATH=/
FORUM_SSO_SECRET=local-dev-forum-sso-secret
DISCOURSE_PROVIDER_SECRET=local-dev-forum-sso-secret
BRIDGE_PUBLIC_ORIGIN=http://127.0.0.1:8080
NEXT_PUBLIC_FORUM_ORIGIN=http://localhost
NEXT_PUBLIC_FORUM_ENTRY_PATH=/
```

本地 `.env` 可能包含 SMTP 密码，不能提交，也不要贴进 issue 或文档。

## 服务启动检查

```bash
docker compose --env-file infra/compose/.env -f infra/compose/docker-compose.yml ps
bash infra/forum/discourse-dev/dev.sh ps
bash infra/forum/discourse-dev/dev.sh check
bash infra/forum/discourse-dev/dev.sh configure-local-sso
npm run check:local-discourse
```

`npm run check:local-discourse` 会验证：

- 本地 Discourse 根页可访问。
- GameMulti `/api/healthz` 可访问。
- GameMulti Bridge 根路径 `/` 可访问。
- Discourse 没有把登录委托到 `http://127.0.0.1:8080/forums/discourse-connect`。
- Bridge `/api/auth/discourse/start` 会跳到
  `http://localhost/session/sso_provider?...`。
- 输出 `discourseState.setupRequired`、`legacyClientRedirect` 和
  `providerEndpointState`，用于判断论坛是否还停在首次安装、是否错误启用了
  DiscourseConnect client、以及 provider endpoint 是否可达。

如果 `setupRequired` 是 `true`，说明 Discourse 容器已启动，但还没完成论坛初始化。
这时不能算真实浏览器 SSO 已完成。

## Discourse 首次初始化

本地开发环境优先使用脚本配置 DiscourseConnect：

```bash
bash infra/forum/discourse-dev/dev.sh configure-local-sso
```

这个命令会关闭 DiscourseConnect client 登录、保留论坛本地注册/登录、启用
DiscourseConnect provider、写入 `DISCOURSE_PROVIDER_SECRET`、关闭本地 HTTPS 强制、
关闭外部头像 CDN，并在管理员用户已存在时把 `DISCOURSE_LOCAL_ADMIN_EMAIL` 或
`DISCOURSE_DEVELOPER_EMAILS` 的第一个邮箱提升为管理员。
同时会把 Discourse 默认语言设置为 `DISCOURSE_DEFAULT_LOCALE`，默认是 `zh_CN`。

如果脚本输出 `admin_user_found: false`，说明管理员用户还没创建。打开：

```text
http://localhost
```

先完成管理员注册，再重新执行 `configure-local-sso`。

手工路径仍可用：

打开：

```text
http://localhost
```

完成 Discourse 初始管理员注册和安装向导。开发邮箱使用
`infra/forum/discourse-dev/.env` 中配置的管理员邮箱；不要把 SMTP 密码写入文档。

初始化完成后进入 Discourse 管理后台，配置 DiscourseConnect provider：

| 设置项 | 本地值 |
| --- | --- |
| enable DiscourseConnect / SSO client | disabled |
| enable DiscourseConnect provider | enabled |
| provider secret | `127.0.0.1\|local-dev-forum-sso-secret` |

不同 Discourse 版本后台字段名可能略有差异，但 provider secret 必须与 Bridge
运行环境里的 `DISCOURSE_PROVIDER_SECRET` 一致。不要启用 DiscourseConnect client；
否则论坛登录/注册会被重定向到 GameMulti 的旧 `/forums/discourse-connect`。

## Bridge 主链路浏览器检查

1. 确保 GameMulti 和 Discourse 都已启动，且已执行 `configure-local-sso`。
2. 用插件 PoC 或 API 创建一个真实绑定 session，拿到 `publicBindUrl`。
3. 确认 `publicBindUrl` 指向 `http://127.0.0.1:8080/bind/confirm?token=...`。
4. 打开 `publicBindUrl`。
5. 浏览器先进入 `http://localhost/session/sso_provider?...`。
6. 登录或确认 Discourse 当前用户。
7. Discourse 回到 `http://127.0.0.1:8080/api/auth/discourse/callback?sso=...&sig=...`。
8. Bridge 回到绑定确认页，显示论坛用户名、游戏账号和服务器。
9. 点击确认绑定，页面显示绑定完成。
10. 通过 API 或数据库确认 `ForumAccount` 已写入，且 `UserGameBinding.discourseUserId`
   等于 Discourse 回调里的 `external_id`。

## 进入服务器部署的条件

只有以下条件都满足，才进入生产服务器部署：

- GameMulti compose 健康。
- 本地 Discourse compose 健康。
- `npm run check:local-discourse` 通过。
- Discourse 首次初始化完成。
- DiscourseConnect provider 已启用，client 登录保持关闭。
- 浏览器从绑定链接可以进入 Discourse provider 登录，并回到 Bridge 完成绑定。

如果只满足容器启动和脚本协议检查，但没有完成浏览器 SSO，则只能说“本地服务可运行”，
不能说“论坛接入已验收”。

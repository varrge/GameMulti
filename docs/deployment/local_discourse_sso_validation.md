# Local Discourse SSO Validation

本地验证是服务器部署前的门槛。目标不是只让容器返回 `200`，而是确认
GameMulti 能生成指向本地 Discourse 的 DiscourseConnect URL，并在完成
Discourse 首次初始化后通过真实浏览器完成 Bridge 绑定登录。

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
FORUM_SSO_RETURN_URL=http://127.0.0.1:8080/forums/discourse-connect
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
- 能创建本地测试邀请码、注册测试用户、登录并生成论坛 SSO URL。
- SSO URL 前缀是 `http://localhost/session/sso?`。
- 能模拟 Discourse 发起的 `sso/sig`，并生成回
  `http://localhost/session/sso_login?` 的签名跳转。
- 输出 `discourseState.setupRequired` 和 `discourseState.ssoEndpointState`，用于判断
  论坛是否还停在首次安装/未启用 DiscourseConnect 阶段。

如果 `setupRequired` 是 `true`，说明 Discourse 容器已启动，但还没完成论坛初始化。
这时不能算真实浏览器 SSO 已完成。

## Discourse 首次初始化

本地开发环境优先使用脚本配置 DiscourseConnect：

```bash
bash infra/forum/discourse-dev/dev.sh configure-local-sso
```

这个命令会启用 DiscourseConnect client/provider 两种模式、写入 `FORUM_SSO_RETURN_URL`、
`FORUM_SSO_SECRET` 和 `DISCOURSE_PROVIDER_SECRET`、关闭本地 HTTPS 强制、关闭外部头像 CDN，
并在管理员用户已存在时把 `DISCOURSE_LOCAL_ADMIN_EMAIL` 或
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

初始化完成后进入 Discourse 管理后台，配置 DiscourseConnect：

| 设置项 | 本地值 |
| --- | --- |
| enable DiscourseConnect / SSO | enabled |
| DiscourseConnect URL | `http://127.0.0.1:8080/forums/discourse-connect` |
| DiscourseConnect secret | `local-dev-forum-sso-secret` |
| enable DiscourseConnect provider | enabled |
| provider secret | `127.0.0.1\|local-dev-forum-sso-secret` |
| consume path | `/session/sso_login` |

不同 Discourse 版本后台字段名可能略有差异，但 secret 必须与 GameMulti
`FORUM_SSO_SECRET` 完全一致。

## Bridge 主链路浏览器检查

1. 确保 GameMulti 和 Discourse 都已启动，且已执行 `configure-local-sso`。
2. 用插件 PoC 或 API 创建一个真实绑定 session，拿到 `/bind/confirm?token=...`。
3. 打开 `http://127.0.0.1:8080/bind/confirm?token=...`。
4. 浏览器先进入 `http://localhost/session/sso_provider?...`。
5. 登录或确认 Discourse 当前用户。
6. Discourse 回到 `http://127.0.0.1:8080/api/auth/discourse/callback?sso=...&sig=...`。
7. Bridge 回到绑定确认页，显示论坛用户名、游戏账号和服务器。
8. 点击确认绑定，页面显示绑定完成。
9. 通过 API 或数据库确认 `ForumAccount` 已写入，且 `UserGameBinding.discourseUserId`
   等于 Discourse 回调里的 `external_id`。

## 兼容链路浏览器检查

这条链路是旧方向：GameMulti 登录后进入 Discourse。过渡期可以继续跑，但它不是新主线。
默认部署不启动旧 Next 前端；要跑这组浏览器检查，先在 GameMulti env 中设置
`ENABLE_WEB=1`，并使用 `infra/nginx/with-web.conf`。

1. 打开 `http://127.0.0.1:8080/account`。
2. 注册或登录 GameMulti 测试用户。
3. 打开 `http://127.0.0.1:8080/forums`。
4. 点击“进入论坛”。
5. 浏览器先进入 `http://localhost/session/sso?...`。
6. Discourse 再回到 `http://127.0.0.1:8080/forums/discourse-connect?sso=...&sig=...`。
7. GameMulti 生成签名回包后跳到 `http://localhost/session/sso_login?...`。
8. 回到 GameMulti Admin，确认论坛账号摘要新增或激活。

## 进入服务器部署的条件

只有以下条件都满足，才进入生产服务器部署：

- GameMulti compose 健康。
- 本地 Discourse compose 健康。
- `npm run check:local-discourse` 通过。
- Discourse 首次初始化完成。
- DiscourseConnect client/provider 均已启用，secret 与 GameMulti 一致。
- 浏览器从绑定链接可以进入 Discourse provider 登录，并回到 Bridge 完成绑定。

如果只满足容器启动和脚本协议检查，但没有完成浏览器 SSO，则只能说“本地服务可运行”，
不能说“论坛接入已验收”。

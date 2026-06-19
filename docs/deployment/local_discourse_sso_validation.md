# Local Discourse SSO Validation

本地验证是服务器部署前的门槛。目标不是只让容器返回 `200`，而是确认
GameMulti 能生成指向本地 Discourse 的 DiscourseConnect URL，并在完成
Discourse 首次初始化后通过真实浏览器进入论坛。

## 当前本地地址

```text
GameMulti: http://127.0.0.1:8080
Discourse: http://127.0.0.1:3000
```

GameMulti 本地 env 需要指向本地论坛：

```env
FORUM_PROVIDER=discourse
FORUM_ORIGIN=http://127.0.0.1:3000
FORUM_ENTRY_PATH=/
FORUM_SSO_SECRET=local-dev-forum-sso-secret
FORUM_SSO_RETURN_URL=http://127.0.0.1:8080/forums/discourse-connect
NEXT_PUBLIC_FORUM_ORIGIN=http://127.0.0.1:3000
NEXT_PUBLIC_FORUM_ENTRY_PATH=/
```

本地 `.env` 可能包含 SMTP 密码，不能提交，也不要贴进 issue 或文档。

## 服务启动检查

```bash
docker compose --env-file infra/compose/.env -f infra/compose/docker-compose.yml ps
bash infra/forum/discourse-dev/dev.sh ps
bash infra/forum/discourse-dev/dev.sh check
npm run check:local-discourse
```

`npm run check:local-discourse` 会验证：

- 本地 Discourse 根页可访问。
- GameMulti `/api/healthz` 可访问。
- GameMulti `/forums` 可访问。
- 能创建本地测试邀请码、注册测试用户、登录并生成论坛 SSO URL。
- SSO URL 前缀是 `http://127.0.0.1:3000/session/sso?`。
- 能模拟 Discourse 发起的 `sso/sig`，并生成回
  `http://127.0.0.1:3000/session/sso_login?` 的签名跳转。
- 输出 `discourseState.setupRequired` 和 `discourseState.ssoEndpointState`，用于判断
  论坛是否还停在首次安装/未启用 DiscourseConnect 阶段。

如果 `setupRequired` 是 `true`，说明 Discourse 容器已启动，但还没完成论坛初始化。
这时不能算真实浏览器 SSO 已完成。

## Discourse 首次初始化

打开：

```text
http://127.0.0.1:3000
```

完成 Discourse 初始管理员注册和安装向导。开发邮箱使用
`infra/forum/discourse-dev/.env` 中配置的管理员邮箱；不要把 SMTP 密码写入文档。

初始化完成后进入 Discourse 管理后台，配置 DiscourseConnect：

| 设置项 | 本地值 |
| --- | --- |
| enable DiscourseConnect / SSO | enabled |
| DiscourseConnect URL | `http://127.0.0.1:8080/forums/discourse-connect` |
| DiscourseConnect secret | `local-dev-forum-sso-secret` |
| consume path | `/session/sso_login` |

不同 Discourse 版本后台字段名可能略有差异，但 secret 必须与 GameMulti
`FORUM_SSO_SECRET` 完全一致。

## 真实浏览器检查

1. 打开 `http://127.0.0.1:8080/account`。
2. 注册或登录 GameMulti 测试用户。
3. 打开 `http://127.0.0.1:8080/forums`。
4. 点击“进入论坛”。
5. 浏览器先进入 `http://127.0.0.1:3000/session/sso?...`。
6. Discourse 再回到 `http://127.0.0.1:8080/forums/discourse-connect?sso=...&sig=...`。
7. GameMulti 生成签名回包后跳到 `http://127.0.0.1:3000/session/sso_login?...`。
8. 回到 GameMulti Admin，确认论坛账号摘要新增或激活。

## 进入服务器部署的条件

只有以下条件都满足，才进入生产服务器部署：

- GameMulti compose 健康。
- 本地 Discourse compose 健康。
- `npm run check:local-discourse` 通过。
- Discourse 首次初始化完成。
- DiscourseConnect 已启用，secret 与 GameMulti 一致。
- 浏览器从 GameMulti 登录态可以进入本地 Discourse。

如果只满足容器启动和脚本协议检查，但没有完成浏览器 SSO，则只能说“本地服务可运行”，
不能说“论坛接入已验收”。

# Forum Production Launch Checklist

这份清单用于正式上线 GameMulti + Discourse 论坛接入。详细背景见
`docs/deployment/discourse_production_runbook.md`；现场执行优先按本文件。

## 0. 必须先确认的真实值

上线前先确定并记录到私有环境文件，不要写进 git：

| 项 | 示例 | 说明 |
| --- | --- | --- |
| Bridge/GameMulti 入口 | `https://app.example.com` | 插件 API、绑定确认页和回调地址；默认不部署旧 Next 前端 |
| Discourse 域名 | `forum.example.com` | 不带协议，DNS 指向论坛服务器 |
| 管理员邮箱 | `admin@example.com` | Discourse 初始化和证书通知 |
| SMTP 地址/端口/账号/密码 | provider value | Discourse 生产必须可发信 |
| SSO secret | `openssl rand -hex 32` | GameMulti 和 Discourse 必须完全一致 |
| 默认语言 | `zh_CN` | Discourse 内置简体中文语言包 |

阻断条件：

- 没有可用域名或 DNS 未生效，不上线。
- 没有 SMTP，不上线。
- `FORUM_SSO_SECRET` 少于 32 字符，不上线。
- 本地 `npm run check:local-discourse` 和真实浏览器 SSO 未通过，不上线。

## 1. 本地仓库准备

```bash
cd /path/to/GameMulti
cp infra/deploy/discourse.env.example infra/deploy/discourse.env
openssl rand -hex 32
```

编辑 `infra/deploy/discourse.env`，至少替换：

```env
GAME_PUBLIC_ORIGIN=https://app.example.com
BRIDGE_PUBLIC_ORIGIN=https://app.example.com
DISCOURSE_HOSTNAME=forum.example.com
DISCOURSE_DEVELOPER_EMAILS=admin@example.com
LETSENCRYPT_ACCOUNT_EMAIL=admin@example.com
DISCOURSE_DEFAULT_LOCALE=zh_CN
DISCOURSE_ALLOW_USER_LOCALE=true
DISCOURSE_SMTP_ADDRESS=smtp.example.com
DISCOURSE_SMTP_PORT=587
DISCOURSE_SMTP_USER_NAME=postmaster@example.com
DISCOURSE_SMTP_PASSWORD=replace-with-real-smtp-password
DISCOURSE_NOTIFICATION_EMAIL=noreply@example.com
FORUM_SSO_SECRET=replace-with-64-hex-random-secret
# DISCOURSE_PROVIDER_SECRET=replace-with-64-hex-random-secret
```

如果已经先在 GameMulti 服务器执行过 `bash infra/deploy/up.sh`，优先使用首次部署时
显示的 `FORUM_SSO_SECRET`。它只会自动显示一次，后续可从服务器私有
`infra/compose/.env` 中读取，但不要贴到公开渠道。

派生规则：

- `GAME_API_ORIGIN` 默认等于 `GAME_PUBLIC_ORIGIN`。
- `BRIDGE_PUBLIC_ORIGIN` 默认等于 `GAME_PUBLIC_ORIGIN`。
- `FORUM_ORIGIN` 默认等于 `https://DISCOURSE_HOSTNAME`。
- `NEXT_PUBLIC_FORUM_ORIGIN` 默认等于 `FORUM_ORIGIN`。
- `FORUM_SSO_RETURN_URL` 默认等于 `GAME_PUBLIC_ORIGIN + /forums/discourse-connect`。
- `DISCOURSE_PROVIDER_SECRET` 默认可与 `FORUM_SSO_SECRET` 相同；如果拆开，两边必须分别一致。

只有分域、反向代理路径特殊或论坛入口和 hostname 不一致时，才显式覆盖这些值。

汉化规则：

- 默认使用 Discourse 内置 `zh_CN`，不安装第三方汉化插件。
- `discourse_configure_sso.sh` 会写入 `default_locale=zh_CN`。
- `set_locale_from_accept_language_header` 会关闭，匿名用户默认看到中文。
- `DISCOURSE_ALLOW_USER_LOCALE=true` 时，登录用户仍可在个人偏好里选择其他语言。
- 分类名、站点说明、服务条款、隐私政策、公告帖等业务内容不会自动翻译，需要运营手工编辑。

本地预检：

```bash
bash infra/deploy/discourse_check_prereqs.sh infra/deploy/discourse.env
bash infra/deploy/discourse_render_launch_summary.sh infra/deploy/discourse.env
bash infra/deploy/discourse_render_game_env.sh infra/deploy/discourse.env
```

`discourse_render_launch_summary.sh` 输出不包含 secret，用于上线前人工核对。
`discourse_render_game_env.sh` 的输出包含 `FORUM_SSO_SECRET`，只用于填入 GameMulti
服务器运行环境，不要贴到公开渠道。

## 2. GameMulti 服务器

在 GameMulti 服务器的 `infra/compose/.env` 或生产 secret 平台中写入：

```env
FORUM_PROVIDER=discourse
FORUM_ORIGIN=https://forum.example.com
FORUM_ENTRY_PATH=/
FORUM_SSO_SECRET=replace-with-the-same-secret-as-discourse
# DISCOURSE_PROVIDER_SECRET defaults to FORUM_SSO_SECRET unless explicitly set
NEXT_PUBLIC_FORUM_ENTRY_PATH=/
```

如果使用 `infra/deploy/up.sh`，服务器 `infra/compose/.env` 里只需要写
`PUBLIC_ORIGIN`、`FORUM_ORIGIN` 和 `FORUM_SSO_SECRET`；脚本会派生
`BRIDGE_PUBLIC_ORIGIN`、`DISCOURSE_PROVIDER_SECRET`、`FORUM_SSO_RETURN_URL`
和 `NEXT_PUBLIC_FORUM_ORIGIN`。

如果 `FORUM_SSO_SECRET` 仍是占位值，`up.sh` 会在第一次部署时随机生成并显示一次。
把这个值保存下来，并同步写入论坛服务器的 `infra/deploy/discourse.env`。

重启主站：

```bash
cd /path/to/GameMulti
bash infra/deploy/up.sh
docker compose --env-file infra/compose/.env -f infra/compose/docker-compose.yml ps
curl -fsS https://app.example.com/api/healthz
```

如果主站未健康，先回滚或修复主站，不继续安装论坛。

## 3. Discourse 服务器

确认 DNS 已指向论坛服务器，且安全组/防火墙开放 `80/tcp` 和 `443/tcp`。

按官方方式安装 Discourse：

```bash
sudo mkdir -p /var/discourse
sudo git clone https://github.com/discourse/discourse_docker.git /var/discourse
cd /var/discourse
sudo ./discourse-setup
```

交互项按 `infra/deploy/discourse.env` 填：

- hostname: `DISCOURSE_HOSTNAME`
- email: `DISCOURSE_DEVELOPER_EMAILS`
- SMTP: `DISCOURSE_SMTP_*`
- Let's Encrypt email: `LETSENCRYPT_ACCOUNT_EMAIL`

安装后打开：

```text
https://forum.example.com
```

创建管理员首号并完成初始化。

## 4. 配置 DiscourseConnect

把仓库和 `infra/deploy/discourse.env` 放到论坛服务器后执行：

```bash
cd /path/to/GameMulti
bash infra/deploy/discourse_configure_sso.sh infra/deploy/discourse.env
```

这个脚本同时会配置论坛默认语言，并开启 Discourse 作为 identity provider，
供 Bridge 的 `/bind/confirm?token=...` 页面跳转登录。

如果脚本提示容器不存在：

```bash
docker ps --format '{{.Names}}'
```

找到 Discourse 容器名后，在 `infra/deploy/discourse.env` 设置：

```env
DISCOURSE_CONTAINER=app
```

再重新执行配置脚本。

## 5. 上线验收

服务检查：

```bash
curl -I https://forum.example.com/
curl -I https://app.example.com/
curl -fsS https://app.example.com/api/healthz
```

GameMulti Bridge smoke：

```bash
cd /path/to/GameMulti
npm run smoke:bridge-api
```

浏览器检查：

1. 在游戏侧或 API 创建一个真实绑定 session，拿到 `/bind/confirm?token=...`。
2. 退出 Bridge 登录态后打开 `https://app.example.com/bind/confirm?token=...`。
3. 确认跳转到 `https://forum.example.com/session/sso_provider?...`。
4. 登录或确认 Discourse 当前用户。
5. 确认回调经过 `https://app.example.com/api/auth/discourse/callback?...`。
6. 确认回到绑定页并显示论坛用户名、游戏账号、服务器。
7. 点击确认绑定，确认页面显示绑定完成。
8. 用 API 或数据库确认 `ForumAccount` 已写入，且 `UserGameBinding.discourseUserId`
   等于 Discourse 回调里的 `external_id`。

只有浏览器检查通过，才算论坛上线完成。

## 6. 回滚

GameMulti 配置回滚：

```bash
cd /path/to/GameMulti
git checkout <last-known-good-commit>
bash infra/deploy/up.sh
```

Discourse 配置错误优先回滚后台设置：

- 关闭 DiscourseConnect，或恢复旧的 `discourse_connect_url` / secret。
- 保留 Discourse 容器和数据库，不要直接删卷。

如果 Discourse 安装或升级失败，优先用 Discourse 后台备份恢复。

## 7. 常见阻塞

| 现象 | 处理 |
| --- | --- |
| `discourse_check_prereqs.sh` DNS 失败 | 等 DNS 生效或修正 A/AAAA 记录 |
| Discourse 无法发邮件 | 修正 SMTP，生产不能跳过 |
| 跳转后签名错误 | 确认 `FORUM_SSO_SECRET` / `DISCOURSE_PROVIDER_SECRET` 两边完全一致 |
| 回调 404/502 | 检查 `BRIDGE_PUBLIC_ORIGIN`、`/api/auth/discourse/callback` 和反向代理 |
| 论坛页面 loading | 检查 Discourse assets、HTTPS、浏览器 Network 404/500 |
| smoke 通过但浏览器失败 | 以浏览器链路为准，检查 cookie、域名、HTTPS 和 DiscourseConnect 设置 |

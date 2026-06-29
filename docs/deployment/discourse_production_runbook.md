# Discourse 生产部署与 GameMulti 接入 Runbook

## 目标架构

GameMulti Bridge 与 Discourse 分开部署：

- GameMulti Bridge：继续由 `infra/deploy/up.sh` 启动 API、Postgres、Nginx；旧 Next 主站默认不部署，只在设置 `ENABLE_WEB=1` 或 `COMPOSE_PROFILES=web` 时启用。
- Discourse：独立服务器或独立 VM，使用官方 `discourse_docker` 安装方式。
- 登录打通主线：玩家打开 `/bind/confirm?token=...`，Bridge 跳到 Discourse
  `/session/sso_provider`，Discourse 登录后回到 Bridge
  `/api/auth/discourse/callback`，Bridge 设置 HttpOnly session cookie 并回到绑定页。
- 兼容链路：旧的 `/api/forum/sso/start` 与 `/forums/discourse-connect` 代码暂时保留，
  但生产论坛不要启用 DiscourseConnect client 登录。

不建议把生产 Discourse 塞进当前 dev compose。Discourse 对 SMTP、TLS、持久化、升级和备份有独立运维要求，拆开部署更容易回滚和排障。

## 官方资料

- Discourse cloud install: https://github.com/discourse/discourse/blob/main/docs/INSTALL-cloud.md
- Discourse Docker: https://github.com/discourse/discourse_docker
- DiscourseConnect meta 说明: https://meta.discourse.org/t/setup-discourseconnect-official-single-sign-on-for-discourse-sso/13045

实际命令以官方文档为准；本 runbook 固定 GameMulti 侧的变量、验证和回滚口径。

正式上线时优先按 `docs/deployment/forum_production_launch_checklist.md`
执行；本文保留背景、变量说明和排障口径。

## 前置条件

- 本地论坛栈已通过 `infra/forum/discourse-dev/dev.sh up`、
  `infra/forum/discourse-dev/dev.sh check` 和 `npm run check:local-discourse`。
  如果本地 Discourse 镜像无法拉取、容器无法启动、HTTP 检查失败或
  GameMulti 不能生成指向本地 Discourse 的 SSO URL，不进入服务器部署。
- 已按 `docs/deployment/local_discourse_sso_validation.md` 完成本地 Discourse
  首次初始化、DiscourseConnect 配置和真实浏览器 SSO 检查。只拿到本地
  Discourse HTTP 200 不算验收通过。
- 一台独立论坛服务器，推荐至少 1 GB RAM，生产建议 2 GB+。
- 论坛域名，例如 `forum.example.com`，DNS A/AAAA 记录已指向论坛服务器。
- 服务器开放 `80/tcp` 和 `443/tcp`。
- 可用 SMTP。Discourse 生产环境没有可用邮件基本不可运营。
- Bridge 对外地址已确定，例如 `https://app.example.com`。
- Bridge Discourse provider 回调可公网访问：`https://app.example.com/api/auth/discourse/callback`。

## 环境文件

先复制模板到私有文件：

```bash
cp infra/deploy/discourse.env.example infra/deploy/discourse.env
```

必填项：

| 变量 | 用途 | 是否 secret |
| --- | --- | --- |
| `GAME_PUBLIC_ORIGIN` | GameMulti 浏览器访问入口 | 否 |
| `BRIDGE_PUBLIC_ORIGIN` | Bridge 浏览器访问入口，未分域时等于 `GAME_PUBLIC_ORIGIN` | 否 |
| `GAME_API_ORIGIN` | GameMulti API 对外入口，未分域时可省略，默认同主站 | 否 |
| `DISCOURSE_HOSTNAME` | 论坛域名，不带协议 | 否 |
| `DISCOURSE_DEVELOPER_EMAILS` | Discourse 管理员邮箱 | 否 |
| `LETSENCRYPT_ACCOUNT_EMAIL` | TLS 证书通知邮箱 | 否 |
| `DISCOURSE_DEFAULT_LOCALE` | Discourse 默认语言，默认 `zh_CN` | 否 |
| `DISCOURSE_ALLOW_USER_LOCALE` | 是否允许用户在个人偏好中切换语言，默认 `true` | 否 |
| `DISCOURSE_SMTP_*` | Discourse 发信配置 | 密码是 secret |
| `FORUM_ORIGIN` | GameMulti 后端使用的论坛根地址，可省略，默认 `https://DISCOURSE_HOSTNAME` | 否 |
| `FORUM_SSO_SECRET` | DiscourseConnect shared secret，默认也作为 provider secret | 是 |
| `DISCOURSE_PROVIDER_SECRET` | Discourse 作为身份提供方时给 Bridge 使用的 secret，可省略并复用 `FORUM_SSO_SECRET` | 是 |
| `NEXT_PUBLIC_FORUM_ORIGIN` | 前端展示/跳转用论坛地址，可省略，默认 `FORUM_ORIGIN` | 否 |
| `DISCOURSE_CONTAINER` | 论坛服务器上的 Discourse 容器名，官方默认 `app` | 否 |

生成 SSO secret：

```bash
openssl rand -hex 32
```

同一个 secret 必须同时填入 Bridge 运行环境和 Discourse 后台。staging/prod 不要复用。

## 部署前检查

在仓库根目录执行：

```bash
bash infra/deploy/discourse_check_prereqs.sh infra/deploy/discourse.env
```

这个脚本只检查本机工具、变量、DNS 和常见端口占用，不会安装或修改服务器。

生成 GameMulti 侧论坛环境变量片段：

```bash
bash infra/deploy/discourse_render_launch_summary.sh infra/deploy/discourse.env
bash infra/deploy/discourse_render_game_env.sh infra/deploy/discourse.env
```

`discourse_render_launch_summary.sh` 输出不包含 secret，可用于上线前核对。
`discourse_render_game_env.sh` 输出包含 `FORUM_SSO_SECRET`，把它写入目标环境的
GameMulti env，例如 `infra/compose/.env`、生产密钥平台或 CI secrets。

## Discourse 安装步骤

在论坛服务器上按官方安装流程执行，核心步骤是：

```bash
sudo mkdir -p /var/discourse
sudo git clone https://github.com/discourse/discourse_docker.git /var/discourse
cd /var/discourse
sudo ./discourse-setup
```

交互配置时按 `infra/deploy/discourse.env` 填：

- hostname: `DISCOURSE_HOSTNAME`
- email: `DISCOURSE_DEVELOPER_EMAILS`
- SMTP address/port/user/password: `DISCOURSE_SMTP_*`
- Let's Encrypt email: `LETSENCRYPT_ACCOUNT_EMAIL`

完成后访问 `https://DISCOURSE_HOSTNAME`，创建管理员首号并完成初始化。

## DiscourseConnect 配置

推荐在论坛服务器上用仓库脚本配置 DiscourseConnect，减少手工填错：

```bash
bash infra/deploy/discourse_configure_sso.sh infra/deploy/discourse.env
```

前提：

- Discourse 已通过官方 `discourse_docker` 安装完成。
- Discourse 容器正在运行，官方默认容器名是 `app`；如不同，在
  `DISCOURSE_CONTAINER` 中覆盖。
- `infra/deploy/discourse.env` 里的 `FORUM_SSO_SECRET` 已与 GameMulti 运行环境一致。

脚本会写入：

- `enable_discourse_connect=false`，保留 Discourse 自己的登录/注册
- `discourse_connect_url=""`
- `discourse_connect_secret=FORUM_SSO_SECRET`
- 开启 `enable_discourse_connect_provider`
- 写入 `discourse_connect_provider_secrets` 或旧版
  `sso_provider_secrets`，格式为 `BRIDGE_HOST|DISCOURSE_PROVIDER_SECRET`
- `enable_local_logins=true`
- `force_https=true`
- `default_locale=DISCOURSE_DEFAULT_LOCALE`，默认 `zh_CN`
- 关闭浏览器 `Accept-Language` 对匿名用户默认语言的覆盖
- 如果 Discourse 支持，会把 GameMulti 域名加入 DiscourseConnect 允许跳转域名。

Discourse 自带简体中文翻译，不需要额外安装汉化插件。脚本只负责系统 UI、邮件模板
等内置文案的默认语言；分类名、站点介绍、条款、公告帖和运营内容需要手工编辑成中文。

也可以进入 Discourse 管理后台手工配置：

- 不启用 DiscourseConnect client / SSO 登录。
- 启用 DiscourseConnect provider。
- provider secret 填 `BRIDGE_HOST|DISCOURSE_PROVIDER_SECRET`，例如
  `app.example.com|<secret>`。

Bridge 绑定页代码会生成：

```text
https://forum.example.com/session/sso_provider?sso=...&sig=...
```

Discourse 登录后回到 Bridge：

```text
https://app.example.com/api/auth/discourse/callback?sso=...&sig=...
```

## GameMulti 配置

GameMulti Bridge 运行环境必须包含：

```env
FORUM_PROVIDER=discourse
FORUM_ORIGIN=https://forum.example.com
FORUM_ENTRY_PATH=/
FORUM_SSO_SECRET=replace-with-the-same-secret-as-discourse
# DISCOURSE_PROVIDER_SECRET defaults to FORUM_SSO_SECRET unless explicitly set
# BRIDGE_PUBLIC_ORIGIN defaults to PUBLIC_ORIGIN
# NEXT_PUBLIC_FORUM_ORIGIN defaults to FORUM_ORIGIN
NEXT_PUBLIC_FORUM_ENTRY_PATH=/
```

改完后重启 GameMulti：

```bash
bash infra/deploy/up.sh
```

默认只会启动 Bridge API、Postgres 和 Nginx。旧 Next 前端不是新主线，生产不要默认启用；
确实需要临时访问旧页面时再设置 `ENABLE_WEB=1` 并确认 `NGINX_CONF=../nginx/with-web.conf`。

## 验证

服务级检查：

```bash
curl -I https://forum.example.com/
curl -I https://app.example.com/
curl -fsS https://app.example.com/api/healthz
```

GameMulti 侧 smoke：

```bash
npm run smoke:bridge-api
```

真实浏览器检查：

1. 创建一个真实绑定 session，拿到 `/bind/confirm?token=...`。
2. 打开 `https://app.example.com/bind/confirm?token=...`。
3. 确认先跳转到 `https://forum.example.com/session/sso_provider?...`。
4. 确认 Discourse 回到 `https://app.example.com/api/auth/discourse/callback?sso=...&sig=...`。
5. 确认最后回到绑定确认页，并能完成绑定。
6. 确认 Bridge 数据库里出现论坛账号映射和游戏绑定记录，且
   `UserGameBinding.discourseUserId` 等于 Discourse 回调里的 `external_id`。

## 备份

Discourse：

- 后台开启自动备份。
- 定期下载并异地保存备份。
- 升级前手动创建一次备份。

GameMulti：

- 备份主站 Postgres，包含 `ForumAccount`、`ForumSsoTicket` 等论坛映射数据。
- 备份实际部署环境变量，但 secret 不入仓库。

## 升级

Discourse 升级优先走后台升级器。升级前：

1. 确认最近备份可用。
2. 记录当前版本。
3. 在低峰期升级。
4. 升级后重新跑真实浏览器 SSO 检查。

GameMulti 升级后至少跑：

```bash
npm --workspace apps/api run build
npm run smoke:bridge-api
```

## 回滚

GameMulti 回滚：

```bash
git checkout <last-known-good-commit>
bash infra/deploy/up.sh
```

Discourse 回滚：

- 优先恢复升级前备份。
- 如果只是配置错误，先修正 provider secret，并确认 DiscourseConnect client 登录保持关闭。
- 回滚后重新验证 `/session/sso_provider` 与
  `/api/auth/discourse/callback`，并确认论坛登录/注册仍由 Discourse 自己处理。

## 常见故障

| 现象 | 优先检查 |
| --- | --- |
| 论坛打不开 | DNS、80/443、安全组、Discourse 容器状态 |
| 论坛停在初始化页 | 先完成管理员初始化，再测 SSO |
| 跳转后签名错误 | `FORUM_SSO_SECRET` 或 `DISCOURSE_PROVIDER_SECRET` 两边不一致 |
| 回调 404/502 | `BRIDGE_PUBLIC_ORIGIN`、`/api/auth/discourse/callback`、反向代理、API 是否部署 |
| 绑定页反复跳登录 | Discourse provider 是否启用、provider secret host 是否匹配 Bridge host、cookie 是否被 HTTPS/SameSite 拦截 |
| smoke 通过但真实论坛失败 | smoke 只验证协议级流程，需要再做浏览器真实跳转 |
| 生产脚本提示容器不存在 | 确认 `docker ps` 中 Discourse 容器名，并设置 `DISCOURSE_CONTAINER` |

## 上线口径

只有同时满足以下条件，才能说论坛真实接入完成：

- Discourse 生产站点已初始化并启用 HTTPS。
- SMTP 可发信。
- Bridge 与 Discourse 使用匹配的 `FORUM_SSO_SECRET` / `DISCOURSE_PROVIDER_SECRET`。
- 浏览器从绑定链接能进入 Discourse provider 登录，并回到 Bridge 完成绑定。
- 数据库能看到论坛账号映射/激活状态和游戏绑定结果。
- 备份和回滚路径已确认。

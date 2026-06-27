# 一键部署入口与现场验证说明

## 入口

```bash
cd /home/yinan/.openclaw/workspace/GameMulti
bash infra/deploy/up.sh
```

在线更新入口：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti
bash infra/deploy/update.sh
```

论坛生产部署不走这个 dev compose。Discourse 生产接入请按
`docs/deployment/discourse_production_runbook.md` 执行，使用
`infra/deploy/discourse.env.example`、`infra/deploy/discourse_check_prereqs.sh`
和 `infra/deploy/discourse_render_game_env.sh` 维护环境与上线检查。

## 前置条件

- 已安装 `docker` 与 `docker compose`
- 已在 `infra/compose/.env` 中回填最少变量
- 默认不部署 Next 前端；只有设置 `ENABLE_WEB=1` 或 `COMPOSE_PROFILES=web`
  时，才需要确认 `WEB_SOURCE_DIR` 指向真实仓库内前端目录

## 最少必填变量

`infra/compose/.env`：

```env
APP_NAME=gamemulti
NODE_ENV=development
PUBLIC_ORIGIN=http://localhost:8080
FORUM_ORIGIN=https://bbs.example.com
HOST_HTTP_PORT=8080
```

如需临时启用旧 Next 前端，再补：

```env
ENABLE_WEB=1
WEB_SOURCE_DIR=/home/yinan/.openclaw/workspace/GameMulti/apps/web
WEB_PORT=3301
NGINX_CONF=../nginx/with-web.conf
```

## 默认行为

- 使用 `infra/compose/docker-compose.yml`
- 默认以 `APP_NAME` 作为 compose project 名（默认 `gamemulti`）
- 第一次部署时，如果 `APP_SECRET`、`ADMIN_API_KEY`、`FORUM_SSO_SECRET`、
  `POSTGRES_PASSWORD` 仍是占位值，脚本会随机生成并写回 `infra/compose/.env`
- 启动前会检查是否存在来自其他工作区的同名旧容器；若检测到，会先清理旧的 `gamemulti-web`、`gamemulti-nginx` 与对应网络，避免 reviewer 在真实仓库复核时撞上历史残留
- 通过 `docker compose up -d --remove-orphans` 默认拉起 `api`、`postgres` 和 `nginx`
- `web` 挂在可选 `web` profile 下，默认不启动；需要旧前端时设置
  `ENABLE_WEB=1` 或 `COMPOSE_PROFILES=web`
- `redis` 作为可选 `queue` profile，默认不启动
- 浏览器端 API 默认走同源 `/api`，由 nginx 转发到 `api:3401`
- 默认根路径 `/` 只返回 Bridge 状态文本，不再代理 Next 主站
- `/bind/confirm?token=...` 由 Bridge API 服务端渲染，并通过 Discourse provider
  SSO 获取论坛登录态；旧的 `/account`、`/bindings`、`/admin` 页面暂时保留但不再作为新主线
- 启动后输出 `docker compose ps`

## 在线更新

服务器不需要手工 `git pull`。更新代码并重启服务：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti
bash infra/deploy/update.sh
```

`infra/deploy/update.sh` 默认行为：

- 从 `DEPLOY_REMOTE` / `DEPLOY_BRANCH` 拉取远端元数据，默认 `origin/develop`
- 只允许 fast-forward 更新，避免服务器本地分叉被悄悄覆盖
- 调用 `infra/deploy/up.sh` 重启 compose 服务
- 访问 `DEPLOY_HEALTH_URL` 做健康检查，默认 `http://127.0.0.1:8080/api/healthz`

可在 `infra/compose/.env` 调整：

```env
DEPLOY_REMOTE=origin
DEPLOY_BRANCH=develop
DEPLOY_UPDATE_MODE=ff-only
DEPLOY_HEALTH_URL=http://127.0.0.1:8080/api/healthz
DEPLOY_HEALTH_ATTEMPTS=30
DEPLOY_HEALTH_DELAY_SECONDS=3
```

如果服务器确认只作为部署目录、不会保留本地代码改动，可以把
`DEPLOY_UPDATE_MODE=reset`，脚本会强制对齐到远端分支。生产首次建议保持
`ff-only`。

## 变量派生规则

上线时不需要重复填同一个地址：

- `PUBLIC_ORIGIN`：主站公网入口，脚本会派生 `APP_URL` 和 `API_URL`。
- `BRIDGE_PUBLIC_ORIGIN`：Bridge 公网入口，默认等于 `PUBLIC_ORIGIN`，用于生成
  Discourse provider 回调 `BRIDGE_PUBLIC_ORIGIN + /api/auth/discourse/callback`。
- `FORUM_ORIGIN`：论坛公网入口，脚本会派生 `NEXT_PUBLIC_FORUM_ORIGIN`。
- `FORUM_SSO_RETURN_URL`：默认派生为 `PUBLIC_ORIGIN + /forums/discourse-connect`。
- `DISCOURSE_PROVIDER_SECRET`：默认复用 `FORUM_SSO_SECRET`，用于 Discourse 作为身份提供方
  登录 Bridge 页面。
- `NEXT_PUBLIC_API_BASE_URL`：默认用 `/api`，浏览器同源访问，不需要单独填公网 API 地址。

只有分域、反向代理路径特殊或前后端不走同源时，才需要显式覆盖这些派生值。

## 首次 Secret 显示

`infra/deploy/up.sh` 只在首次生成 secret 时显示一次：

```text
APP_SECRET=...
ADMIN_API_KEY=...
FORUM_SSO_SECRET=...
POSTGRES_PASSWORD=...
```

这些值会写回 `infra/compose/.env`，后续 `up.sh` 或 `update.sh` 不会再显示。第一次看到时应立即保存到密码管理器或私有部署记录。

`FORUM_SSO_SECRET` 需要复制到 Discourse 的 `infra/deploy/discourse.env`。当前过渡期同时用于：

- 旧链路：GameMulti 作为 DiscourseConnect provider，主站登录后进入论坛。
- 新链路：Discourse 作为 provider，Bridge 绑定确认页使用论坛登录态。

如果显式设置 `DISCOURSE_PROVIDER_SECRET`，则 Discourse provider 设置和 Bridge 运行环境必须使用同一个 `DISCOURSE_PROVIDER_SECRET`。

SMTP、域名、服务器路径这类外部信息不会自动生成，仍需手工填写。

## 失败退出条件

出现以下任一情况会直接退出：

- 本机缺少 `docker` 或 `docker compose`
- 缺少 `infra/compose/docker-compose.yml`
- 缺少 `infra/compose/.env`
- 启用 `web` profile 时，`WEB_SOURCE_DIR` 目录不存在，或目录下缺少 `package.json`
- 缺少 `infra/nginx/default.conf`
- 在线更新时，已跟踪文件存在服务器本地改动
- 在线更新时，当前分支无法 fast-forward 到远端目标分支

## 现场验证

建议按下面顺序复核：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti/infra/compose

docker compose --env-file .env -f docker-compose.yml up -d --remove-orphans
docker compose --env-file .env -f docker-compose.yml ps
curl -I http://127.0.0.1:${HOST_HTTP_PORT:-8080}/
curl -I http://127.0.0.1:${HOST_HTTP_PORT:-8080}/bind/confirm?token=demo
npm run smoke:bridge-api
```

## 已知限制

- 当前 `api` 服务以开发模式启动，首次 `npm install` 会比正式镜像慢
- 如显式启用旧 `web` profile，Next 也会以开发模式启动
- 如果宿主机已有其他服务占用 `HOST_HTTP_PORT`，外部 HTTP 校验可能被宿主机级代理或端口转发干扰
- 如需队列/缓存，需手动加 `--profile queue`

## 后续部署任务维护规则

后续只要推进上线、论坛接入、真实环境联调或生产部署，必须同步维护：

- `infra/deploy/` 部署脚本
- `infra/compose/.env.example` 或对应生产环境变量模板
- `docs/deployment/` 部署 runbook / checklist
- smoke 或手工验收命令

新增环境变量时，必须写入模板并标明是否为 secret；新增服务时，必须写清启动、验证、回滚和排障路径。

## 回滚与排障

停止服务：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti/infra/compose
docker compose --env-file .env -f docker-compose.yml down
```

查看日志：

```bash
docker compose --env-file .env -f docker-compose.yml logs --tail=200 api postgres nginx
```

排障重点：

- 先看 `docker compose ps` 是否 healthy
- 再看容器内 `api` 是否已通过 `/api/healthz`
- 若容器内正常、宿主机仍返回 502，优先排查宿主机 `8080` 监听归属或改用未占用端口重试

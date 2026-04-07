# 一键部署入口与现场验证说明

## 入口

```bash
cd /home/yinan/.openclaw/workspace/GameMulti
bash infra/deploy/up.sh
```

## 前置条件

- 已安装 `docker` 与 `docker compose`
- 已在 `infra/compose/.env` 中回填最少变量
- `WEB_SOURCE_DIR` 必须指向真实仓库内前端目录，例如：`/home/yinan/.openclaw/workspace/GameMulti/apps/web`

## 最少必填变量

`infra/compose/.env`：

```env
APP_NAME=gamemulti
NODE_ENV=development
WEB_SOURCE_DIR=/home/yinan/.openclaw/workspace/GameMulti/apps/web
WEB_PORT=3301
FORUM_BASE_URL=http://192.168.110.218:3000
HOST_HTTP_PORT=8080
```

## 默认行为

- 使用 `infra/compose/docker-compose.yml`
- 默认以 `APP_NAME` 作为 compose project 名（默认 `gamemulti`）
- 启动前会检查是否存在来自其他工作区的同名旧容器；若检测到，会先清理旧的 `gamemulti-web`、`gamemulti-nginx` 与对应网络，避免 reviewer 在真实仓库复核时撞上历史残留
- 通过 `docker compose up -d --remove-orphans` 拉起 `web` 和 `nginx`
- `postgres`、`redis` 作为可选 profile，默认不启动
- 启动后输出 `docker compose ps`

## 失败退出条件

出现以下任一情况会直接退出：

- 本机缺少 `docker` 或 `docker compose`
- 缺少 `infra/compose/docker-compose.yml`
- 缺少 `infra/compose/.env`
- `WEB_SOURCE_DIR` 未设置、目录不存在，或目录下缺少 `package.json`
- 缺少 `infra/nginx/default.conf`

## 现场验证

建议按下面顺序复核：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti/infra/compose

docker compose --env-file .env -f docker-compose.yml up -d --remove-orphans
docker compose --env-file .env -f docker-compose.yml ps
curl -I http://127.0.0.1:${HOST_HTTP_PORT:-8080}/
```

## 已知限制

- 当前 `web` 服务以开发模式启动，首次 `npm install` 会比正式镜像慢
- 如果宿主机已有其他服务占用 `HOST_HTTP_PORT`，外部 HTTP 校验可能被宿主机级代理或端口转发干扰
- 如需数据库与缓存，需手动加 `--profile data`

## 回滚与排障

停止服务：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti/infra/compose
docker compose --env-file .env -f docker-compose.yml down
```

查看日志：

```bash
docker compose --env-file .env -f docker-compose.yml logs --tail=200 web nginx
```

排障重点：

- 先看 `docker compose ps` 是否 healthy
- 再看容器内 `web` 是否已监听 `3301`
- 若容器内正常、宿主机仍返回 502，优先排查宿主机 `8080` 监听归属或改用未占用端口重试

# GameMulti 一键部署入口现场验证记录

## 适用范围
- 仓库路径：`/home/yinan/.openclaw/workspace/GameMulti`
- 部署入口：`infra/deploy/up.sh`
- Compose 文件：`infra/compose/docker-compose.yml`
- Nginx 配置：`infra/nginx/default.conf`
- 默认目标：本地开发/验收环境，启动 `api + postgres + nginx`；如需旧 Next
  前端，可额外启用 `web` profile；如需 Redis，可额外启用 `queue` profile。

## 前置条件
1. 已安装 `docker` 与 `docker compose`
2. `infra/compose/.env` 已存在
3. 如果启用 `web` profile，仓库需存在 `apps/web/package.json`，且
   `WEB_SOURCE_DIR` 指向真实源码目录

当前验证使用的关键变量：

```env
APP_NAME=gamemulti
NODE_ENV=development
ADMIN_API_KEY=replace-with-a-long-random-admin-key
HOST_HTTP_PORT=8080
API_URL=http://localhost:8080/api
FORUM_ORIGIN=https://bbs.example.com
```

## 一键启动命令
在仓库根目录执行：

```bash
bash infra/deploy/up.sh
```

脚本内置检查：
- `docker` / `docker compose` 可用性检查
- `infra/compose/docker-compose.yml` 存在检查
- `infra/compose/.env` 存在检查
- 启用 `web` profile 时，检查 `WEB_SOURCE_DIR` 目录存在、且包含 `package.json`
- 任一检查失败立即退出，不会静默跳过

## 现场验证
以下验证均基于真实仓库路径执行，并保留关键输出。

### 1. docker compose up
执行命令：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti/infra/compose
docker compose --env-file .env -f docker-compose.yml up -d --remove-orphans
```

关键结果：

```text
Container gamemulti-postgres  Started
Container gamemulti-api       Started
Container gamemulti-nginx     Started
```

### 2. docker compose ps
执行命令：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti/infra/compose
docker compose --env-file .env -f docker-compose.yml ps
```

关键结果：

```text
NAME                  IMAGE               STATUS                    PORTS
gamemulti-postgres    postgres:16-alpine  Up (healthy)             5432/tcp
gamemulti-api         node:22-alpine      Up (healthy)             3401/tcp
gamemulti-nginx       nginx:1.27-alpine   Up (healthy)             0.0.0.0:8080->80/tcp
```

### 3. HTTP 可达检查
执行命令：

```bash
curl -I http://127.0.0.1:8080/
```

关键结果：

```text
HTTP/1.1 200 OK
```

### 4. Bridge 绑定入口
建议继续检查以下入口：

```bash
curl -I 'http://127.0.0.1:8080/bind/confirm?token=demo'
curl -I http://127.0.0.1:8080/api/healthz
npm run smoke:bridge-api
```

如果显式启用了旧 Next 前端，也可以在仓库根目录执行完整旧链路 smoke：

```bash
npm run smoke:web-api
```

该命令会检查页面 200、API health、邀请码创建与校验、注册登录、插件签名创建绑定会话、token/pair code 查询、确认绑定和账号绑定列表。

## 手工回填项
正式部署前，至少确认以下变量：
- `HOST_HTTP_PORT`：如 8080 被占用，需要改成空闲端口
- `ADMIN_API_KEY`：必须改成高强度随机值；`/api/admin/*` 需要该 key 或 Admin 用户 Bearer token
- `FORUM_ORIGIN`：改成真实论坛入口
- 如启用旧 Next 前端：`WEB_SOURCE_DIR` 必须改成目标机器上真实的 `apps/web` 路径
- 如启用队列/缓存：补齐 `REDIS_URL` 与 Redis 持久化规划

## 默认支持范围
当前默认覆盖：
- 以 `apps/api` 为后端源码目录启动 NestJS 开发服务
- 默认启动 PostgreSQL 并执行 Prisma `db push` 与 seed
- 由 Nginx 暴露统一 HTTP 入口
- 浏览器端 API 默认使用同源 `/api`，避免远程访问时误指向访问者本机 localhost
- `/bind/confirm?token=...` 由 Bridge API 服务端渲染，主登录态来自 Discourse
- 可选启用 `web` profile 启动旧 Next 前端
- 可选启用 `redis` queue profile 做本地配套依赖

当前**未**默认覆盖：
- 生产构建与静态化发布
- HTTPS 证书申请与自动续期
- systemd 托管
- 论坛容器编排并入同一入口脚本

## 失败回滚
如果本次启动需要回滚，执行：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti/infra/compose
docker compose --env-file .env -f docker-compose.yml down
```

如需连同匿名卷一起清理：

```bash
docker compose --env-file .env -f docker-compose.yml down -v
```

## 常见排障
### 1. 启用旧前端时 WEB_SOURCE_DIR 指错
现象：脚本报 `WEB_SOURCE_DIR 不存在` 或 `缺少 package.json`

处理：
- 检查 `infra/compose/.env`
- 确认目录直接指向真实仓库下的 `apps/web`

### 2. 8080 端口占用
现象：Nginx 容器启动失败或端口绑定报错

处理：
- 改 `HOST_HTTP_PORT`
- 重新执行 `bash infra/deploy/up.sh`

### 3. 启用旧前端时 web 健康检查未通过
现象：`gamemulti-web` 长时间不是 healthy

处理：
- `docker logs gamemulti-web --tail 200`
- 检查 `npm install` 是否失败
- 检查源码目录是否完整挂载

### 4. Bridge HTTP 检查失败
现象：`curl http://127.0.0.1:8080/` 不通

处理：
- 先看 `docker compose ps`
- 再看 `docker logs gamemulti-nginx --tail 100`
- 确认 `infra/nginx/default.conf` 已挂载生效

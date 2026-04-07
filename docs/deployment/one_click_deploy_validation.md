# GameMulti 一键部署入口现场验证记录

## 适用范围
- 仓库路径：`/home/yinan/.openclaw/workspace/GameMulti`
- 部署入口：`infra/deploy/up.sh`
- Compose 文件：`infra/compose/docker-compose.yml`
- Nginx 配置：`infra/nginx/default.conf`
- 默认目标：本地开发/验收环境，启动 `web + nginx`；如需 `postgres/redis`，可额外启用 `data` profile。

## 前置条件
1. 已安装 `docker` 与 `docker compose`
2. 仓库已存在 `apps/web/package.json`
3. `infra/compose/.env` 已存在，且 `WEB_SOURCE_DIR` 指向真实源码目录

当前验证使用的关键变量：

```env
APP_NAME=gamemulti
NODE_ENV=development
WEB_SOURCE_DIR=/home/yinan/.openclaw/workspace/GameMulti/apps/web
WEB_PORT=3301
HOST_HTTP_PORT=8080
FORUM_BASE_URL=http://192.168.110.218:3000
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
- `WEB_SOURCE_DIR` 非空、目录存在、且包含 `package.json`
- 任一检查失败立即退出，不会静默跳过

## 现场验证
以下验证均基于真实仓库路径执行，并保留关键输出。

### 1. docker compose up
执行命令：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti/infra/compose
WEB_SOURCE_DIR=/home/yinan/.openclaw/workspace/GameMulti/apps/web \
  docker compose --env-file .env -f docker-compose.yml up -d --remove-orphans
```

关键结果：

```text
Container gamemulti-web    Started
Container gamemulti-nginx  Started
```

### 2. docker compose ps
执行命令：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti/infra/compose
WEB_SOURCE_DIR=/home/yinan/.openclaw/workspace/GameMulti/apps/web \
  docker compose --env-file .env -f docker-compose.yml ps
```

关键结果：

```text
NAME              IMAGE               STATUS                    PORTS
gamemulti-web     node:22-bookworm    Up (healthy)             3301/tcp
gamemulti-nginx   nginx:1.27-alpine   Up (healthy)             0.0.0.0:8080->80/tcp
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

## 手工回填项
正式部署前，至少确认以下变量：
- `WEB_SOURCE_DIR`：必须改成目标机器上真实的 `apps/web` 路径
- `HOST_HTTP_PORT`：如 8080 被占用，需要改成空闲端口
- `FORUM_BASE_URL`：改成真实论坛入口
- 如启用数据库/缓存：补齐 `POSTGRES_*` 与 Redis 持久化规划

## 默认支持范围
当前默认覆盖：
- 以 `apps/web` 为前端源码目录启动 Next.js 开发服务
- 由 Nginx 暴露统一 HTTP 入口
- 可选启用 `postgres/redis` profile 做本地配套依赖

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
### 1. WEB_SOURCE_DIR 指错
现象：脚本报 `WEB_SOURCE_DIR 不存在` 或 `缺少 package.json`

处理：
- 检查 `infra/compose/.env`
- 确认目录直接指向真实仓库下的 `apps/web`

### 2. 8080 端口占用
现象：Nginx 容器启动失败或端口绑定报错

处理：
- 改 `HOST_HTTP_PORT`
- 重新执行 `bash infra/deploy/up.sh`

### 3. web 健康检查未通过
现象：`gamemulti-web` 长时间不是 healthy

处理：
- `docker logs gamemulti-web --tail 200`
- 检查 `npm install` 是否失败
- 检查源码目录是否完整挂载

### 4. HTTP 检查失败
现象：`curl http://127.0.0.1:8080/` 不通

处理：
- 先看 `docker compose ps`
- 再看 `docker logs gamemulti-nginx --tail 100`
- 确认 `infra/nginx/default.conf` 已挂载生效

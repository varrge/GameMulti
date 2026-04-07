# GameMulti

GameMulti 是一个面向多游戏联机场景的多系统平台仓库。当前仓库同时承载主站、后台原型、后端 API、论坛接入、部署资产与规划文档，并按统一外层结构逐步收口。

## 仓库结构

```text
apps/
  web/        # 主站前端（原 community-web）
  admin/      # 后台前端/后台原型（原 admin-demo）
  api/        # 后端 API 与适配逻辑（原 backend）

services/
  forum/      # 论坛作为独立服务的运行边界与说明

bridges/
  forum/      # 主站/后台/API 与论坛之间的桥接层说明

infra/
  forum/      # 现有论坛基础设施资产
  compose/    # 统一 compose 入口预留
  nginx/      # 统一反代配置预留
  scripts/    # 部署脚本预留
  env/        # 环境模板预留

setup/
  installer/  # 安装向导与初始化流程

docs/
  plan/       # 项目规划文档
  backend/    # 后端与后台相关方案文档
  integration/# 联调与验证文档

plugin-poc/
  minecraft-js/ # 首个游戏插件 PoC
```

## 路径迁移映射

- `community-web/` → `apps/web/`
- `backend/` → `apps/api/`
- `admin-demo/` → `apps/admin/`

本次整理以“路径收口”为主，不在同一轮内强行完成论坛真实联调或后台/API 架构重写。

## 当前核心内容

### 主站
- 路径：`apps/web/`
- 职责：用户首页、论坛入口、安装后面向玩家/社区的 Web 主界面

### 后台
- 路径：`apps/admin/`
- 职责：后台管理界面原型，后续逐步演进为正式后台

### API
- 路径：`apps/api/`
- 职责：邀请绑定、论坛接入、奖励结算等后端契约、样例服务、脚本与 schema

### 论坛
- 路径入口：`services/forum/`
- 当前历史基础设施资产仍位于：`infra/forum/`
- 职责：论坛作为独立服务运行，通过 bridge 与主业务系统衔接

### 规划与联调文档
- `docs/plan/`：架构、里程碑、部署规划
- `docs/backend/`：后端/后台能力设计文档
- `docs/integration/`：联调、验证、执行结果文档

## 一键部署入口

### 启动命令

```bash
cd /home/yinan/.openclaw/workspace/GameMulti
bash infra/deploy/up.sh
```

### 前置条件

- 已安装 `docker` 与 `docker compose`
- 已回填 `infra/compose/.env`
- `WEB_SOURCE_DIR` 必须指向真实仓库内前端目录，例如 `/home/yinan/.openclaw/workspace/GameMulti/apps/web`

### 最少必填变量

```env
APP_NAME=gamemulti
NODE_ENV=development
WEB_SOURCE_DIR=/home/yinan/.openclaw/workspace/GameMulti/apps/web
WEB_PORT=3301
FORUM_BASE_URL=http://192.168.110.218:3000
HOST_HTTP_PORT=8080
```

### 默认支持范围

- 默认启动 `web + nginx`
- `postgres`、`redis` 为可选 profile，默认不启动
- 适用于本地开发/验收环境的一键拉起与复核

### 手工回填项

- `WEB_SOURCE_DIR`：改成目标机器上的真实源码目录
- `HOST_HTTP_PORT`：如 8080 被占用，改成空闲端口
- `FORUM_BASE_URL`：改成实际论坛入口
- 如需数据库/缓存：补齐 `POSTGRES_*` 并按需启用 `data` profile

### 已知限制

- 当前 `web` 服务以开发模式启动，首次 `npm install` 较慢
- 当前默认不覆盖生产构建、HTTPS 证书、systemd 托管和论坛并入同一入口脚本
- 如果宿主机已有其他服务占用 `HOST_HTTP_PORT`，HTTP 复核可能受宿主机级代理或端口转发影响

### 回滚与排障

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
- 再看 `docker logs gamemulti-web --tail 200` 与 `docker logs gamemulti-nginx --tail 100`
- 若容器内正常但宿主机访问异常，优先检查 `HOST_HTTP_PORT` 占用与宿主机转发链路

### 详细文档与现场验证记录

- `docs/deployment/one_click_deploy.md`
- `docs/deployment/one_click_deploy_validation.md`
- `tasks/现场验证一键部署链路并补使用文档_711280/`

## 下一步方向

1. 收口主站部署与访问入口
2. 完善统一云部署结构（compose / nginx / deploy / env）
3. 推进论坛真实 SSO bridge 与后台联调
4. 继续把后台/API/安装流程按既定结构演进

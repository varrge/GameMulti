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

## 下一步方向

1. 收口主站部署与访问入口
2. 完善统一云部署结构（compose / nginx / deploy / env）
3. 推进论坛真实 SSO bridge 与后台联调
4. 继续把后台/API/安装流程按既定结构演进

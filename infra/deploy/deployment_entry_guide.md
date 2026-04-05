# 任意云服务器部署骨架收口与默认回填说明

## 目标

这份文档把当前已经沉淀的部署材料收口成一份 **任意云服务器 / 自托管环境** 可直接参考的部署入口说明，串联：

- compose / 服务编排
- Nginx / 网关反向代理
- deploy 脚本
- GitHub Actions 自动部署
- `.env.example` 与 secrets 生成
- 默认值、自动生成项、必须人工回填项

目标不是绑定某一台现网机器，而是给出一条从**空白云服务器**到**可启动部署骨架**的最短路径。

---

## 1. 已有资产怎么收口

基于当前工作区已有交付，可以直接复用的材料包括：

### 1.1 论坛 SSO 模板与回填规范
- `tasks/forum_sso_template_ce2479/forum_sso_bridge_template.md`
- `tasks/forum_sso_template_ce2479/forum_sso_post_deploy_checklist.md`

用途：
- 统一论坛 SSO 变量名
- 明确部署后核验项
- 明确最少人工回填项

### 1.2 secrets 生成与变量模板
- `tasks/gha_deploy_secrets_f51af0/generate_deploy_secrets.py`
- `tasks/gha_deploy_secrets_f51af0/.env.example`
- `tasks/gha_deploy_secrets_f51af0/deploy_secrets_template.md`

用途：
- 自动生成强随机 secret
- 区分自动生成项与人工回填项
- 为服务器 `.env` / CI secrets 提供基础模板

### 1.3 论坛部署与持久化边界
- `tasks/forum_compose_persistence_plan_b0d3be/delivery_summary.md`
- `tasks/forum_bridge_boundary_7c5545/delivery_summary.md`
- `tasks/forum_real_deploy_ed9b77/delivery_summary.md`

用途：
- 明确论坛作为独立服务单元纳入统一部署
- 明确 postgres / redis / discourse shared data 的持久化职责
- 明确论坛真实联调前置

### 1.4 双环境反代与自动部署的当前状态
- `tasks/nginx_dual_env_d5d349/delivery_summary.md`
- `tasks/gha_deploy_secrets_f51af0/delivery_summary.md`

用途：
- 说明当前还缺少特定项目仓库与域名基线
- 但不影响先沉淀一份“通用云服务器部署骨架入口文档”

---

## 2. 从空白云服务器到可启动环境的最短路径

下面这条路径尽量不依赖单一机器信息，适合作为部署入口。

### 第一步：准备云服务器基础环境

最少需要：
- 一台 Linux 云服务器（Ubuntu / Debian 系优先）
- 一个可 SSH 登录的部署用户
- 已开放 80 / 443（如需要公网访问）
- 已安装基础工具：`git`、`curl`、`docker`、`docker compose`

建议额外准备：
- `openssl`
- `python3`
- 反向代理所需 `nginx`
- systemd 或其他进程托管能力

### 第二步：准备部署目录

建议统一收口到类似目录：

```text
/opt/<app-name>/
  current/
  releases/
  shared/
  env/
  nginx/
  scripts/
```

如果需要区分环境：

```text
/opt/<app-name>/
  staging/
    app/
    forum/
    env/
  prod/
    app/
    forum/
    env/
```

### 第三步：准备最小环境变量文件

以 `tasks/gha_deploy_secrets_f51af0/.env.example` 为底，复制出真实 `.env`：

```bash
cp .env.example .env
```

然后：
1. 用 `generate_deploy_secrets.py` 生成随机 secret
2. 把生成结果写入 `.env`
3. 手工回填真实域名、IP、SMTP、SSH、外部平台密钥

### 第四步：准备服务编排骨架

建议至少拆成以下服务单元：

- `web`：主站前端
- `api`：后端 API
- `forum`：论坛本体（如 Discourse）
- `postgres`：数据库
- `redis`：缓存 / 队列
- `nginx`：统一入口

如果论坛暂时保持独立编排，也建议目录上单独收口，而不是散落：

```text
infra/deploy/
  compose.base.yml
  compose.staging.yml
  compose.prod.yml
  forum/
    compose.yml
    env.example
```

### 第五步：先本机启动，再接反代

顺序建议：
1. 先确保 compose 启动正常
2. 再确认主站/API/论坛各自本地端口可达
3. 再接 Nginx / gateway 对外暴露
4. 最后再接 GitHub Actions 或自动部署

### 第六步：部署后按检查清单验证

至少检查：
- 主站入口是否可打开
- API 健康检查是否正常
- 论坛是否可访问且已完成初始化
- 论坛 SSO 路由 / secret / callback 是否一致
- 数据目录或命名卷是否挂到正确位置

---

## 3. 推荐部署骨架

### 3.1 目录骨架

```text
infra/deploy/
  compose.base.yml
  compose.staging.yml
  compose.prod.yml
  env/
    app.staging.env
    app.prod.env
    forum.staging.env
    forum.prod.env
  nginx/
    staging.conf
    prod.conf
  scripts/
    deploy_staging.sh
    deploy_prod.sh
  forum/
    compose.yml
    env.example
```

### 3.2 职责划分

| 层 | 负责内容 |
| --- | --- |
| Nginx / gateway | 域名入口、HTTPS、反代路由 |
| web | 主站页面与静态资源 |
| api | 业务接口、SSO 路由、后台逻辑 |
| forum | 论坛站点本体 |
| postgres | 主数据 |
| redis | 缓存、任务、临时状态 |
| env / secrets | 配置与敏感项注入 |
| scripts / CI | 部署执行入口 |

### 3.3 论坛相关持久化骨架

建议至少隔离：

```text
/opt/<app-name>/
  staging/
    forum/
      postgres/
      redis/
      discourse_shared/
  prod/
    forum/
      postgres/
      redis/
      discourse_shared/
```

或命名卷：
- `<app>_forum_pg_staging`
- `<app>_forum_redis_staging`
- `<app>_forum_shared_staging`
- `<app>_forum_pg_prod`
- `<app>_forum_redis_prod`
- `<app>_forum_shared_prod`

---

## 4. 默认值、自动生成项、人工回填项

## 4.1 建议保留默认值的项目

这些值建议默认不改，减少环境切换时的噪音：

### 通用应用类
- 服务名：`web`、`api`、`postgres`、`redis`、`forum`
- 常见反代入口：
  - 主站 `/`
  - API `/api`
  - 论坛独立域名或独立入口

### 论坛 SSO 类
- `FORUM_SSO_LOGIN_PATH=/api/forum/sso/login`
- `FORUM_SSO_CALLBACK_PATH=/api/forum/sso/callback`
- `FORUM_SSO_HEALTH_PATH=/api/forum/sso/health`
- `FORUM_SSO_CONSUME_PATH=/session/sso_login`
- `FORUM_SSO_EXTERNAL_UID_FIELD=external_id`
- `FORUM_SSO_MATCH_BY=email`
- `FORUM_SSO_NONCE_TTL_SECONDS=300`
- `FORUM_SSO_CLOCK_SKEW_SECONDS=60`
- `FORUM_SSO_ENABLE_DEBUG=false`

### 变量模板类
- `DB_PORT=5432`
- `REDIS_PORT=6379`
- `SMTP_PORT=587`
- `DEPLOY_SSH_PORT=22`

## 4.2 可自动生成的项目

这些值不应成为部署阻塞，可由脚本生成：

- `APP_SECRET`
- `JWT_SECRET`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `CSRF_SECRET`
- `INTERNAL_API_TOKEN`
- `WEBHOOK_SIGNING_SECRET`
- `DB_PASSWORD`
- `REDIS_PASSWORD`
- `ADMIN_BOOTSTRAP_PASSWORD`
- `FORUM_SSO_SHARED_SECRET`

推荐命令：

```bash
python3 generate_deploy_secrets.py --app-name myapp > .env.generated
```

## 4.3 必须人工回填的项目

这些值依赖真实部署环境，必须人工填写：

| 类别 | 变量 |
| --- | --- |
| 域名 / 地址 | `PUBLIC_BASE_URL`、`APP_BASE_URL`、`API_BASE_URL`、`FORUM_BASE_URL`、`SERVER_PUBLIC_IP` |
| SSH / 部署目标 | `DEPLOY_SSH_HOST`、`DEPLOY_SSH_PORT`、`DEPLOY_SSH_USER`、`DEPLOY_TARGET_DIR` |
| 邮件 | `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD`、`SMTP_FROM` |
| 数据连接 | `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`REDIS_HOST`、`REDIS_PORT` |
| 外部平台密钥 | `GITHUB_ACTIONS_DEPLOY_KEY`、`THIRD_PARTY_API_KEY` |
| 论坛扩展凭据 | `DISCOURSE_ADMIN_API_KEY`、`DISCOURSE_ADMIN_API_USERNAME` 或等价 bridge 凭据 |

核心原则：
- **域名、IP、账户、外部凭据必须人工确认**
- **高随机 secret 尽量自动生成**
- **默认路径、默认变量名尽量稳定**

---

## 5. compose、Nginx、deploy 脚本、GitHub Actions 怎么串起来

## 5.1 compose 的角色

compose 负责：
- 本地 / 服务器拉起服务
- 统一环境变量注入
- 卷挂载与网络组织
- 健康检查和重启策略

建议：
- 公共部分放 `compose.base.yml`
- 环境差异放 `compose.staging.yml`、`compose.prod.yml`
- 论坛暂时复杂时可单独 `forum/compose.yml`

## 5.2 Nginx 的角色

Nginx / gateway 负责：
- 主站与论坛路由分离
- HTTPS 终止
- 转发到 web / api / forum
- 暴露健康检查入口

建议最小路由原则：
- 主站与论坛优先按域名拆开
- API 路由保持清晰，不与论坛路径混写
- 不把论坛长期挂在复杂多级前缀后面

## 5.3 deploy 脚本的角色

deploy 脚本负责把“人工操作步骤”收口成稳定入口。建议至少包含：

1. 拉取代码 / 制品
2. 校验 `.env` 是否存在
3. 执行 compose build / pull
4. 执行 compose up -d
5. 执行健康检查
6. 输出失败定位提示

示例职责：
- `deploy_staging.sh`：部署 develop / staging
- `deploy_prod.sh`：部署 main / prod

## 5.4 GitHub Actions 的角色

GitHub Actions 负责触发自动化：
- `develop` 推 `staging`
- `main` 推 `prod`
- 注入 CI secrets
- SSH 到服务器执行 deploy 脚本，或上传制品后执行部署

当前工作区还没有特定项目的 workflow 基线，所以这部分先收口为通用约定，而不是硬写假配置。

---

## 6. 任意云服务器部署入口的一页式流程

### 准备阶段
- [ ] 服务器已装 `docker` / `docker compose`
- [ ] 已准备 SSH 部署用户
- [ ] 已创建部署目录
- [ ] 已准备 `.env.example`
- [ ] 已用脚本生成随机 secret
- [ ] 已手工回填域名、IP、SMTP、SSH、第三方凭据

### 编排阶段
- [ ] compose 文件已准备
- [ ] 数据卷 / 持久化目录已绑定
- [ ] forum 的 postgres / redis / shared data 已隔离
- [ ] 端口映射未冲突

### 入口阶段
- [ ] Nginx / gateway 已配置主站与论坛入口
- [ ] HTTPS / 域名解析已就绪
- [ ] API 路由与论坛路由未混淆

### 启动阶段
- [ ] compose 已成功启动
- [ ] 主站可访问
- [ ] API 健康检查通过
- [ ] 论坛可访问
- [ ] 论坛已完成初始化

### 联调阶段
- [ ] SSO secret 已注入
- [ ] callback / consume path 一致
- [ ] 至少一条论坛登录跳转链路可验证
- [ ] 如需要真实同步，Admin API / bridge 凭据已注入

---

## 7. 当前边界与后续补位建议

### 当前已经能沉淀的部分
- 通用部署变量模板
- 强随机 secrets 生成方式
- 论坛 SSO 默认路径和部署后核验清单
- 论坛持久化与独立服务边界
- 从空白服务器到最小可启动环境的标准路径

### 当前还缺真实项、不能硬编的部分
- 具体项目仓库路径
- staging / prod 真实域名
- 真实端口与服务名
- 真实部署介质（SSH / Docker / Compose / systemd / PM2）
- 具体 GitHub Actions workflow 文件内容
- 具体 Nginx 配置模板中的域名与 upstream 名称

### 所以后续最合理的推进顺序
1. 先用这份文档统一部署骨架和回填口径
2. 上游补齐目标仓库、域名、端口、部署方式
3. 再把 `deploy_staging.sh` / `deploy_prod.sh`、`staging.conf` / `prod.conf`、`deploy-*.yml` 真正落文件

---

## 8. 落仓文件清单

本轮建议作为任意云服务器部署入口直接复用的文件：

- `tasks/any_cloud_deploy_entry_edf3ec/deployment_entry_guide.md`
- `tasks/gha_deploy_secrets_f51af0/generate_deploy_secrets.py`
- `tasks/gha_deploy_secrets_f51af0/.env.example`
- `tasks/gha_deploy_secrets_f51af0/deploy_secrets_template.md`
- `tasks/forum_sso_template_ce2479/forum_sso_bridge_template.md`
- `tasks/forum_sso_template_ce2479/forum_sso_post_deploy_checklist.md`
- `tasks/forum_compose_persistence_plan_b0d3be/delivery_summary.md`

这套材料已经够作为“任意云服务器部署骨架入口文档 + 回填说明”使用；等真实仓库基线补齐，再继续往可执行 Nginx / deploy / workflow 文件落地。

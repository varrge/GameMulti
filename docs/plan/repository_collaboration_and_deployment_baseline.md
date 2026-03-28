# 仓库协作规范与环境 / 部署基线

## 1. 目标

本文档用于给 GameMulti 项目建立一套可直接执行的协作与交付基线，覆盖：

- 仓库拆分建议与职责边界
- `main` / `develop` / `feature` 分支策略
- Commit / Pull Request 规范
- 环境分层与配置管理原则
- 开发、测试、预发、生产部署基线
- CI/CD 与发布回滚建议

目标不是一开始把流程做得很重，而是先建立一个可审计、可协作、可迭代的最低可用工程规范，避免项目一启动就陷入“大家都能改、但没人知道怎么稳定交付”的状态。

---

## 2. 仓库协作范围建议

当前仓库 `GameMulti` 更适合作为项目规划与总览仓库，短期内建议承担以下职责：

- 沉淀产品、架构、数据库、接口、Roadmap 等规划文档
- 沉淀跨仓库共享规范（协作、发布、环境、监控、接口约定）
- 记录阶段性决策与里程碑结论

不建议把所有代码长期都堆在本仓库中。随着开发推进，建议逐步拆成职责清晰的代码仓库。

### 2.1 推荐仓库拆分

优先建议如下：

1. `gamemulti-docs` 或保留当前 `GameMulti`
   - 项目规划、技术规范、跨团队约定
2. `gamemulti-web`
   - 主站前端（官网、用户中心、钱包、商城、绑定页）
3. `gamemulti-api`
   - 主站后端（认证、绑定、钱包、订单、Admin API）
4. `gamemulti-forum-infra`
   - Discourse 部署、SSO 对接脚本、论坛运维脚本
5. `gamemulti-game-sdk`
   - 插件接入协议、签名规范、公共 DTO / 示例
6. `gamemulti-plugin-minecraft`
   - Minecraft PoC 插件
7. 后续按游戏扩展独立插件仓库
   - `gamemulti-plugin-rust`
   - `gamemulti-plugin-fivem`
8. `gamemulti-devops`
   - Docker Compose、环境模板、CI/CD、监控、部署脚本

### 2.2 短期现实做法

如果当前团队人手有限，短期可以先不急着拆太多仓库，建议采用“两层结构”：

- 规划仓库：当前 `GameMulti`
- 业务代码仓库：后续单独初始化 `web` / `api` / `devops`

这样既能保持规划文档稳定，又能避免业务代码和方案文档混在一起不断冲突。

---

## 3. 分支策略

建议采用轻量版 Git Flow，核心分支如下：

- `main`：生产稳定分支
- `develop`：日常集成分支
- `feature/*`：功能开发分支
- `fix/*`：普通缺陷修复分支
- `hotfix/*`：线上紧急修复分支
- `release/*`：预发布冻结分支（项目进入多人并行发布后启用）

### 3.1 `main`

用途：

- 始终保持“可发布”状态
- 仅允许通过 Pull Request 合并
- 每次合并都对应一个明确版本或阶段性交付

约束：

- 禁止直接 push
- 必须通过 CI 校验
- 必须保留 tag 或版本标记

### 3.2 `develop`

用途：

- 日常开发集成分支
- 多个功能在这里汇总联调

约束：

- 功能开发从 `develop` 拉分支
- 合并回 `develop` 前必须完成最基本的自测与 CI
- 若功能未完成但需要持续集成，使用 feature flag 或草稿 PR 控制，不要直接把半成品逻辑暴露到默认流程

### 3.3 `feature/*`

命名建议：

- `feature/invite-register`
- `feature/binding-session-api`
- `feature/minecraft-plugin-poc`

规则：

- 一条分支只做一个相对单一的目标
- 小步提交，避免一个分支同时改前端、后端、部署、文档的大杂烩
- 完成后通过 PR 合并回 `develop`

### 3.4 `fix/*`

用于：

- 非线上紧急问题
- 开发或测试阶段发现的问题修复

示例：

- `fix/wallet-transaction-filter`
- `fix/binding-token-expiration`

### 3.5 `hotfix/*`

用于：

- 生产环境紧急修复
- 从 `main` 拉出，修复后同时回合到 `main` 与 `develop`

示例：

- `hotfix/login-session-leak`
- `hotfix/plugin-signature-validation`

### 3.6 `release/*`（可选）

当项目进入多人协作、需要预发冻结时启用：

- `release/0.1.0`
- `release/2026-04-mvp`

作用：

- 作为预发布联调分支
- 只允许修复发布阻塞问题
- 验证通过后合回 `main` 并打 tag，同时回合 `develop`

---

## 4. 提交规范

建议使用简洁明确的 Conventional Commits 风格，便于日志检索、生成变更记录和自动化发布。

### 4.1 推荐格式

```text
<type>: <summary>
```

常用类型：

- `feat`: 新功能
- `fix`: 修复问题
- `docs`: 文档更新
- `refactor`: 重构
- `test`: 测试补充或修复
- `chore`: 构建、脚本、依赖、杂项维护
- `ci`: CI/CD 调整
- `infra`: 环境、部署、监控、容器相关改动

### 4.2 示例

```text
docs: add repository collaboration and deployment baseline
feat: implement binding session query api
fix: correct wallet settlement idempotency check
infra: add docker compose for staging stack
ci: add pull request validation workflow
```

### 4.3 提交粒度要求

- 一个 commit 尽量表达一个完整且可理解的改动
- 不要把格式化噪音、重命名、功能修改混在同一个 commit
- 文档更新与代码更新如果强相关可以放一起；如果是独立规范整理，单独提交更清晰

---

## 5. Pull Request 协作规范

### 5.1 PR 最低要求

每个 PR 至少说明：

1. **背景 / 目标**：为什么要改
2. **改动范围**：改了哪些模块
3. **验证方式**：本地怎么验证、跑了哪些测试
4. **风险说明**：可能影响什么
5. **回滚方式**：出问题怎么退回

### 5.2 PR 大小建议

- 优先小 PR，避免一次上千行混改
- 超过 500 行逻辑改动的 PR，原则上需要拆分
- 若确实无法拆，必须在描述中标清阅读路径

### 5.3 Review 规则建议

- 关键分支（`main` / `develop`）合并前至少 1 人 Review
- 涉及数据库迁移、认证、安全、支付/账本、封禁逻辑时，建议 2 人 Review
- Review 关注点：正确性、边界条件、可维护性、风险与回滚，而不是只看代码风格

### 5.4 合并策略

建议：

- 默认使用 **Squash Merge** 保持主干历史清晰
- 对需要保留详细提交轨迹的复杂分支，可使用 Merge Commit
- 非必要不建议 Rebase Merge 作为团队默认策略，避免协作成员理解成本过高

---

## 6. 环境分层基线

建议至少分 4 层环境：

- `local`：开发者本地环境
- `dev`：共享开发环境
- `staging`：预发/验收环境
- `prod`：生产环境

### 6.1 local

用途：

- 日常开发、自测、接口联调

建议：

- 使用 Docker Compose 一键拉起 PostgreSQL / Redis / Mock 服务
- 支持 `.env.example` + `.env.local`
- 不连接真实生产数据

### 6.2 dev

用途：

- 团队共享联调环境
- 前后端与插件基础联调

建议：

- 可自动部署 `develop` 最新通过版本
- 允许较频繁更新
- 配置基础日志和健康检查

### 6.3 staging

用途：

- 验收、回归测试、发布前检查

建议：

- 尽量接近生产拓扑
- 使用独立数据库与 Redis
- 使用与生产一致的镜像构建流程
- 执行数据库迁移演练、发布演练、回滚演练

### 6.4 prod

用途：

- 正式生产

要求：

- 严格权限隔离
- 禁止直接手工改配置
- 所有部署动作可审计
- 发布前必须有备份或可回滚方案

---

## 7. 配置与密钥管理原则

### 7.1 配置分层

建议按以下方式管理：

- 代码内仅保留默认非敏感配置
- 环境差异通过环境变量注入
- 敏感信息放 Secret 管理系统或 CI/CD Secret 中

### 7.2 必备文件

每个代码仓库至少提供：

- `.env.example`
- `README.md` 中的变量说明
- 必要时补充 `docs/env.md`

### 7.3 禁止事项

- 禁止把数据库密码、JWT Secret、论坛 SSO Secret、插件密钥直接写进仓库
- 禁止把生产 `.env` 上传到 Git
- 禁止多个环境共用同一套密钥

### 7.4 命名建议

例如：

- `APP_ENV=local|dev|staging|prod`
- `DATABASE_URL=`
- `REDIS_URL=`
- `JWT_SECRET=`
- `DISCOURSE_SSO_SECRET=`
- `PLUGIN_SIGNING_SECRET=`
- `SENTRY_DSN=`

---

## 8. 开发与部署基线

## 8.1 本地开发基线

推荐要求：

- Node.js LTS（建议 22 LTS 或团队统一版本）
- pnpm / npm 统一一种包管理器，不混用
- PostgreSQL 16+
- Redis 7+
- Docker / Docker Compose

本地最小启动目标：

- 一条命令拉起依赖服务
- 一条命令启动应用
- 一条命令跑测试 / lint

示例（按未来代码仓库落地）：

```bash
docker compose up -d
pnpm install
pnpm dev
pnpm test
```

## 8.2 开发环境部署基线

建议：

- 采用容器化部署
- 每个服务具备健康检查接口
- 日志输出到 stdout/stderr，便于统一采集
- 反向代理统一入口（如 Nginx / Traefik）

基础服务建议：

- Web / API
- PostgreSQL
- Redis
- Discourse（独立编排或独立主机）
- 对象存储（如后续需要头像、附件）

## 8.3 预发 / 生产部署基线

建议优先选择两种之一：

1. **Docker Compose 起步**
   - 适合早期 MVP、小团队
   - 成本低，易落地
2. **Kubernetes / Nomad 等编排**
   - 适合后期服务增多、弹性需求提高后演进

MVP 阶段建议先走 Docker Compose / 单机或少量节点方案，但提前保留以下工程习惯：

- 服务无状态优先
- 配置环境化
- 镜像构建标准化
- 数据卷与备份独立管理

---

## 9. CI/CD 基线建议

### 9.1 CI 最低要求

每次 PR 至少自动执行：

- 依赖安装
- 代码格式检查
- lint
- 单元测试
- 构建验证

若是后端仓库，还应补充：

- Prisma schema / migration 校验
- OpenAPI 或 DTO 变更检查（如果有）

若是插件仓库，还应补充：

- 协议兼容性检查
- 核心命令流程测试

### 9.2 CD 建议

- `develop` 合并后可自动部署到 `dev`
- `main` tag 或 release 合并后部署到 `staging`
- `staging` 验收通过后再手动批准发布到 `prod`

### 9.3 发布原则

- 生产发布默认保留人工确认闸门
- 数据库迁移与应用发布要有先后顺序设计
- 对破坏性变更采用 expand / migrate / contract 模式，避免一次性硬切

---

## 10. 数据与回滚基线

### 10.1 数据库变更原则

- 所有表结构变更必须通过 migration 管理
- 禁止直接在线上手工改表作为常规流程
- 迁移脚本要能在 staging 先验证

### 10.2 备份建议

至少做到：

- PostgreSQL 每日自动备份
- 关键发布前额外备份一次
- 保留最近 7~14 天可恢复备份
- 定期抽样恢复演练

### 10.3 回滚策略

发布文档中必须明确：

- 镜像回滚方式
- 数据库是否可回滚
- 如果数据库不可逆，如何通过兼容代码兜底
- 论坛 / 插件 / API 是否需要联动回退

---

## 11. 监控、日志与告警基线

MVP 阶段不要等出事故后再补监控，至少需要以下最小集合：

### 11.1 健康检查

每个服务至少提供：

- 存活检查（liveness）
- 就绪检查（readiness）
- 基础依赖探测（数据库 / Redis 可选）

### 11.2 日志

要求：

- 使用结构化日志优先（JSON 更佳）
- 请求链路带 request id / trace id
- 关键动作记录审计日志：登录、绑定确认、金币结算、订单发货、封禁操作、管理员操作

### 11.3 指标

至少关注：

- 服务可用性
- 接口错误率
- 响应时间
- 队列积压
- 数据库连接数
- 插件心跳异常数

### 11.4 告警

至少配置：

- API 大面积 5xx
- 数据库不可达
- Redis 不可达
- 插件心跳中断
- 关键异步任务持续失败

---

## 12. 团队协作建议

### 12.1 文档先行的场景

以下变更建议先补文档再开工：

- 认证方案调整
- 数据库核心模型变更
- 插件协议变更
- 钱包/账本规则变更
- 封禁范围与联动机制变更
- 论坛 SSO 方案调整

### 12.2 跨团队接口协作

前端、后端、插件团队协作时，建议以以下顺序推进：

1. 先确认接口边界文档
2. 再补请求/响应示例
3. 再各自实现 mock / contract
4. 最后联调

### 12.3 Definition of Done 建议

一个子任务完成，至少满足：

- 代码或文档已提交到目标仓库
- 自测完成并有验证说明
- 相关文档同步更新
- 风险与后续事项已说明
- 能被下一个角色直接接手

---

## 13. 当前阶段建议结论

结合 GameMulti 当前仍处于规划阶段，建议立刻执行以下最小协作策略：

1. 当前规划仓库继续以 `main` 为稳定文档分支维护
2. 后续代码仓库默认启用 `main` + `develop` + `feature/*` 模式
3. 统一采用 Conventional Commits 简化提交历史
4. 本地与开发环境优先走 Docker Compose
5. 生产发布保留人工审批，不做全自动直发
6. 所有新仓库创建时必须同步补：
   - `README.md`
   - `.env.example`
   - 基础健康检查
   - CI 校验流程
   - 部署与回滚说明

这样可以在不显著增加团队负担的前提下，把后续开发、联调、部署和发布的基本秩序先立住。

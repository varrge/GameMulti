# GameMulti 团队 Git 协作与提交流程规范

## 1. 目标

从当前阶段开始，GameMulti 项目统一采用：

- 单一目标仓库
- `main` 稳定分支
- `develop` 日常集成分支
- `feature/*` 任务功能分支
- PR / MR 审查合并

该规范适用于前端、后端、插件、Admin、运维与文档型实现任务。

---

## 2. 分支约定

### `main`
用于保存相对稳定、可交付、可回滚的内容。

规则：
- 不允许实现型任务直接推送到 `main`
- 只允许经过集成验证后的内容进入 `main`
- 文档类快速落库也应优先走 `develop`，除非明确要求直接落 `main`

### `develop`
用于日常集成。

规则：
- 所有任务从 `develop` 拉分支
- 所有子任务成果优先合并到 `develop`
- 阶段稳定后，再统一从 `develop` 合并到 `main`

### `feature/<task-name>`
用于单个子任务开发。

示例：
- `feature/invite-binding-runtime`
- `feature/poc-plugin-minecraft`
- `feature/wallet-settlement-service`
- `feature/admin-basic-ui`

规则：
- 一个子任务对应一个 feature 分支
- 不同子任务不要共用一个 feature 分支
- 分支命名应尽量与任务内容一致

### `fix/<issue-name>`
用于普通问题修复。

### `hotfix/<issue-name>`
用于生产环境紧急修复。

---

## 3. 标准开发流程

### 步骤 1：从 `develop` 拉取最新内容

```bash
git checkout develop
git pull origin develop
```

### 步骤 2：创建任务分支

```bash
git checkout -b feature/<task-name>
```

### 步骤 3：在任务分支开发

要求：
- 代码改动集中在当前任务范围内
- 不夹带无关重构
- 同步更新必要文档

### 步骤 4：提交 commit

提交信息建议：
- `feat: add invite binding runtime flow`
- `feat: add poc minecraft plugin skeleton`
- `fix: correct wallet settlement idempotency`
- `docs: update admin workflow guide`

### 步骤 5：推送分支

```bash
git push origin feature/<task-name>
```

### 步骤 6：发起 PR / MR 到 `develop`

PR / MR 描述至少包含：
- 任务名称
- 目标
- 改动路径
- 验证方式
- 风险说明

### 步骤 7：审查通过后合并到 `develop`

### 步骤 8：阶段稳定后从 `develop` 合并到 `main`

---

## 4. 任务交付必须附带的信息

从现在开始，所有子任务交付摘要至少要包含：

1. **目标仓库**
2. **分支名**
3. **commit hash**
4. **改动路径**
5. **验证方式**
6. **是否已发起 PR / MR**

推荐交付模板：

```markdown
- 仓库：GameMulti
- 分支：feature/invite-binding-runtime
- commit：abc1234
- 改动路径：backend/, docs/integration/
- 验证方式：本地脚本 + 手工接口调用
- PR：待创建 / 已创建
```

---

## 5. 与 OpenMOSS 任务系统的配合方式

从现在开始，任务系统中的实现型子任务验收标准统一补充以下要求：

- 必须基于 `develop` 拉取 `feature/*` 分支完成开发
- 交付摘要必须附分支名、commit、路径、验证方式
- 实现型代码不得直接裸推 `main`
- 若任务只涉及文档，也优先走 `feature/* -> develop`，除非有明确特批

---

## 6. 为什么采用这套模式

原因很简单：

1. 当前项目已经进入真实开发阶段，不能继续只靠“任务完成后往仓库堆成果”的松散方式协作
2. 前端、后端、插件、后台会并行推进，必须降低冲突风险
3. `develop` 可以作为阶段集成缓冲层，避免 `main` 被半成品污染
4. 审查、回滚、定位问题都会更清晰

---

## 7. 当前执行建议

### 第一优先
后续第三阶段任务全部切换为：
- 从 `develop` 开 feature 分支
- 提交到 `develop`
- 阶段稳定后汇总到 `main`

### 第二优先
已完成但仍停留在“直接落 main 的文档/骨架成果”，后续如继续演进实现，应从 `develop` 重新衍生功能分支，不再继续直接堆到 `main`。


---

## 8. 第三阶段任务的强制执行口径

从第三阶段开始，下列子任务统一按 `develop + feature/*` 模式执行：

- 推进 PoC 游戏插件到可实机验证版本
- 打通邀请制账户与绑定真实联调闭环
- 实现钱包与结算最小可运行后端服务
- 实现商城与订单最小可运行闭环
- 推进论坛 SSO 到可配置接入版本
- 实现 Admin 可操作界面基础版

### 强制要求

1. **必须从 `develop` 拉分支**
2. **必须使用 `feature/<task-name>` 命名方式**
3. **不得直接把实现型代码推到 `main`**
4. **交付摘要必须写明：分支名、commit、改动路径、验证方式**
5. **若任务处于 review/rework，修复也必须继续在对应 feature 分支完成**

### 推荐分支示例

- `feature/poc-plugin-runtime`
- `feature/invite-binding-runtime`
- `feature/wallet-settlement-runtime`
- `feature/redeem-order-runtime`
- `feature/forum-sso-runtime`
- `feature/admin-basic-ui`

### review / in_progress 任务追加说明

对于当前已经进入 `review` 或 `in_progress` 的第三阶段任务，后续补交与修正也统一按该规则执行：

- 在 `develop` 基础上保持或补建对应 feature 分支
- 后续修订提交继续落在该 feature 分支
- 审查通过后合并到 `develop`
- 阶段稳定后再由 `develop` 合并到 `main`


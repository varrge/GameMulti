# GameMulti 项目 SSH 推送统一方案

## 1. 目的

为避免多人协作时出现 HTTPS / SSH 混用、凭证口径不一致、分支直接推到主干等问题，GameMulti 项目统一采用 **SSH 推送** 与 **`develop` + `feature/*` 分支流程**。

从本说明生效后，执行型任务在交付时默认按以下规则执行，并在交付摘要中补全分支、commit、改动路径、验证方式。

## 2. 统一规则

### 2.1 远端协议

- `origin` 统一使用 SSH 地址
- 推荐格式：`git@github.com:varrge/GameMulti.git`
- 不再使用 `https://github.com/varrge/GameMulti.git` 作为 push 远端

切换命令：

```bash
git remote set-url origin git@github.com:varrge/GameMulti.git
```

检查命令：

```bash
git remote -v
```

预期输出应包含：

```text
origin  git@github.com:varrge/GameMulti.git (fetch)
origin  git@github.com:varrge/GameMulti.git (push)
```

### 2.2 分支流程

统一遵守轻量 Git Flow：

- `main`：稳定 / 发布分支，禁止直接推送
- `develop`：日常集成分支
- `feature/*`：功能开发分支
- `fix/*`：普通修复分支
- `hotfix/*`：线上紧急修复分支

执行型任务默认流程：

1. 先同步 `develop`
2. 从 `develop` 拉出 `feature/*` 或 `fix/*`
3. 在任务分支完成改动与自测
4. 推送任务分支
5. 在交付摘要中写清分支、commit、改动路径、验证方式
6. 后续优先合回 `develop`

示例：

```bash
git checkout develop
git pull --ff-only origin develop
git checkout -b feature/minecraft-plugin-poc
```

### 2.3 命名建议

建议按单一目标命名：

- `feature/invite-register`
- `feature/forum-sso-configurable`
- `feature/minecraft-plugin-poc-runtime-verification`
- `fix/wallet-settlement-idempotency`

要求：

- 一条分支只处理一个相对明确的交付目标
- 不要在同一分支里混做多个不相关模块
- 文档补充可跟随同主题实现一起提交；无关文档整理单独分支

## 3. 交付摘要最低要求

后续 GameMulti 实现型任务提交时，交付摘要至少写清以下四项：

1. **分支名**
2. **commit SHA**
3. **改动路径**（仓库内相对路径）
4. **验证方式**（执行过什么验证、如何复现）

推荐模板：

```text
分支：feature/xxx
commit：abcdef1234567890
改动路径：
- docs/plan/xxx.md
- apps/api/src/modules/xxx.ts
验证方式：
- npm test -- xxx
- 本地按 README 步骤启动后手工验证 xxx
```

如果当前交付仅为文档，也要补充：

- 文档所在路径
- 文档内覆盖了哪些结论
- 如何据此继续执行或复核

## 4. 现阶段落实要求

所有执行成员在 GameMulti 项目中开始新任务前，先自查：

```bash
git remote -v
git branch --show-current
```

开始改动前确认：

- 远端是否已切到 SSH
- 是否从 `develop` 拉出任务分支
- 当前分支是否符合 `feature/*` / `fix/*` / `hotfix/*` 命名规则

提交前确认：

- 是否保留了可审计 commit
- 是否在交付摘要写了分支、commit、路径、验证方式
- 是否优先按 `develop` 汇总，而不是直接往 `main` 推送

## 5. 与现有基线文档的关系

本说明是对协作基线的落地补充，需与以下文档一起执行：

- `docs/plan/repository_collaboration_and_deployment_baseline.md`

其中基线文档定义了整体协作与发布规范；本文档进一步明确了 **GameMulti 当前阶段统一走 SSH 推送与 develop/feature 分支交付** 的具体执行口径。

## 6. 当前核对结论

本次核对发现当前仓库远端仍存在 HTTPS push 口径，说明规则还需要继续落实到执行链路中。后续新增实现型交付应优先按本文档修正后再推进，避免继续出现：

- 用 HTTPS 推送导致身份与凭证不统一
- 直接在非规范分支上开发
- 交付摘要缺少分支 / commit / 路径 / 验证方式

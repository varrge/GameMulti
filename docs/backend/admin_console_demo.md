# Admin 可操作界面基础版（本地演示骨架）

## 这次交付了什么

在 `GameMulti` 仓库内补了一个 **零依赖、可直接本地打开的 Admin 演示页**，用于承接已有的后台接口契约与示例服务：

- `apps/admin/index.html`：Admin 页面入口
- `apps/admin/assets/styles.css`：页面样式
- `apps/admin/assets/app.js`：演示逻辑与假数据

覆盖能力：

1. **玩家查询**
   - 支持按关键词搜索用户名 / 邮箱 / 游戏 ID / 邀请码
   - 支持按状态、游戏类型过滤
   - 支持查看玩家聚合详情（邀请码、绑定列表、预留奖励区块）
2. **邀请码管理**
   - 支持按状态筛选邀请码列表
   - 支持本地模拟批量生成邀请码并追加展示
3. **封禁入口**
   - 提供最小封禁表单与结果反馈区
   - 便于后续接 ban audit / operator log / 实际封禁接口

## 页面与后端契约映射

### 1. 玩家查询页

- 页面入口：`apps/admin/index.html`（默认首屏）
- 页面逻辑：`apps/admin/assets/app.js`
- 对应契约：`apps/api/contracts/admin_player_invites.openapi.yaml`
  - `GET /api/admin/players`
  - `GET /api/admin/players/{userId}`
- 对应后端示例：`apps/api/examples/admin_player_invites_service.js`

### 2. 邀请码管理页

- 页面入口：`apps/admin/index.html` → “邀请码管理” tab
- 页面逻辑：`apps/admin/assets/app.js`
- 对应契约：`apps/api/contracts/admin_player_invites.openapi.yaml`
  - `GET /api/admin/invitation-codes`
  - `POST /api/admin/invitation-codes/generate`
- 对应后端示例：`apps/api/examples/admin_player_invites_service.js`

### 3. 封禁入口

- 页面入口：`apps/admin/index.html` → “封禁入口” tab
- 页面逻辑：`apps/admin/assets/app.js`
- 当前状态：演示骨架，尚未绑定真实后端接口
- 可复用后端基础：`docs/apps/api/wallet_redeem_ban_foundation.md`

## 本地运行方式

这版不依赖任何框架，直接任选一种方式即可：

### 方式 A：直接浏览器打开

直接打开：

```text
apps/admin/index.html
```

### 方式 B：起一个静态文件服务（推荐）

在仓库根目录执行：

```bash
python3 -m http.server 4173
```

然后访问：

```text
http://127.0.0.1:4173/apps/admin/
```

## 适合下一步怎么接

1. 用 React / Vue / Next.js / Vite 任一前端框架替换当前静态骨架
2. 把 `app.js` 中的本地数据替换成真实 API 请求
3. 将封禁入口接到真实封禁接口与审计日志
4. 把奖励结算、钱包、订单等聚合块继续补进详情页

## 验证建议

- 进入“玩家查询”页，搜索 `steve` / `player2@example.com`
- 切到“邀请码管理”页，生成 5 个新邀请码
- 切到“封禁入口”页，输入 `user_2` 测试模拟封禁

## 对应提交

提交完成后可用以下命令查看最新 commit：

```bash
git -C /home/yinan/.openclaw/workspace/GameMulti log --oneline -1
```

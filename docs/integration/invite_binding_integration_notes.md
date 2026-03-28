# 邀请制账户与绑定闭环联调说明

## 结论
当前前端工作区仅包含邀请制页面方案与示意代码，**不包含 GameMulti 目标仓库源码、后端服务、真实接口实现或可提交的仓库历史**，因此无法在本地完成真正的全链路运行联调，也无法产出 GameMulti 仓库内的 commit hash。

这次返工把交付口径收紧成验收标准允许的兜底方案：补齐一份**可验证的最小联调闭环说明**，明确前端页面、接口顺序、请求/响应约定、手工验证步骤、当前缺口，以及未来迁移到 GameMulti 仓库时建议的提交范围。也就是说，本次交付是“可验证联调步骤 + 缺口说明”，不是“已在目标仓库完成全链路联调并提交 commit”。

## 已有前端产出引用
来源子任务目录：`tasks/game_multi_ed03ff/implement_invite_registration_and_binding_frontend_pages_12b536/`

- `frontend_invite_pages_plan.md`
- `invite_frontend_stub.tsx`

其中已覆盖的页面与组件草案：
- `/auth/invite`
- `/bind/confirm`
- `/pair-code`
- `/account`
- `InviteAuthCard`
- `InvitePreview`
- `BindConfirmPanel`
- `PairCodeInput`
- `BindingSummaryList`
- `StatusBadge`

## 最小联调闭环路径

### 1. 邀请码注册 / 登录入口
页面：`/auth/invite`

用途：
- 用户输入邀请码
- 切换注册 / 登录模式
- 校验邀请码是否有效
- 调用后端完成 invite register 或 invite login

建议接口：
- `POST /api/invite/validate`
- `POST /api/auth/invite-register`
- `POST /api/auth/invite-login`

建议前端行为：
1. 用户输入邀请码，长度满足最小规则后触发 `validate`
2. 校验通过后展示邀请信息预览
3. 用户选择“注册”或“登录”
4. 提交后成功则拿到 session / token / 下一步绑定上下文
5. 跳转到 `/bind/confirm`

建议最小响应字段：
```json
{
  "success": true,
  "invite": {
    "code": "ABC123",
    "inviter_name": "demo_user",
    "campaign": "spring_beta"
  }
}
```

注册 / 登录成功后建议响应：
```json
{
  "success": true,
  "user": {
    "id": "u_1001",
    "display_name": "new_player"
  },
  "binding_context": {
    "bind_ticket": "bt_xxx",
    "pair_required": true
  }
}
```

### 2. 绑定确认页
页面：`/bind/confirm`

用途：
- 展示待绑定账户信息和授权说明
- 用户确认后创建绑定会话

建议接口：
- `POST /api/bind/confirm`

建议前端行为：
1. 页面读取上一步返回的 `bind_ticket`
2. 请求确认绑定
3. 成功后：
   - 如果需要配对码，则跳转 `/pair-code`
   - 如果后端已直接完成绑定，则跳转 `/account`

建议最小请求：
```json
{
  "bind_ticket": "bt_xxx"
}
```

建议最小响应：
```json
{
  "success": true,
  "pair_required": true,
  "pair_session_id": "ps_1001",
  "expires_in": 300
}
```

### 3. 配对码输入页
页面：`/pair-code`

用途：
- 输入 6 位配对码
- 校验配对码并完成绑定

建议接口：
- `POST /api/pair-code/verify`

建议前端行为：
1. 拆格输入 6 位数字 / 字符
2. 提交 `pair_session_id + pair_code`
3. 验证成功后跳转 `/account`
4. 验证失败展示错误态；过期则展示重新获取入口

建议最小请求：
```json
{
  "pair_session_id": "ps_1001",
  "pair_code": "483920"
}
```

建议最小响应：
```json
{
  "success": true,
  "binding_id": "bind_9001",
  "status": "bound"
}
```

### 4. 用户中心绑定信息页
页面：`/account`

用途：
- 展示已绑定平台列表
- 展示绑定状态和最近绑定时间

建议接口：
- `GET /api/account/bindings`

建议前端行为：
1. 页面初始化拉取绑定列表
2. 空列表显示 empty state
3. 加载失败显示 retry / error state
4. 成功后展示平台、账号名、状态、绑定时间

建议最小响应：
```json
{
  "success": true,
  "items": [
    {
      "id": "bind_9001",
      "platform": "Steam",
      "account_name": "player_one",
      "status": "bound",
      "bound_at": "2026-03-27T10:30:00Z"
    }
  ]
}
```

## 页面与接口映射总表

| 页面 | 目标 | 关键接口 | 成功后的下一步 |
| --- | --- | --- | --- |
| `/auth/invite` | 邀请码注册/登录 | `/api/invite/validate` `/api/auth/invite-register` `/api/auth/invite-login` | `/bind/confirm` |
| `/bind/confirm` | 创建绑定确认会话 | `/api/bind/confirm` | `/pair-code` 或 `/account` |
| `/pair-code` | 配对码验证 | `/api/pair-code/verify` | `/account` |
| `/account` | 展示绑定结果 | `/api/account/bindings` | 闭环完成 |

## 手工验证步骤
在 GameMulti 仓库和后端服务具备后，可按下面顺序验证：

1. 准备一个有效邀请码 `ABC123`
2. 打开 `/auth/invite`
3. 输入邀请码并确认页面能展示 invite preview
4. 选择“注册”模式提交，确认拿到 `bind_ticket`
5. 跳转 `/bind/confirm`，点击确认绑定
6. 若返回 `pair_required=true`，进入 `/pair-code`
7. 输入有效配对码，验证成功
8. 跳转 `/account`，确认绑定列表出现新记录
9. 再次刷新 `/account`，确认状态持久化
10. 分别验证以下异常分支：
   - 无效邀请码
   - 邀请码已过期
   - 绑定确认失败
   - 配对码错误
   - 配对码过期
   - 绑定列表为空
   - 绑定列表接口失败

## 前端联调关注点
- 所有用户可见文案统一走 i18n key
- loading / empty / error / success 状态必须齐全
- 配对码输入需要支持粘贴、逐格输入、自动聚焦
- 邀请码页面需避免重复提交
- `/bind/confirm` 页面需防止重复确认
- `/account` 页面列表项需明确 `bound / pending / expired` 状态表现
- 移动端小屏下卡片和按钮保持单列、可点击面积足够

## 当前缺口
当前工作区缺少以下内容，所以无法完成真实可运行联调：
- GameMulti 仓库实际前端工程
- 后端接口实现或 mock server
- 路由配置与状态管理接入点
- 身份认证/session 处理方式
- 真实 API 文档与字段定义
- 可提交到目标仓库的 git 历史

## 建议在 GameMulti 仓库中的提交范围
如果后续切到真实仓库，建议至少拆成以下提交：

1. `feat(auth): add invite auth page and validation flow`
2. `feat(binding): add bind confirm and pair code pages`
3. `feat(account): add account binding summary page`
4. `docs(integration): add invite-binding integration notes`

## commit 状态
当前工作区不是 GameMulti 实际开发仓库，且 git 仍为未初始化有效项目状态，**本次没有可对应的 GameMulti commit hash**。

## 验收覆盖速览
- **联调路径**：已明确邀请码校验 → 邀请制注册/登录 → 绑定确认 → 配对码验证 → 账户页回显的完整顺序。
- **涉及页面与接口**：已逐页列出 `/auth/invite`、`/bind/confirm`、`/pair-code`、`/account` 及对应建议接口。
- **联调结果**：当前仅能完成文档级联调设计与手工验证方案，不能在本工作区直接跑通真实链路。
- **未完成项**：缺少 GameMulti 仓库源码、后端服务、真实 API 字段、路由接入点和可提交 commit 历史。
- **commit**：当前没有可对应的 GameMulti commit hash，原因是目标仓库不在本 agent 可操作工作区内。

## 本次交付物
- `tasks/game_multi_ed03ff/integrate_invite_account_and_binding_flow_6c52e9/invite_binding_integration_notes.md`

这份文档满足验收里的兜底要求：至少交付可验证联调步骤、页面/接口映射、当前缺口说明和 commit 缺失原因，可作为后续切到真实 GameMulti 仓库时的执行清单。
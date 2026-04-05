# 论坛 SSO Bridge 部署后验证与环境回填清单

## 适用范围

这份清单面向 **任意云服务器 / 自托管环境** 的论坛 SSO bridge 接入验证，默认以 Discourse 类论坛为例，但不把固定现网地址、固定机器 IP 或单一拓扑当成前提。

适用于下面两类场景：

1. 已经按通用模板部署了论坛、主站/API 与 bridge 配置，需要做部署后核验
2. 需要从模板变量切换到真实环境参数，确认哪些值可默认沿用、哪些必须人工回填

---

## 1. 默认变量名与默认路由约定

### 1.1 建议保留的默认变量名

```env
FORUM_SSO_PROVIDER=discourse
APP_BASE_URL=https://app.example.com
API_BASE_URL=https://api.example.com
FORUM_BASE_URL=https://forum.example.com

FORUM_SSO_LOGIN_PATH=/api/forum/sso/login
FORUM_SSO_CALLBACK_PATH=/api/forum/sso/callback
FORUM_SSO_HEALTH_PATH=/api/forum/sso/health
FORUM_SSO_CONSUME_PATH=/session/sso_login
FORUM_SSO_LOGIN_REDIRECT_PATH=/

FORUM_SSO_EXTERNAL_UID_FIELD=external_id
FORUM_SSO_MATCH_BY=email
FORUM_SSO_NONCE_TTL_SECONDS=300
FORUM_SSO_CLOCK_SKEW_SECONDS=60
FORUM_SSO_ENABLE_DEBUG=false
```

### 1.2 推荐默认路由

| 用途 | 默认值 | 说明 |
| --- | --- | --- |
| 主站发起登录入口 | `/api/forum/sso/login` | 主站为已登录用户生成论坛登录跳转 |
| 主站回调入口 | `/api/forum/sso/callback` | 论坛登录后回跳主站 |
| 主站健康检查 | `/api/forum/sso/health` | 只做配置与依赖自检 |
| 论坛 consume path | `/session/sso_login` | Discourse 常见默认入口 |
| 登录后默认落点 | `/` | 可按业务改成 `/latest` 等 |

### 1.3 推荐 URL 拼接规则

- `forumConsumeUrl = FORUM_BASE_URL + FORUM_SSO_CONSUME_PATH`
- `ssoLoginUrl = API_BASE_URL + FORUM_SSO_LOGIN_PATH`
- `ssoCallbackUrl = API_BASE_URL + FORUM_SSO_CALLBACK_PATH`
- `forumPostLoginRedirect = FORUM_SSO_LOGIN_REDIRECT_URL || (FORUM_BASE_URL + FORUM_SSO_LOGIN_REDIRECT_PATH)`

这样迁移环境时只需要改域名与少量真实值，路径约定本身不用反复改。

---

## 2. 最少人工回填项

下面这些值无法仅靠模板推导，部署到真实环境时必须回填；同时尽量压到最少。

| 变量 | 是否必须人工回填 | 获取方式 | 备注 |
| --- | --- | --- | --- |
| `APP_BASE_URL` | 是 | 按主站实际对外域名/入口填写 | 如 `https://app.example.com` |
| `API_BASE_URL` | 是 | 按 API 实际对外域名/入口填写 | 未分域时可与主站同域 |
| `FORUM_BASE_URL` | 是 | 按论坛实际对外域名/入口填写 | 如 `https://forum.example.com` |
| `FORUM_SSO_SHARED_SECRET` | 是 | 部署时用脚本或随机源生成 | 不进仓库，不同环境分开生成 |
| `FORUM_SSO_BRIDGE_CALLBACK_URL` | 视实现而定 | 若系统不能自动拼接，则填写完整回调 URL | 支持自动拼接时可省略 |
| `FORUM_SSO_LOGIN_REDIRECT_URL` | 否，但建议 | 登录完成后的论坛默认落点 | 未填可退回 `FORUM_BASE_URL + /` |
| `DISCOURSE_ADMIN_API_KEY` 或等价 bridge 凭据 | 若要做真实建号/同步则必须 | 从论坛后台或 bridge 服务发放 | 仅做最小跳转演示时可暂不启用 |
| `DISCOURSE_ADMIN_API_USERNAME` | 若启用 Admin API | 通常为论坛管理员用户名或 system 用户 | 与 API key 配套 |

### 2.1 `FORUM_SSO_SHARED_SECRET` 获取方式

推荐直接部署时生成：

```bash
openssl rand -hex 32
```

或：

```bash
python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
```

要求：
- 至少 32 字节随机值
- staging / prod 分开生成
- 仅保存在服务器 `.env`、密钥平台或 CI secrets 中
- 不写入仓库、截图或文档正文

### 2.2 哪些值通常不需要人工回填

以下项建议保持模板默认值，除非业务确实变更：

- `FORUM_SSO_LOGIN_PATH=/api/forum/sso/login`
- `FORUM_SSO_CALLBACK_PATH=/api/forum/sso/callback`
- `FORUM_SSO_HEALTH_PATH=/api/forum/sso/health`
- `FORUM_SSO_CONSUME_PATH=/session/sso_login`
- `FORUM_SSO_EXTERNAL_UID_FIELD=external_id`
- `FORUM_SSO_MATCH_BY=email`
- `FORUM_SSO_NONCE_TTL_SECONDS=300`
- `FORUM_SSO_CLOCK_SKEW_SECONDS=60`
- `FORUM_SSO_ENABLE_DEBUG=false`

---

## 3. 从模板到真实环境的切换说明

### 阶段 A：模板态
目标：把代码、部署脚本、文档和论坛后台配置口径先统一。

此阶段允许保留：
- 示例域名 `app.example.com / api.example.com / forum.example.com`
- 默认路由值
- example env 文件
- 自动拼接规则

但此阶段 **不代表真实联调已可用**。

### 阶段 B：部署回填态
目标：把模板值替换成真实环境最少必填值。

此阶段至少完成：
1. 回填真实 `APP_BASE_URL`
2. 回填真实 `API_BASE_URL`
3. 回填真实 `FORUM_BASE_URL`
4. 生成并注入 `FORUM_SSO_SHARED_SECRET`
5. 如需要真实用户同步，再补 Admin API key / bridge 凭据

### 阶段 C：真实联调态
目标：验证真实论坛站点已脱离初始化页，且主站到论坛链路能实际回放。

此阶段额外要求：
1. 论坛已完成管理员初始化
2. 论坛后台已录入 shared secret 与相关 SSO 配置
3. 主站 `/api/forum/sso/login`、`/api/forum/sso/callback` 能对外访问
4. 如验收要求含建号/同步，adapter 不再是 stub

---

## 4. 部署后必须检查的项目

下面这些项属于 **部署后必查项**，不能只看“服务启动了”。

### 4.1 服务可访问性

- [ ] 主站地址可打开：`APP_BASE_URL`
- [ ] API 地址可达：`API_BASE_URL`
- [ ] 论坛地址可打开：`FORUM_BASE_URL`
- [ ] 论坛不是 502 / 404 / 证书错误

最小验证示例：

```bash
curl -I "$FORUM_BASE_URL"
```

### 4.2 论坛初始化状态

- [ ] 论坛不再停留在 `finish_installation` 页面
- [ ] 已完成管理员首号创建
- [ ] 能进入论坛后台配置页

> 如果论坛仍停在初始化页，只能证明论坛进程在线，不能证明真实 SSO 已具备可配置条件。

### 4.3 主站 SSO 路由可用性

- [ ] `/api/forum/sso/login` 已部署并能命中正确服务
- [ ] `/api/forum/sso/callback` 已部署并能命中正确服务
- [ ] `/api/forum/sso/health` 可返回配置/依赖检查结果
- [ ] 非生产环境如开启 debug，生产需确认 debug 关闭

### 4.4 URL 拼接与回调一致性

- [ ] 主站生成的 `consumeUrl` 指向真实 `FORUM_BASE_URL + FORUM_SSO_CONSUME_PATH`
- [ ] 论坛后台中登记的 callback 地址与主站实际地址一致
- [ ] 登录成功后的 redirect 与业务预期一致
- [ ] 没有混用内网地址、外网地址和示例域名

### 4.5 Secret 与凭据检查

- [ ] `FORUM_SSO_SHARED_SECRET` 已在双方配置一致
- [ ] staging / prod 未复用同一 secret
- [ ] secret 未写入仓库跟踪文件
- [ ] 若启用了用户同步，Admin API key / bridge 凭据已就位且权限正确

### 4.6 最小真实链路检查

至少应完成以下一条：

- [ ] 浏览器从主站点击“进入论坛”，能够跳转到论坛登录消费入口
- [ ] 论坛登录完成后，能够回到预期页面
- [ ] 如果验收包含用户同步，至少完成一次真实用户映射或资料同步验证

---

## 5. 推荐的部署后检查顺序

按这个顺序查，排障成本最低：

1. **先查论坛站点是否已初始化完成**
2. **再查主站/API 域名与路由是否可访问**
3. **再查 shared secret 与 callback/consume path 是否一致**
4. **再查浏览器跳转链路**
5. **最后再查建号、资料同步、封禁同步等增强能力**

这样可以避免把“论坛本体未准备好”误判成“bridge 代码问题”。

---

## 6. 常见失败信号与判断口径

### 情况 1：论坛返回 `finish_installation`
说明：论坛服务在线，但站点还没进入可配置的真实管理员态。

处理：先完成论坛初始化，再继续配 SSO。

### 情况 2：主站能生成 URL，但浏览器无法完成登录
说明：多数是 shared secret、callback URL、consume path 或论坛后台配置不一致。

优先检查：
- `FORUM_SSO_SHARED_SECRET`
- `FORUM_SSO_CONSUME_PATH`
- `FORUM_SSO_BRIDGE_CALLBACK_URL`
- 论坛后台 SSO 开关与填写内容

### 情况 3：脚本验证通过，但真实建号/同步不工作
说明：多半仍停留在本地主站骨架验证，未真正接上论坛 Admin API / bridge 服务。

优先检查：
- adapter 是否仍为 stub
- Admin API key / 用户名是否缺失
- 论坛侧 bridge 凭据是否未注入

### 情况 4：同一套模板在不同机器表现不一致
说明：大概率混用了示例域名、内网地址、反向代理域名、或环境变量来源不统一。

优先检查：
- `APP_BASE_URL`
- `API_BASE_URL`
- `FORUM_BASE_URL`
- Nginx / gateway 实际对外域名
- 运行时最终加载的是哪份 `.env`

---

## 7. 交付验收时建议附带的证据

为了让 reviewer 可以独立复核，建议交付时至少附：

1. 当前使用的变量清单（脱敏后）
2. 论坛地址 `curl -I` 结果
3. 主站 SSO 健康检查结果
4. 一条真实或准真实的 `consumeUrl` 示例（敏感参数可脱敏）
5. 论坛当前是否已完成初始化的说明
6. 若仍未完成真实登录闭环，要明确卡在论坛初始化、shared secret 配置，还是 Admin API / bridge 凭据

---

## 8. 一页式最小执行清单

### 部署前默认保留
- [ ] 默认路径保持 `/api/forum/sso/login`、`/api/forum/sso/callback`、`/session/sso_login`
- [ ] 模板变量名保持统一
- [ ] 只回填真实域名与最少密钥

### 部署时必须回填
- [ ] `APP_BASE_URL`
- [ ] `API_BASE_URL`
- [ ] `FORUM_BASE_URL`
- [ ] `FORUM_SSO_SHARED_SECRET`
- [ ] 如需要真实用户同步，再补 `DISCOURSE_ADMIN_API_KEY` / 等价 bridge 凭据

### 部署后必须验证
- [ ] 论坛可访问
- [ ] 论坛已完成初始化
- [ ] 主站 SSO 路由可访问
- [ ] secret / callback / consume path 一致
- [ ] 至少完成一次真实跳转链路验证

这份清单的目标很简单：把论坛 SSO bridge 从“模板能看懂”收口到“部署后知道该查什么、该填什么、先后顺序怎么走”。

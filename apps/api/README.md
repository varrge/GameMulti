# GameMulti API

`apps/api` 是 GameMulti 的主业务后端，当前按 NestJS + Prisma + PostgreSQL 落地 MVP 主干。

## 当前范围

已建立：

- NestJS 应用入口
- Prisma 主 schema
- PostgreSQL seed
- 健康检查
- 邀请码校验与后台邀请码查询/生成
- 邀请码注册
- 登录与 Bearer token
- 当前用户查询
- Admin 用户只读查询
- Admin 接口最小权限保护
- 插件 HMAC 签名工具
- 插件创建 binding session
- Web 查询/确认 binding session

暂未实现：

- Discourse 真实 SSO
- 金币结算
- 商城兑换
- 封禁联动
- 完整 Admin 角色/权限管理界面

## 本地环境

复制环境变量：

```bash
cp apps/api/.env.example apps/api/.env
```

关键变量：

```env
APP_SECRET="replace-with-a-long-random-secret"
ADMIN_API_KEY="replace-with-a-long-random-admin-key"
ADMIN_USER_IDS=""
ADMIN_USERNAMES=""
DATABASE_URL="postgresql://gamemulti:changeme@localhost:5432/gamemulti?schema=public"
PORT=3401
```

## Admin 访问

`/api/admin/*` 接口需要满足以下任一条件：

- 请求头带 `X-GM-Admin-Key: <ADMIN_API_KEY>`
- 请求头带普通登录得到的 `Authorization: Bearer <token>`，且用户 id 在 `ADMIN_USER_IDS` 或用户名在 `ADMIN_USERNAMES`

本地 smoke test 默认读取 `ADMIN_API_KEY`，没有设置时使用 `local-dev-admin-key`。

## 常用命令

在仓库根目录：

```bash
npm install
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run prisma:migrate
npm --workspace apps/api run prisma:seed
npm --workspace apps/api run start:dev
```

或使用统一 compose：

```bash
bash infra/deploy/up.sh
```

## 当前 API

健康检查：

```text
GET /api/healthz
```

邀请：

```text
POST /api/invitations/validate
GET  /api/admin/invitations              # admin
POST /api/admin/invitations/batch-create # admin
GET  /api/admin/invitations/:id/usages   # admin
```

认证：

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
```

Admin：

```text
GET /api/admin/users     # admin
GET /api/admin/users/:id # admin
```

绑定：

```text
POST /api/plugin/bindings/session
GET  /api/plugin/bindings/:sessionId # HMAC; only the owning plugin client/server; no token returned
GET  /api/bindings/session/by-token
POST /api/bindings/session/by-pair-code
POST /api/bindings/confirm
GET  /api/me/game-bindings
```

## 插件签名

插件接口需要以下 headers：

```text
X-GM-Client-Key: demo-client
X-GM-Timestamp: <unix seconds>
X-GM-Nonce: <64 lowercase hex chars from 32 random bytes>
X-GM-Signature: <hex hmac sha256>
X-GM-Protocol-Version: 2026-06-mvp
```

`X-GM-Nonce` 在同一插件客户端下只能使用一次。服务端会在允许的时间窗口内记录已使用 nonce，重复请求返回 `409 NONCE_REPLAY`。协议版本必须与凭证和 `PLUGIN_PROTOCOL_VERSIONS` 匹配，否则返回 `426 PROTOCOL_UNSUPPORTED`。待审核服务器返回 `403 SERVER_PENDING_APPROVAL`，blocked/disabled 返回 `403 SERVER_BLOCKED`，凭证或签名错误返回 `401 AUTHENTICATION_FAILED`。插件错误体固定为 `{ code, message, retryable, requestId, serverTime?, details? }`。

创建绑定时还必须在 JSON body 中包含 8-128 字符 `requestId`。响应丢失后以相同 `requestId`、新 timestamp 和新 nonce 重试；相同 client 的同一键返回原会话，而不同请求内容复用该键返回 `409 IDEMPOTENCY_CONFLICT`。

签名 payload：

```text
METHOD
PATH_WITHOUT_QUERY
TIMESTAMP
NONCE
SHA256_HEX(BODY)
```

`SHA256_HEX(BODY)` 必须基于实际发送的 UTF-8 请求字节计算。服务端保留原始 body 并直接验签，不会对解析后的 JSON 重新序列化；GET 状态查询使用空 body 的 SHA-256。

seed 默认插件凭据：

```text
client_key=demo-client
client_secret=demo-secret
```

插件共享密钥不会以明文写入数据库。seed 会用 `APP_SECRET` 派生出的 AES-GCM key 加密 `demo-secret` 后存入 `server_plugin_clients.clientSecretHash`；该字段保留历史命名，内容实际为 `enc:v1:...` 加密载荷。旧的明文值仍可被读取，用于本地数据平滑过渡。

## 验收示例

使用 seed 邀请码注册：

```bash
curl -X POST http://127.0.0.1:3401/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","email":"alice@example.com","password":"password123","inviteCode":"ABCD1234"}'
```

登录：

```bash
curl -X POST http://127.0.0.1:3401/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"alice","password":"password123"}'
```

当前用户：

```bash
curl http://127.0.0.1:3401/api/me \
  -H 'Authorization: Bearer <token>'
```

创建绑定 session 的签名示例：

```bash
BODY='{"requestId":"bind-request-001","serverCode":"cn-mc-01","gameCode":"minecraft","platform":"java","gameUserId":"uuid-demo","displayName":"Steve","bindMode":"bind_existing"}'
TS=$(date +%s)
NONCE=$(openssl rand -hex 32)
SIG=$(BODY="$BODY" TS="$TS" NONCE="$NONCE" node -e "const crypto=require('crypto'); const body=process.env.BODY; const payload=['POST','/api/plugin/bindings/session',process.env.TS,process.env.NONCE,crypto.createHash('sha256').update(body).digest('hex')].join('\n'); console.log(crypto.createHmac('sha256','demo-secret').update(payload).digest('hex'))")
curl -X POST http://127.0.0.1:3401/api/plugin/bindings/session \
  -H 'Content-Type: application/json' \
  -H 'X-GM-Client-Key: demo-client' \
  -H "X-GM-Timestamp: $TS" \
  -H "X-GM-Nonce: $NONCE" \
  -H "X-GM-Signature: $SIG" \
  -H 'X-GM-Protocol-Version: 2026-06-mvp' \
  -d "$BODY"
```

查询并确认绑定：

```bash
curl 'http://127.0.0.1:3401/api/bindings/session/by-token?token=<token>'

curl -X POST http://127.0.0.1:3401/api/bindings/confirm \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token-from-login>' \
  -d '{"sessionId":"<sessionId>"}'
```

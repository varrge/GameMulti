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
- 插件 HMAC 签名工具
- 插件创建 binding session
- Web 查询/确认 binding session

暂未实现：

- Discourse 真实 SSO
- 金币结算
- 商城兑换
- 封禁联动
- Admin 角色权限

## 本地环境

复制环境变量：

```bash
cp apps/api/.env.example apps/api/.env
```

关键变量：

```env
APP_SECRET="replace-with-a-long-random-secret"
DATABASE_URL="postgresql://gamemulti:changeme@localhost:5432/gamemulti?schema=public"
PORT=3401
```

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
GET  /api/admin/invitations
POST /api/admin/invitations/batch-create
GET  /api/admin/invitations/:id/usages
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
GET /api/admin/users
GET /api/admin/users/:id
```

绑定：

```text
POST /api/plugin/bindings/session
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
X-GM-Nonce: <random nonce>
X-GM-Signature: <hex hmac sha256>
```

签名 payload：

```text
METHOD
PATH_WITHOUT_QUERY
TIMESTAMP
NONCE
SHA256_HEX(BODY)
```

seed 默认插件凭据：

```text
client_key=demo-client
client_secret=demo-secret
```

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
BODY='{"serverCode":"cn-mc-01","gameCode":"minecraft","platform":"java","gameUserId":"uuid-demo","displayName":"Steve","bindMode":"bind_existing"}'
TS=$(date +%s)
NONCE=$(openssl rand -hex 8)
SIG=$(BODY="$BODY" TS="$TS" NONCE="$NONCE" node -e "const crypto=require('crypto'); const body=process.env.BODY; const payload=['POST','/api/plugin/bindings/session',process.env.TS,process.env.NONCE,crypto.createHash('sha256').update(body).digest('hex')].join('\n'); console.log(crypto.createHmac('sha256','demo-secret').update(payload).digest('hex'))")
curl -X POST http://127.0.0.1:3401/api/plugin/bindings/session \
  -H 'Content-Type: application/json' \
  -H 'X-GM-Client-Key: demo-client' \
  -H "X-GM-Timestamp: $TS" \
  -H "X-GM-Nonce: $NONCE" \
  -H "X-GM-Signature: $SIG" \
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

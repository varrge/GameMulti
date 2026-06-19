<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# GameMulti Web

主站前端基于 Next.js 15，当前包含首页、账号入口、游戏绑定入口、论坛入口收口页，以及 Docker 部署说明。

View your app in AI Studio: https://ai.studio/apps/acefc054-1255-4eea-8e35-2f02298f5c56

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy environment template and fill secrets:
   `cp .env.example .env.local`
3. Set the `GEMINI_API_KEY` in `.env.local`
4. 按真实环境填写 API 与论坛入口：
   - `NEXT_PUBLIC_API_BASE_URL`
   - `NEXT_PUBLIC_FORUM_ORIGIN`
   - `NEXT_PUBLIC_FORUM_ENTRY_PATH`
5. Run the app:
   `npm run dev`

## 账号与绑定入口

主站当前提供以下玩家侧 MVP 页面：

- `/account`：邀请码注册、登录、查看当前登录用户
- `/bindings`：通过游戏内配对码查询绑定会话、确认绑定、查看已绑定账号
- `/bind/confirm?token=...`：插件返回的绑定确认链接，按 token 自动加载绑定会话

浏览器端 API 默认请求同源 `/api`。如果单独运行 `apps/web`，没有经过 nginx 反代，需要把 API 地址显式指到后端：

```bash
NEXT_PUBLIC_API_BASE_URL="http://localhost:3401/api"
```

## 论坛入口策略

主站不再把 `/forums` 占位页当成最终论坛方案，论坛入口会统一使用真实论坛地址：

- 顶部导航「论坛」
- `/forums` 兼容页中的跳转按钮

推荐按 `https://bbs.主站域名` 配置：

```bash
NEXT_PUBLIC_FORUM_ORIGIN="https://bbs.example.com"
NEXT_PUBLIC_FORUM_ENTRY_PATH="/"
```

说明：

- `NEXT_PUBLIC_FORUM_ORIGIN`：论坛主域名
- `NEXT_PUBLIC_FORUM_ENTRY_PATH`：论坛入口路径，默认 `/`
- 登录、注册和绑定确认入口现在留在主站 `/account` / `/bindings`
- `/forums` 现在仅用于兼容旧链接和说明跳转，不再是假论坛首页

## Docker

### Build image

```bash
docker build -t community-web .
```

### Run container

```bash
docker run --rm -p 3000:3000 --env-file .env.local community-web
```

### Docker Compose

```bash
cp .env.example .env.local
docker compose up --build -d
```

应用默认监听容器内 `3000` 端口，容器启动命令为 `npm run start -- -H 0.0.0.0 -p 3000`。

## Verification

建议至少执行：

```bash
npm run build
```

并确认：

- 首页导航论坛按钮已指向真实论坛域名
- 首页登录/加入按钮已进入 `/account`
- `/bindings` 与 `/bind/confirm?token=demo` 页面可打开
- `/forums` 页面只作为兼容说明页，不再误导用户停留在占位页

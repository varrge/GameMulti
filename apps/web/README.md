<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# GameMulti Web

主站前端基于 Next.js 15，当前包含首页、论坛入口收口页，以及 Docker 部署说明。

View your app in AI Studio: https://ai.studio/apps/acefc054-1255-4eea-8e35-2f02298f5c56

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy environment template and fill secrets:
   `cp .env.example .env.local`
3. Set the `GEMINI_API_KEY` in `.env.local`
4. 按真实环境填写论坛入口：
   - `NEXT_PUBLIC_FORUM_ORIGIN`
   - `NEXT_PUBLIC_FORUM_ENTRY_PATH`
5. Run the app:
   `npm run dev`

## 论坛入口策略

主站不再把 `/forums` 占位页当成最终论坛方案，下面几个入口会统一使用真实论坛地址：

- 顶部导航「论坛」
- 顶部「登录」默认跳转目标
- 顶部「立即加入」按钮
- 首页 Hero 的「开始体验」按钮
- 页面底部 CTA 的「加入 Nexus」按钮
- `/forums` 兼容页中的跳转按钮

推荐按 `https://bbs.主站域名` 配置：

```bash
NEXT_PUBLIC_FORUM_ORIGIN="https://bbs.example.com"
NEXT_PUBLIC_FORUM_ENTRY_PATH="/"
```

说明：

- `NEXT_PUBLIC_FORUM_ORIGIN`：论坛主域名
- `NEXT_PUBLIC_FORUM_ENTRY_PATH`：论坛入口路径，默认 `/`
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
- 登录入口默认跳转已跟随论坛地址
- `/forums` 页面只作为兼容说明页，不再误导用户停留在占位页

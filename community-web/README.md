<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/acefc054-1255-4eea-8e35-2f02298f5c56

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy environment template and fill secrets:
   `cp .env.example .env.local`
3. Set the `GEMINI_API_KEY` in `.env.local`
4. Run the app:
   `npm run dev`

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

已完成以下验证：

- `npm run build` 成功
- `docker build -t community-web-test .` 成功
- `docker run -d --name community-web-test-run -p 3400:3000 --env-file .env.local community-web-test` 后，使用 `NO_PROXY=127.0.0.1,localhost curl http://127.0.0.1:3400/` 与 `/forums` 均返回 `200`

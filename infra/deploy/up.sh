#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
COMPOSE_DIR="$REPO_ROOT/infra/compose"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
ENV_FILE="$COMPOSE_DIR/.env"
ENV_EXAMPLE="$COMPOSE_DIR/.env.example"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker 未安装，无法继续。" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose 不可用，无法继续。" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "未找到 compose 文件: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "已从模板生成 $ENV_FILE，请先按需回填变量后再重试。" >&2
  else
    echo "未找到环境变量文件: $ENV_FILE" >&2
  fi
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

PUBLIC_ORIGIN=${PUBLIC_ORIGIN:-${APP_URL:-http://localhost:${HOST_HTTP_PORT:-8080}}}
APP_URL=${APP_URL:-$PUBLIC_ORIGIN}
API_URL=${API_URL:-$PUBLIC_ORIGIN/api}
NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-/api}
if [[ -n "${FORUM_ORIGIN:-}" ]]; then
  NEXT_PUBLIC_FORUM_ORIGIN=${NEXT_PUBLIC_FORUM_ORIGIN:-$FORUM_ORIGIN}
elif [[ -n "${NEXT_PUBLIC_FORUM_ORIGIN:-}" ]]; then
  FORUM_ORIGIN=$NEXT_PUBLIC_FORUM_ORIGIN
fi
FORUM_ENTRY_PATH=${FORUM_ENTRY_PATH:-/}
NEXT_PUBLIC_FORUM_ENTRY_PATH=${NEXT_PUBLIC_FORUM_ENTRY_PATH:-$FORUM_ENTRY_PATH}
FORUM_SSO_RETURN_URL=${FORUM_SSO_RETURN_URL:-$PUBLIC_ORIGIN/forums/discourse-connect}

export PUBLIC_ORIGIN
export APP_URL
export API_URL
export NEXT_PUBLIC_API_BASE_URL
export FORUM_ORIGIN
export NEXT_PUBLIC_FORUM_ORIGIN
export FORUM_ENTRY_PATH
export NEXT_PUBLIC_FORUM_ENTRY_PATH
export FORUM_SSO_RETURN_URL

: "${WEB_SOURCE_DIR:?WEB_SOURCE_DIR 未设置，请在 infra/compose/.env 中填写真实源码目录}"

if [[ ! -d "$WEB_SOURCE_DIR" ]]; then
  echo "WEB_SOURCE_DIR 不存在: $WEB_SOURCE_DIR" >&2
  exit 1
fi

if [[ ! -f "$WEB_SOURCE_DIR/package.json" ]]; then
  echo "WEB_SOURCE_DIR 下缺少 package.json: $WEB_SOURCE_DIR" >&2
  exit 1
fi

if [[ ! -f "$REPO_ROOT/infra/nginx/default.conf" ]]; then
  echo "未找到 nginx 配置: $REPO_ROOT/infra/nginx/default.conf" >&2
  exit 1
fi

COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-${APP_NAME:-gamemulti}}
export COMPOSE_PROJECT_NAME

existing_web=$(docker ps -aq --filter "name=^/${APP_NAME:-gamemulti}-web$")
if [[ -n "$existing_web" ]]; then
  existing_project=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$existing_web" 2>/dev/null || true)
  existing_config=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$existing_web" 2>/dev/null || true)
  if [[ "$existing_project" != "$COMPOSE_PROJECT_NAME" || "$existing_config" != "$COMPOSE_FILE" ]]; then
    echo "检测到旧链路残留容器 ${APP_NAME:-gamemulti}-web，来自其他工作区：${existing_config:-unknown}" >&2
    echo "将尝试清理旧的 gamemulti compose 资源，避免容器名冲突。" >&2
    docker rm -f "${APP_NAME:-gamemulti}-nginx" "${APP_NAME:-gamemulti}-web" >/dev/null 2>&1 || true
    docker network rm "${APP_NAME:-gamemulti}_app_net" >/dev/null 2>&1 || true
  fi
fi

echo "==> 使用源码目录: $WEB_SOURCE_DIR"
echo "==> Compose 文件: $COMPOSE_FILE"
echo "==> Compose 项目名: $COMPOSE_PROJECT_NAME"
echo "==> HTTP 入口端口: ${HOST_HTTP_PORT:-8080}"
echo "==> 启动 compose 服务"
cd "$COMPOSE_DIR"
docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans

echo "==> 当前服务状态"
docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

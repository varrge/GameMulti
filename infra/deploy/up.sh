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

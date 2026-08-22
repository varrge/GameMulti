#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
COMPOSE_DIR="$REPO_ROOT/infra/compose"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
PROD_COMPOSE_FILE="$COMPOSE_DIR/docker-compose.prod.yml"
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
    chmod 600 "$ENV_FILE" 2>/dev/null || true
    echo "已从模板生成 $ENV_FILE，请先按需回填 PUBLIC_ORIGIN、FORUM_ORIGIN 后再重试。" >&2
  else
    echo "未找到环境变量文件: $ENV_FILE" >&2
  fi
  exit 1
fi

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

env_file_value() {
  local name=$1
  awk -F= -v key="$name" '$1 == key { print substr($0, length(key) + 2); exit }' "$ENV_FILE"
}

set_env_file_value() {
  local name=$1
  local value=$2
  local escaped
  escaped=$(printf '%s\n' "$value" | sed 's/[&/\]/\\&/g')
  if grep -q "^${name}=" "$ENV_FILE"; then
    sed -i.bak "s/^${name}=.*/${name}=${escaped}/" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    printf '\n%s=%s\n' "$name" "$value" >> "$ENV_FILE"
  fi
}

is_unset_secret() {
  local value=$1
  [[ -z "$value" || "$value" == replace-with-* || "$value" == changeme ]]
}

ensure_generated_secret() {
  local name=$1
  local current
  current=$(env_file_value "$name")
  if is_unset_secret "$current"; then
    local generated
    generated=$(generate_secret)
    set_env_file_value "$name" "$generated"
    GENERATED_SECRETS+=("${name}=${generated}")
  fi
}

ensure_default_env_value() {
  local name=$1
  local value=$2
  local current
  current=$(env_file_value "$name")
  if [[ -z "$current" ]]; then
    set_env_file_value "$name" "$value"
  fi
}

sync_default_database_url_password() {
  local db_password=$1
  local current
  current=$(env_file_value DATABASE_URL)
  if [[ -z "$current" || "$current" == *":changeme@"* ]]; then
    set_env_file_value DATABASE_URL "postgresql://gamemulti:${db_password}@postgres:5432/gamemulti?schema=public"
  fi
}

GENERATED_SECRETS=()
ensure_generated_secret APP_SECRET
ensure_generated_secret ADMIN_API_KEY
ensure_generated_secret FORUM_SSO_SECRET
ensure_generated_secret DEPLOY_AGENT_TOKEN
ensure_generated_secret POSTGRES_PASSWORD
ensure_default_env_value DEPLOY_AGENT_URL "http://host.docker.internal:3421"
ensure_default_env_value DEPLOY_AGENT_PORT "3421"
sync_default_database_url_password "$(env_file_value POSTGRES_PASSWORD)"
chmod 600 "$ENV_FILE" 2>/dev/null || true

if [[ ${#GENERATED_SECRETS[@]} -gt 0 ]]; then
  cat <<'EOF'
==> 首次部署已生成以下 secret，并写入 infra/compose/.env
==> 这是唯一一次自动显示。请现在保存到你的密码管理器或部署记录。
EOF
  printf '%s\n' "${GENERATED_SECRETS[@]}"
  cat <<'EOF'
==> 后续再次执行 up.sh/update.sh 不会重复显示这些值。
EOF
fi

set -a
source "$ENV_FILE"
set +a

COMPOSE_FILES=("$COMPOSE_FILE")
if [[ "${NODE_ENV:-development}" == "production" ]]; then
  if [[ ! -f "$PROD_COMPOSE_FILE" ]]; then
    echo "未找到生产 compose 覆盖文件: $PROD_COMPOSE_FILE" >&2
    exit 1
  fi
  COMPOSE_FILES+=("$PROD_COMPOSE_FILE")
fi

COMPOSE_ARGS=()
for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_ARGS+=(-f "$compose_file")
done

PUBLIC_ORIGIN=${PUBLIC_ORIGIN:-${APP_URL:-http://localhost:${HOST_HTTP_PORT:-8080}}}
APP_URL=${APP_URL:-$PUBLIC_ORIGIN}
API_URL=${API_URL:-$PUBLIC_ORIGIN/api}
BRIDGE_PUBLIC_ORIGIN=${BRIDGE_PUBLIC_ORIGIN:-$PUBLIC_ORIGIN}
NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-/api}
if [[ -n "${FORUM_ORIGIN:-}" ]]; then
  NEXT_PUBLIC_FORUM_ORIGIN=${NEXT_PUBLIC_FORUM_ORIGIN:-$FORUM_ORIGIN}
elif [[ -n "${NEXT_PUBLIC_FORUM_ORIGIN:-}" ]]; then
  FORUM_ORIGIN=$NEXT_PUBLIC_FORUM_ORIGIN
fi
FORUM_ENTRY_PATH=${FORUM_ENTRY_PATH:-/}
NEXT_PUBLIC_FORUM_ENTRY_PATH=${NEXT_PUBLIC_FORUM_ENTRY_PATH:-$FORUM_ENTRY_PATH}
DISCOURSE_PROVIDER_SECRET=${DISCOURSE_PROVIDER_SECRET:-$FORUM_SSO_SECRET}

export PUBLIC_ORIGIN
export APP_URL
export API_URL
export BRIDGE_PUBLIC_ORIGIN
export NEXT_PUBLIC_API_BASE_URL
export FORUM_ORIGIN
export NEXT_PUBLIC_FORUM_ORIGIN
export FORUM_ENTRY_PATH
export NEXT_PUBLIC_FORUM_ENTRY_PATH
export DISCOURSE_PROVIDER_SECRET

if [[ "${ENABLE_WEB:-0}" == "1" || "${ENABLE_WEB:-}" == "true" ]]; then
  if [[ -n "${COMPOSE_PROFILES:-}" ]]; then
    COMPOSE_PROFILES="${COMPOSE_PROFILES},web"
  else
    COMPOSE_PROFILES="web"
  fi
  NGINX_CONF=${NGINX_CONF:-../nginx/with-web.conf}
fi

export COMPOSE_PROFILES
export NGINX_CONF

if [[ ",${COMPOSE_PROFILES:-}," == *",web,"* ]]; then
  WEB_SOURCE_DIR=${WEB_SOURCE_DIR:-$REPO_ROOT/apps/web}
  export WEB_SOURCE_DIR

  if [[ ! -d "$WEB_SOURCE_DIR" ]]; then
    echo "WEB_SOURCE_DIR 不存在: $WEB_SOURCE_DIR" >&2
    exit 1
  fi

  if [[ ! -f "$WEB_SOURCE_DIR/package.json" ]]; then
    echo "WEB_SOURCE_DIR 下缺少 package.json: $WEB_SOURCE_DIR" >&2
    exit 1
  fi
fi

if [[ ! -f "$REPO_ROOT/infra/nginx/default.conf" ]]; then
  echo "未找到 nginx 配置: $REPO_ROOT/infra/nginx/default.conf" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_DIR/${NGINX_CONF:-../nginx/default.conf}" && ! -f "${NGINX_CONF:-}" ]]; then
  echo "未找到 nginx 配置: ${NGINX_CONF:-../nginx/default.conf}" >&2
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

if [[ ",${COMPOSE_PROFILES:-}," == *",web,"* ]]; then
  echo "==> 使用前端源码目录: $WEB_SOURCE_DIR"
else
  echo "==> 默认不启动 web 服务；如需旧前端，请设置 ENABLE_WEB=1 或 COMPOSE_PROFILES=web"
fi
echo "==> Compose 文件: ${COMPOSE_FILES[*]}"
echo "==> Compose 项目名: $COMPOSE_PROJECT_NAME"
echo "==> HTTP 入口端口: ${HOST_HTTP_PORT:-8080}"
echo "==> Nginx 配置: ${NGINX_CONF:-../nginx/default.conf}"
echo "==> 启动 compose 服务"
cd "$COMPOSE_DIR"
docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" up -d --remove-orphans

echo "==> 当前服务状态"
docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" ps

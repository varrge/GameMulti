#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.pgvector-http.yml"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"
PROJECT_NAME=${DISCOURSE_DEV_PROJECT_NAME:-gamemulti-discourse-dev}

usage() {
  cat <<'EOF'
Usage: infra/forum/discourse-dev/dev.sh <command>

Commands:
  pull    Pull local Discourse dev images
  up      Start local Discourse dev stack
  check   Check local Discourse HTTP readiness
  logs    Tail local Discourse logs
  ps      Show local Discourse compose status
  down    Stop local Discourse dev stack
EOF
}

compose() {
  docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

require_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$ENV_EXAMPLE" ]]; then
      cp "$ENV_EXAMPLE" "$ENV_FILE"
      echo "Created $ENV_FILE from .env.example. Fill it before running again." >&2
    else
      echo "Missing env file: $ENV_FILE" >&2
    fi
    exit 1
  fi
}

require_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "docker is not installed" >&2
    exit 1
  }
  docker info >/dev/null 2>&1 || {
    echo "docker daemon is not reachable" >&2
    exit 1
  }
}

check_http() {
  require_env
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  local port=${DISCOURSE_HTTP_PORT:-3000}
  local url="http://127.0.0.1:${port}/"
  local max_attempts=${DISCOURSE_DEV_CHECK_ATTEMPTS:-90}
  local delay=${DISCOURSE_DEV_CHECK_DELAY_SECONDS:-5}

  echo "Checking $url"
  for attempt in $(seq 1 "$max_attempts"); do
    if curl -fsSI "$url" >/dev/null 2>&1; then
      echo "Local Discourse is reachable: $url"
      return 0
    fi
    echo "Waiting for Discourse HTTP ($attempt/$max_attempts)"
    sleep "$delay"
  done

  echo "Local Discourse did not become reachable: $url" >&2
  compose ps >&2 || true
  compose logs --tail=120 discourse >&2 || true
  return 1
}

command_name=${1:-}
case "$command_name" in
  pull)
    require_docker
    require_env
    compose pull
    ;;
  up)
    require_docker
    require_env
    compose up -d
    check_http
    ;;
  check)
    require_docker
    check_http
    ;;
  logs)
    require_docker
    require_env
    compose logs --tail=200 -f "${@:2}"
    ;;
  ps)
    require_docker
    require_env
    compose ps
    ;;
  down)
    require_docker
    require_env
    compose down
    ;;
  *)
    usage
    exit 1
    ;;
esac

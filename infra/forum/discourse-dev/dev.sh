#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.pgvector-http.yml"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"
RESOLVED_ENV_FILE="$SCRIPT_DIR/.env.resolved"
PROJECT_NAME=${DISCOURSE_DEV_PROJECT_NAME:-gamemulti-discourse-dev}

usage() {
  cat <<'EOF'
Usage: infra/forum/discourse-dev/dev.sh <command>

Commands:
  pull    Pull local Discourse dev images
  up      Start local Discourse dev stack
  check   Check local Discourse HTTP readiness
  host    Print the resolved Discourse hostname
  logs    Tail local Discourse logs
  ps      Show local Discourse compose status
  down    Stop local Discourse dev stack
EOF
}

compose() {
  render_resolved_env
  docker compose --project-name "$PROJECT_NAME" --env-file "$RESOLVED_ENV_FILE" -f "$COMPOSE_FILE" "$@"
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

get_env_value() {
  local name=$1
  awk -F= -v key="$name" '$1 == key { print substr($0, length(key) + 2); exit }' "$ENV_FILE"
}

detect_public_ip() {
  local ip=""
  if command -v curl >/dev/null 2>&1; then
    ip=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)
    if [[ -z "$ip" ]]; then
      ip=$(curl -fsS --max-time 5 https://ifconfig.me/ip 2>/dev/null || true)
    fi
  fi
  if [[ ! "$ip" =~ ^[0-9a-fA-F:.]+$ ]]; then
    return 1
  fi
  printf '%s\n' "$ip"
}

detect_local_ip() {
  local ip=""
  if command -v ipconfig >/dev/null 2>&1; then
    ip=$(ipconfig getifaddr en0 2>/dev/null || true)
  fi
  if [[ -z "$ip" ]] && command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  fi
  if [[ -z "$ip" ]]; then
    ip="127.0.0.1"
  fi
  printf '%s\n' "$ip"
}

append_port_if_needed() {
  local host=$1
  local port=$2
  if [[ "$host" == *:* ]]; then
    printf '%s\n' "$host"
  else
    printf '%s:%s\n' "$host" "$port"
  fi
}

resolve_hostname() {
  require_env
  local configured
  configured=$(get_env_value DISCOURSE_HOSTNAME)
  local port
  port=$(get_env_value DISCOURSE_HTTP_PORT)
  port=${port:-3000}

  case "$configured" in
    auto|auto-public)
      append_port_if_needed "$(detect_public_ip)" "$port"
      ;;
    auto-local)
      append_port_if_needed "$(detect_local_ip)" "$port"
      ;;
    "")
      append_port_if_needed "127.0.0.1" "$port"
      ;;
    *)
      printf '%s\n' "$configured"
      ;;
  esac
}

render_resolved_env() {
  require_env
  local hostname
  hostname=$(resolve_hostname)
  awk -v hostname="$hostname" '
    BEGIN { replaced = 0 }
    /^DISCOURSE_HOSTNAME=/ {
      print "DISCOURSE_HOSTNAME=" hostname
      replaced = 1
      next
    }
    { print }
    END {
      if (!replaced) {
        print "DISCOURSE_HOSTNAME=" hostname
      }
    }
  ' "$ENV_FILE" > "$RESOLVED_ENV_FILE"
}

check_http() {
  require_env
  render_resolved_env
  set -a
  # shellcheck disable=SC1090
  source "$RESOLVED_ENV_FILE"
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
  host)
    require_env
    resolve_hostname
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

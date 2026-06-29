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
  configure-local-sso
          Configure local Discourse for GameMulti DiscourseConnect
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

configure_local_sso() {
  require_env
  render_resolved_env
  set -a
  # shellcheck disable=SC1090
  source "$RESOLVED_ENV_FILE"
  set +a

  local sso_secret=${FORUM_SSO_SECRET:-local-dev-forum-sso-secret}
  local bridge_public_origin=${BRIDGE_PUBLIC_ORIGIN:-http://127.0.0.1:8080}
  local discourse_provider_secret=${DISCOURSE_PROVIDER_SECRET:-$sso_secret}
  local admin_email=${DISCOURSE_LOCAL_ADMIN_EMAIL:-${DISCOURSE_DEVELOPER_EMAILS%%,*}}
  local site_name=${DISCOURSE_LOCAL_SITE_NAME:-GameMulti Local Forum}
  local default_locale=${DISCOURSE_DEFAULT_LOCALE:-zh_CN}
  local allow_user_locale=${DISCOURSE_ALLOW_USER_LOCALE:-true}

  if [[ -z "$admin_email" ]]; then
    echo "DISCOURSE_DEVELOPER_EMAILS or DISCOURSE_LOCAL_ADMIN_EMAIL is required" >&2
    return 1
  fi

  compose exec -T \
    -e GM_FORUM_SSO_SECRET="$sso_secret" \
    -e GM_BRIDGE_PUBLIC_ORIGIN="$bridge_public_origin" \
    -e GM_DISCOURSE_PROVIDER_SECRET="$discourse_provider_secret" \
    -e GM_DISCOURSE_ADMIN_EMAIL="$admin_email" \
    -e GM_DISCOURSE_SITE_NAME="$site_name" \
    -e GM_DISCOURSE_DEFAULT_LOCALE="$default_locale" \
    -e GM_DISCOURSE_ALLOW_USER_LOCALE="$allow_user_locale" \
    discourse bash -lc 'cd /var/www/discourse && bundle exec rails runner -' <<'RUBY'
require "uri"

def env_bool(name, default)
  value = ENV.fetch(name, default.to_s).downcase
  %w[1 true yes on].include?(value)
end

settings = {
  enable_discourse_connect: false,
  discourse_connect_url: "",
  discourse_connect_secret: ENV.fetch("GM_FORUM_SSO_SECRET"),
  discourse_connect_csrf_protection: false,
  force_https: false,
  wizard_enabled: false,
  bypass_wizard_check: true,
  external_system_avatars_url: "",
  external_system_avatars_enabled: false,
  gravatar_enabled: false,
  title: ENV.fetch("GM_DISCOURSE_SITE_NAME"),
}

settings.each do |key, value|
  SiteSetting.public_send("#{key}=", value)
end

local_login_settings = {
  enable_local_logins: true,
  invite_only: false,
  must_approve_users: false,
  login_required: false,
}

local_login_settings.each do |key, value|
  setter = "#{key}="
  SiteSetting.public_send(setter, value) if SiteSetting.respond_to?(setter)
end

if SiteSetting.respond_to?(:enable_discourse_connect_provider=)
  SiteSetting.enable_discourse_connect_provider = true
end

begin
  bridge_host = URI(ENV.fetch("GM_BRIDGE_PUBLIC_ORIGIN")).host
  provider_pair = "#{bridge_host}|#{ENV.fetch("GM_DISCOURSE_PROVIDER_SECRET")}"
  [
    :discourse_connect_provider_secrets,
    :sso_provider_secrets,
  ].each do |setting_name|
    setter = "#{setting_name}="
    next unless SiteSetting.respond_to?(setter)

    current = SiteSetting.public_send(setting_name).to_s.split(/\r?\n/).map(&:strip).reject(&:empty?)
    SiteSetting.public_send(setter, (current + [provider_pair]).uniq.join("\n"))
    break
  end
rescue URI::InvalidURIError
end

locale_settings = {
  default_locale: ENV.fetch("GM_DISCOURSE_DEFAULT_LOCALE", "zh_CN"),
  allow_user_locale: env_bool("GM_DISCOURSE_ALLOW_USER_LOCALE", true),
  set_locale_from_accept_language_header: false,
}

locale_settings.each do |key, value|
  setter = "#{key}="
  SiteSetting.public_send(setter, value) if SiteSetting.respond_to?(setter)
end

admin_email = ENV.fetch("GM_DISCOURSE_ADMIN_EMAIL")
user = User.find_by_email(admin_email)
if user
  user.active = true if user.respond_to?(:active=)
  user.approved = true if user.respond_to?(:approved=)
  user.admin = true if user.respond_to?(:admin=)
  user.moderator = true if user.respond_to?(:moderator=)
  user.trust_level = TrustLevel[4] if defined?(TrustLevel) && user.respond_to?(:trust_level=)
  user.save!
  user.email_tokens.update_all(confirmed: true) if user.respond_to?(:email_tokens)
end

Jobs.enqueue(:ensure_db_consistency) if defined?(Jobs)

puts({
  ok: true,
  discourse_connect_enabled: SiteSetting.enable_discourse_connect,
  discourse_connect_url: SiteSetting.discourse_connect_url,
  discourse_connect_provider_enabled: SiteSetting.respond_to?(:enable_discourse_connect_provider) ? SiteSetting.enable_discourse_connect_provider : nil,
  local_logins_enabled: SiteSetting.respond_to?(:enable_local_logins) ? SiteSetting.enable_local_logins : nil,
  default_locale: SiteSetting.respond_to?(:default_locale) ? SiteSetting.default_locale : nil,
  admin_email: admin_email,
  admin_user_found: !user.nil?,
}.to_json)
RUBY
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
  configure-local-sso)
    require_docker
    configure_local_sso
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

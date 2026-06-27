#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE=${1:-"$SCRIPT_DIR/discourse.env"}

failures=0

note() {
  printf '%s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  failures=$((failures + 1))
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

require_var() {
  local name=$1
  local value=${!name:-}
  if [[ -z "$value" || "$value" == replace-with-* ]]; then
    fail "$name is missing or still uses a placeholder"
  fi
}

require_real_value() {
  local name=$1
  local value=${!name:-}
  if [[ "$value" == *example.com* || "$value" == *".example" ]]; then
    fail "$name still uses an example value"
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  fail "env file not found: $ENV_FILE"
  note "Copy infra/deploy/discourse.env.example to a private env file and fill it first."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

GAME_API_ORIGIN=${GAME_API_ORIGIN:-${GAME_PUBLIC_ORIGIN:-}}
BRIDGE_PUBLIC_ORIGIN=${BRIDGE_PUBLIC_ORIGIN:-${GAME_PUBLIC_ORIGIN:-}}
FORUM_ORIGIN=${FORUM_ORIGIN:-https://${DISCOURSE_HOSTNAME:-}}
FORUM_SSO_RETURN_URL=${FORUM_SSO_RETURN_URL:-${GAME_PUBLIC_ORIGIN:-}/forums/discourse-connect}
DISCOURSE_PROVIDER_SECRET=${DISCOURSE_PROVIDER_SECRET:-${FORUM_SSO_SECRET:-}}
NEXT_PUBLIC_FORUM_ORIGIN=${NEXT_PUBLIC_FORUM_ORIGIN:-$FORUM_ORIGIN}

export GAME_API_ORIGIN
export BRIDGE_PUBLIC_ORIGIN
export FORUM_ORIGIN
export FORUM_SSO_RETURN_URL
export DISCOURSE_PROVIDER_SECRET
export NEXT_PUBLIC_FORUM_ORIGIN

note "==> Checking local tools"
command -v docker >/dev/null 2>&1 || fail "docker is not installed"
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  fail "docker daemon is not reachable"
fi
command -v git >/dev/null 2>&1 || fail "git is not installed"
command -v curl >/dev/null 2>&1 || warn "curl is not installed; HTTP checks will be skipped"

for script in discourse_render_game_env.sh discourse_render_launch_summary.sh discourse_configure_sso.sh; do
  if [[ ! -x "$SCRIPT_DIR/$script" ]]; then
    warn "$script is not executable; run: chmod +x infra/deploy/$script"
  fi
done

note "==> Checking required variables"
required_vars=(
  GAME_PUBLIC_ORIGIN
  BRIDGE_PUBLIC_ORIGIN
  DISCOURSE_HOSTNAME
  DISCOURSE_DEVELOPER_EMAILS
  LETSENCRYPT_ACCOUNT_EMAIL
  DISCOURSE_SMTP_ADDRESS
  DISCOURSE_SMTP_PORT
  DISCOURSE_SMTP_USER_NAME
  DISCOURSE_SMTP_PASSWORD
  DISCOURSE_NOTIFICATION_EMAIL
  FORUM_SSO_SECRET
  DISCOURSE_PROVIDER_SECRET
)

for name in "${required_vars[@]}"; do
  require_var "$name"
done

real_value_vars=(
  GAME_PUBLIC_ORIGIN
  BRIDGE_PUBLIC_ORIGIN
  DISCOURSE_HOSTNAME
  DISCOURSE_DEVELOPER_EMAILS
  LETSENCRYPT_ACCOUNT_EMAIL
  DISCOURSE_SMTP_ADDRESS
  DISCOURSE_SMTP_USER_NAME
  DISCOURSE_NOTIFICATION_EMAIL
)

for name in "${real_value_vars[@]}"; do
  require_real_value "$name"
done

if [[ ${FORUM_SSO_SECRET:-} != replace-with-* && ${#FORUM_SSO_SECRET:-} -lt 32 ]]; then
  fail "FORUM_SSO_SECRET should be at least 32 characters"
fi
if [[ ${DISCOURSE_PROVIDER_SECRET:-} != replace-with-* && ${#DISCOURSE_PROVIDER_SECRET:-} -lt 32 ]]; then
  fail "DISCOURSE_PROVIDER_SECRET should be at least 32 characters"
fi

if [[ ${FORUM_ORIGIN:-} != "https://${DISCOURSE_HOSTNAME:-}" ]]; then
  warn "FORUM_ORIGIN does not match https://DISCOURSE_HOSTNAME"
fi

if [[ ${FORUM_SSO_RETURN_URL:-} != "${GAME_PUBLIC_ORIGIN:-}/forums/discourse-connect" ]]; then
  warn "FORUM_SSO_RETURN_URL is not GAME_PUBLIC_ORIGIN + /forums/discourse-connect"
fi
if [[ ${BRIDGE_PUBLIC_ORIGIN:-} != "${GAME_PUBLIC_ORIGIN:-}" ]]; then
  warn "BRIDGE_PUBLIC_ORIGIN differs from GAME_PUBLIC_ORIGIN; confirm /bind and /api routing"
fi

note "==> Checking DNS resolution"
if command -v dig >/dev/null 2>&1; then
  if ! dig +short "$DISCOURSE_HOSTNAME" | grep -qE '^[0-9a-fA-F:.]+$'; then
    fail "DNS does not resolve for $DISCOURSE_HOSTNAME"
  fi
elif command -v host >/dev/null 2>&1; then
  host "$DISCOURSE_HOSTNAME" >/dev/null 2>&1 || fail "DNS does not resolve for $DISCOURSE_HOSTNAME"
else
  warn "dig/host not available; DNS check skipped"
fi

note "==> Checking local port availability"
for port in "${CHECK_HTTP_PORT:-80}" "${CHECK_HTTPS_PORT:-443}"; do
  if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      warn "local TCP port $port is already listening; confirm it is expected before installing Discourse"
    fi
  else
    warn "lsof not available; port $port check skipped"
  fi
done

if [[ $failures -gt 0 ]]; then
  fail "preflight failed with $failures blocking issue(s)"
  exit 1
fi

note "==> Preflight passed"
note "Next: follow docs/deployment/discourse_production_runbook.md on a clean forum host."

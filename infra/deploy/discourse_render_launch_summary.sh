#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE=${1:-"$SCRIPT_DIR/discourse.env"}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  echo "Copy infra/deploy/discourse.env.example to a private env file and fill it first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

required_vars=(
  GAME_PUBLIC_ORIGIN
  GAME_API_ORIGIN
  DISCOURSE_HOSTNAME
  DISCOURSE_DEVELOPER_EMAILS
  LETSENCRYPT_ACCOUNT_EMAIL
  DISCOURSE_SMTP_ADDRESS
  DISCOURSE_SMTP_PORT
  DISCOURSE_SMTP_USER_NAME
  DISCOURSE_NOTIFICATION_EMAIL
  FORUM_ORIGIN
  FORUM_SSO_RETURN_URL
  NEXT_PUBLIC_FORUM_ORIGIN
)

missing=0
for name in "${required_vars[@]}"; do
  value=${!name:-}
  if [[ -z "$value" || "$value" == replace-with-* ]]; then
    echo "ERROR: $name is missing or still uses a placeholder" >&2
    missing=$((missing + 1))
  fi
done

if [[ -z "${FORUM_SSO_SECRET:-}" || "${FORUM_SSO_SECRET:-}" == replace-with-* ]]; then
  echo "ERROR: FORUM_SSO_SECRET is missing or still uses a placeholder" >&2
  missing=$((missing + 1))
elif [[ ${#FORUM_SSO_SECRET} -lt 32 ]]; then
  echo "ERROR: FORUM_SSO_SECRET should be at least 32 characters" >&2
  missing=$((missing + 1))
fi

if [[ $missing -gt 0 ]]; then
  exit 1
fi

cat <<EOF
# GameMulti + Discourse Launch Summary
#
# Secret values are intentionally omitted.

GameMulti:
  public origin: ${GAME_PUBLIC_ORIGIN}
  API origin: ${GAME_API_ORIGIN}
  health check: ${GAME_API_ORIGIN}/api/healthz
  forum callback: ${FORUM_SSO_RETURN_URL}

Discourse:
  hostname: ${DISCOURSE_HOSTNAME}
  origin: ${FORUM_ORIGIN}
  admin email: ${DISCOURSE_DEVELOPER_EMAILS}
  letsencrypt email: ${LETSENCRYPT_ACCOUNT_EMAIL}
  container: ${DISCOURSE_CONTAINER:-app}

SMTP:
  address: ${DISCOURSE_SMTP_ADDRESS}
  port: ${DISCOURSE_SMTP_PORT}
  username: ${DISCOURSE_SMTP_USER_NAME}
  notification email: ${DISCOURSE_NOTIFICATION_EMAIL}

GameMulti env to apply:
  FORUM_PROVIDER=${FORUM_PROVIDER:-discourse}
  FORUM_ORIGIN=${FORUM_ORIGIN}
  FORUM_ENTRY_PATH=${FORUM_ENTRY_PATH:-/}
  FORUM_SSO_SECRET=<same private secret as Discourse>
  FORUM_SSO_RETURN_URL=${FORUM_SSO_RETURN_URL}
  NEXT_PUBLIC_FORUM_ORIGIN=${NEXT_PUBLIC_FORUM_ORIGIN}
  NEXT_PUBLIC_FORUM_ENTRY_PATH=${NEXT_PUBLIC_FORUM_ENTRY_PATH:-${FORUM_ENTRY_PATH:-/}}

Commands:
  bash infra/deploy/discourse_check_prereqs.sh ${ENV_FILE}
  bash infra/deploy/discourse_render_game_env.sh ${ENV_FILE}
  bash infra/deploy/discourse_configure_sso.sh ${ENV_FILE}

Browser validation:
  1. ${GAME_PUBLIC_ORIGIN}/account
  2. ${GAME_PUBLIC_ORIGIN}/forums
  3. ${FORUM_ORIGIN}/session/sso?... redirect
  4. ${FORUM_SSO_RETURN_URL}?sso=...&sig=...
  5. ${FORUM_ORIGIN} logged in as the GameMulti user
EOF

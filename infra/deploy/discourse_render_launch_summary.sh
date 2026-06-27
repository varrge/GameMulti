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

EXPLICIT_DISCOURSE_PROVIDER_SECRET=${DISCOURSE_PROVIDER_SECRET:-}
GAME_API_ORIGIN=${GAME_API_ORIGIN:-${GAME_PUBLIC_ORIGIN:-}}
BRIDGE_PUBLIC_ORIGIN=${BRIDGE_PUBLIC_ORIGIN:-${GAME_PUBLIC_ORIGIN:-}}
FORUM_ORIGIN=${FORUM_ORIGIN:-https://${DISCOURSE_HOSTNAME:-}}
FORUM_SSO_RETURN_URL=${FORUM_SSO_RETURN_URL:-${GAME_PUBLIC_ORIGIN:-}/forums/discourse-connect}
DISCOURSE_PROVIDER_SECRET=${DISCOURSE_PROVIDER_SECRET:-${FORUM_SSO_SECRET:-}}
NEXT_PUBLIC_FORUM_ORIGIN=${NEXT_PUBLIC_FORUM_ORIGIN:-$FORUM_ORIGIN}
DISCOURSE_DEFAULT_LOCALE=${DISCOURSE_DEFAULT_LOCALE:-zh_CN}
DISCOURSE_ALLOW_USER_LOCALE=${DISCOURSE_ALLOW_USER_LOCALE:-true}

export GAME_API_ORIGIN
export BRIDGE_PUBLIC_ORIGIN
export FORUM_ORIGIN
export FORUM_SSO_RETURN_URL
export DISCOURSE_PROVIDER_SECRET
export NEXT_PUBLIC_FORUM_ORIGIN
export DISCOURSE_DEFAULT_LOCALE
export DISCOURSE_ALLOW_USER_LOCALE

required_vars=(
  GAME_PUBLIC_ORIGIN
  BRIDGE_PUBLIC_ORIGIN
  DISCOURSE_HOSTNAME
  DISCOURSE_DEVELOPER_EMAILS
  LETSENCRYPT_ACCOUNT_EMAIL
  DISCOURSE_SMTP_ADDRESS
  DISCOURSE_SMTP_PORT
  DISCOURSE_SMTP_USER_NAME
  DISCOURSE_NOTIFICATION_EMAIL
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
if [[ -z "${DISCOURSE_PROVIDER_SECRET:-}" || "${DISCOURSE_PROVIDER_SECRET:-}" == replace-with-* ]]; then
  echo "ERROR: DISCOURSE_PROVIDER_SECRET is missing or still uses a placeholder" >&2
  missing=$((missing + 1))
elif [[ ${#DISCOURSE_PROVIDER_SECRET} -lt 32 ]]; then
  echo "ERROR: DISCOURSE_PROVIDER_SECRET should be at least 32 characters" >&2
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
  bridge origin: ${BRIDGE_PUBLIC_ORIGIN}
  API origin: ${GAME_API_ORIGIN}
  health check: ${GAME_API_ORIGIN}/api/healthz
  forum callback: ${FORUM_SSO_RETURN_URL}
  provider callback: ${BRIDGE_PUBLIC_ORIGIN}/api/auth/discourse/callback

Discourse:
  hostname: ${DISCOURSE_HOSTNAME}
  origin: ${FORUM_ORIGIN}
  admin email: ${DISCOURSE_DEVELOPER_EMAILS}
  letsencrypt email: ${LETSENCRYPT_ACCOUNT_EMAIL}
  container: ${DISCOURSE_CONTAINER:-app}
  default locale: ${DISCOURSE_DEFAULT_LOCALE}
  allow user locale: ${DISCOURSE_ALLOW_USER_LOCALE}

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
  DISCOURSE_PROVIDER_SECRET=${EXPLICIT_DISCOURSE_PROVIDER_SECRET:+<explicit private provider secret>}${EXPLICIT_DISCOURSE_PROVIDER_SECRET:-<defaults to FORUM_SSO_SECRET>}
  BRIDGE_PUBLIC_ORIGIN=${BRIDGE_PUBLIC_ORIGIN}
  FORUM_SSO_RETURN_URL=${FORUM_SSO_RETURN_URL}
  NEXT_PUBLIC_FORUM_ORIGIN=${NEXT_PUBLIC_FORUM_ORIGIN}
  NEXT_PUBLIC_FORUM_ENTRY_PATH=${NEXT_PUBLIC_FORUM_ENTRY_PATH:-${FORUM_ENTRY_PATH:-/}}

Commands:
  bash infra/deploy/discourse_check_prereqs.sh ${ENV_FILE}
  bash infra/deploy/discourse_render_game_env.sh ${ENV_FILE}
  bash infra/deploy/discourse_configure_sso.sh ${ENV_FILE}

Browser validation:
  1. Create a real binding session and open ${BRIDGE_PUBLIC_ORIGIN}/bind/confirm?token=...
  2. Confirm redirect to ${FORUM_ORIGIN}/session/sso_provider?...
  3. Confirm callback to ${BRIDGE_PUBLIC_ORIGIN}/api/auth/discourse/callback?sso=...&sig=...
  4. Confirm the Bridge binding page can complete the binding
EOF

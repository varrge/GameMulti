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

: "${FORUM_ORIGIN:?FORUM_ORIGIN is required}"
: "${FORUM_SSO_SECRET:?FORUM_SSO_SECRET is required}"
: "${FORUM_SSO_RETURN_URL:?FORUM_SSO_RETURN_URL is required}"

cat <<EOF
# Paste these values into the GameMulti runtime env for the target environment.
# Keep FORUM_SSO_SECRET private.
FORUM_PROVIDER=${FORUM_PROVIDER:-discourse}
FORUM_ORIGIN=${FORUM_ORIGIN}
FORUM_ENTRY_PATH=${FORUM_ENTRY_PATH:-/}
FORUM_SSO_SECRET=${FORUM_SSO_SECRET}
FORUM_SSO_RETURN_URL=${FORUM_SSO_RETURN_URL}
NEXT_PUBLIC_FORUM_ORIGIN=${NEXT_PUBLIC_FORUM_ORIGIN:-$FORUM_ORIGIN}
NEXT_PUBLIC_FORUM_ENTRY_PATH=${NEXT_PUBLIC_FORUM_ENTRY_PATH:-${FORUM_ENTRY_PATH:-/}}
EOF

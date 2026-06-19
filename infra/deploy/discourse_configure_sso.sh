#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE=${1:-"$SCRIPT_DIR/discourse.env"}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

warn() {
  echo "WARN: $*" >&2
}

require_var() {
  local name=$1
  local value=${!name:-}
  if [[ -z "$value" || "$value" == replace-with-* ]]; then
    fail "$name is missing or still uses a placeholder"
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  fail "env file not found: $ENV_FILE"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

FORUM_ORIGIN=${FORUM_ORIGIN:-https://${DISCOURSE_HOSTNAME:-}}
FORUM_SSO_RETURN_URL=${FORUM_SSO_RETURN_URL:-${GAME_PUBLIC_ORIGIN:-}/forums/discourse-connect}

export FORUM_ORIGIN
export FORUM_SSO_RETURN_URL

command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker info >/dev/null 2>&1 || fail "docker daemon is not reachable"

required_vars=(
  GAME_PUBLIC_ORIGIN
  DISCOURSE_HOSTNAME
  FORUM_SSO_SECRET
)

for name in "${required_vars[@]}"; do
  require_var "$name"
done

if [[ ${#FORUM_SSO_SECRET} -lt 32 ]]; then
  fail "FORUM_SSO_SECRET should be at least 32 characters"
fi

if [[ "$FORUM_ORIGIN" != "https://$DISCOURSE_HOSTNAME" ]]; then
  warn "FORUM_ORIGIN does not match https://DISCOURSE_HOSTNAME"
fi

if [[ "$FORUM_SSO_RETURN_URL" != "$GAME_PUBLIC_ORIGIN/forums/discourse-connect" ]]; then
  warn "FORUM_SSO_RETURN_URL is not GAME_PUBLIC_ORIGIN + /forums/discourse-connect"
fi

DISCOURSE_CONTAINER=${DISCOURSE_CONTAINER:-app}

if ! docker ps --format '{{.Names}}' | grep -Fxq "$DISCOURSE_CONTAINER"; then
  fail "Discourse container is not running: $DISCOURSE_CONTAINER"
fi

docker exec \
  -e GM_FORUM_SSO_RETURN_URL="$FORUM_SSO_RETURN_URL" \
  -e GM_FORUM_SSO_SECRET="$FORUM_SSO_SECRET" \
  -e GM_GAME_PUBLIC_ORIGIN="$GAME_PUBLIC_ORIGIN" \
  -e GM_FORUM_ORIGIN="$FORUM_ORIGIN" \
  "$DISCOURSE_CONTAINER" \
  bash -lc 'cd /var/www/discourse && bundle exec rails runner -' <<'RUBY'
require "uri"

game_origin = ENV.fetch("GM_GAME_PUBLIC_ORIGIN")
forum_origin = ENV.fetch("GM_FORUM_ORIGIN")
callback_url = ENV.fetch("GM_FORUM_SSO_RETURN_URL")
secret = ENV.fetch("GM_FORUM_SSO_SECRET")

game_host = URI(game_origin).host
forum_host = URI(forum_origin).host

SiteSetting.enable_discourse_connect = true
SiteSetting.discourse_connect_url = callback_url
SiteSetting.discourse_connect_secret = secret
SiteSetting.discourse_connect_csrf_protection = true if SiteSetting.respond_to?(:discourse_connect_csrf_protection=)
SiteSetting.force_https = true if SiteSetting.respond_to?(:force_https=)

if SiteSetting.respond_to?(:discourse_connect_allowed_redirect_domains=) && game_host && game_host != forum_host
  current = SiteSetting.discourse_connect_allowed_redirect_domains.to_s.split("|").map(&:strip).reject(&:empty?)
  SiteSetting.discourse_connect_allowed_redirect_domains = (current + [game_host]).uniq.join("|")
end

puts({
  ok: true,
  enable_discourse_connect: SiteSetting.enable_discourse_connect,
  discourse_connect_url: SiteSetting.discourse_connect_url,
  force_https: SiteSetting.respond_to?(:force_https) ? SiteSetting.force_https : nil,
  game_host: game_host,
  forum_host: forum_host,
}.to_json)
RUBY

echo "DiscourseConnect production settings applied."

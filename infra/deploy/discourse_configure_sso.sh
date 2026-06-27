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
BRIDGE_PUBLIC_ORIGIN=${BRIDGE_PUBLIC_ORIGIN:-${GAME_PUBLIC_ORIGIN:-}}
FORUM_SSO_RETURN_URL=${FORUM_SSO_RETURN_URL:-${GAME_PUBLIC_ORIGIN:-}/forums/discourse-connect}
DISCOURSE_PROVIDER_SECRET=${DISCOURSE_PROVIDER_SECRET:-${FORUM_SSO_SECRET:-}}
DISCOURSE_DEFAULT_LOCALE=${DISCOURSE_DEFAULT_LOCALE:-zh_CN}
DISCOURSE_ALLOW_USER_LOCALE=${DISCOURSE_ALLOW_USER_LOCALE:-true}

export FORUM_ORIGIN
export BRIDGE_PUBLIC_ORIGIN
export FORUM_SSO_RETURN_URL
export DISCOURSE_PROVIDER_SECRET
export DISCOURSE_DEFAULT_LOCALE
export DISCOURSE_ALLOW_USER_LOCALE

command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker info >/dev/null 2>&1 || fail "docker daemon is not reachable"

required_vars=(
  GAME_PUBLIC_ORIGIN
  BRIDGE_PUBLIC_ORIGIN
  DISCOURSE_HOSTNAME
  FORUM_SSO_SECRET
  DISCOURSE_PROVIDER_SECRET
)

for name in "${required_vars[@]}"; do
  require_var "$name"
done

if [[ ${#FORUM_SSO_SECRET} -lt 32 ]]; then
  fail "FORUM_SSO_SECRET should be at least 32 characters"
fi
if [[ ${#DISCOURSE_PROVIDER_SECRET} -lt 32 ]]; then
  fail "DISCOURSE_PROVIDER_SECRET should be at least 32 characters"
fi

if [[ "$FORUM_ORIGIN" != "https://$DISCOURSE_HOSTNAME" ]]; then
  warn "FORUM_ORIGIN does not match https://DISCOURSE_HOSTNAME"
fi
if [[ "$BRIDGE_PUBLIC_ORIGIN" != "$GAME_PUBLIC_ORIGIN" ]]; then
  warn "BRIDGE_PUBLIC_ORIGIN differs from GAME_PUBLIC_ORIGIN; make sure /bind and /api route to Bridge"
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
  -e GM_DISCOURSE_PROVIDER_SECRET="$DISCOURSE_PROVIDER_SECRET" \
  -e GM_GAME_PUBLIC_ORIGIN="$GAME_PUBLIC_ORIGIN" \
  -e GM_BRIDGE_PUBLIC_ORIGIN="$BRIDGE_PUBLIC_ORIGIN" \
  -e GM_FORUM_ORIGIN="$FORUM_ORIGIN" \
  -e GM_DISCOURSE_DEFAULT_LOCALE="$DISCOURSE_DEFAULT_LOCALE" \
  -e GM_DISCOURSE_ALLOW_USER_LOCALE="$DISCOURSE_ALLOW_USER_LOCALE" \
  "$DISCOURSE_CONTAINER" \
  bash -lc 'cd /var/www/discourse && bundle exec rails runner -' <<'RUBY'
require "uri"

def env_bool(name, default)
  value = ENV.fetch(name, default.to_s).downcase
  %w[1 true yes on].include?(value)
end

game_origin = ENV.fetch("GM_GAME_PUBLIC_ORIGIN")
bridge_origin = ENV.fetch("GM_BRIDGE_PUBLIC_ORIGIN")
forum_origin = ENV.fetch("GM_FORUM_ORIGIN")
callback_url = ENV.fetch("GM_FORUM_SSO_RETURN_URL")
secret = ENV.fetch("GM_FORUM_SSO_SECRET")
provider_secret = ENV.fetch("GM_DISCOURSE_PROVIDER_SECRET")

game_host = URI(game_origin).host
bridge_host = URI(bridge_origin).host
forum_host = URI(forum_origin).host

SiteSetting.enable_discourse_connect = true
SiteSetting.discourse_connect_url = callback_url
SiteSetting.discourse_connect_secret = secret
SiteSetting.discourse_connect_csrf_protection = true if SiteSetting.respond_to?(:discourse_connect_csrf_protection=)
SiteSetting.force_https = true if SiteSetting.respond_to?(:force_https=)

if SiteSetting.respond_to?(:enable_discourse_connect_provider=)
  SiteSetting.enable_discourse_connect_provider = true
end

provider_pair = "#{bridge_host}|#{provider_secret}"
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

locale_settings = {
  default_locale: ENV.fetch("GM_DISCOURSE_DEFAULT_LOCALE", "zh_CN"),
  allow_user_locale: env_bool("GM_DISCOURSE_ALLOW_USER_LOCALE", true),
  set_locale_from_accept_language_header: false,
}

locale_settings.each do |key, value|
  setter = "#{key}="
  SiteSetting.public_send(setter, value) if SiteSetting.respond_to?(setter)
end

if SiteSetting.respond_to?(:discourse_connect_allowed_redirect_domains=) && game_host && game_host != forum_host
  current = SiteSetting.discourse_connect_allowed_redirect_domains.to_s.split("|").map(&:strip).reject(&:empty?)
  SiteSetting.discourse_connect_allowed_redirect_domains = (current + [game_host]).uniq.join("|")
end

puts({
  ok: true,
  enable_discourse_connect: SiteSetting.enable_discourse_connect,
  discourse_connect_url: SiteSetting.discourse_connect_url,
  force_https: SiteSetting.respond_to?(:force_https) ? SiteSetting.force_https : nil,
  default_locale: SiteSetting.respond_to?(:default_locale) ? SiteSetting.default_locale : nil,
  game_host: game_host,
  bridge_host: bridge_host,
  forum_host: forum_host,
}.to_json)
RUBY

echo "DiscourseConnect production settings applied."

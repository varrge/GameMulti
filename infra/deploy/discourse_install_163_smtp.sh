#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TEMPLATE=${DISCOURSE_APP_TEMPLATE:-"$SCRIPT_DIR/../forum/discourse-prod/app.yml"}
APP_YML=${DISCOURSE_APP_YML:-/var/discourse/containers/app.yml}
REAL_IP_TEMPLATE=${DISCOURSE_REAL_IP_TEMPLATE:-"$SCRIPT_DIR/../forum/discourse-prod/onepanel-real-ip.conf"}
REAL_IP_CONFIG=${DISCOURSE_REAL_IP_CONFIG:-/var/discourse/shared/standalone/config/onepanel-real-ip.conf}
EMAIL=${1:-}

if [[ ! "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo "用法: bash $0 完整的163邮箱地址" >&2
  exit 1
fi

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Discourse 模板不存在: $TEMPLATE" >&2
  exit 1
fi

if [[ ! -f "$REAL_IP_TEMPLATE" ]]; then
  echo "1Panel real-ip 配置不存在: $REAL_IP_TEMPLATE" >&2
  exit 1
fi

read -r -s -p "请输入 163 SMTP 授权码（输入不可见）: " SMTP_PASSWORD
printf '\n'

if [[ ! "$SMTP_PASSWORD" =~ ^[A-Za-z0-9]{6,64}$ ]]; then
  echo "授权码格式异常：应为 6-64 位字母或数字。" >&2
  exit 1
fi

umask 077
tmp=$(mktemp)
trap 'rm -f "$tmp"; unset SMTP_PASSWORD' EXIT

sed \
  -e "s|__DISCOURSE_EMAIL__|$EMAIL|g" \
  -e "s|__DISCOURSE_SMTP_PASSWORD__|$SMTP_PASSWORD|g" \
  "$TEMPLATE" > "$tmp"

if grep -q '__DISCOURSE_' "$tmp"; then
  echo "Discourse 模板仍有未替换的占位符。" >&2
  exit 1
fi

sudo install -m 600 -o root -g root "$tmp" "$APP_YML"
sudo install -d -m 755 -o root -g root "$(dirname "$REAL_IP_CONFIG")"
sudo install -m 644 -o root -g root "$REAL_IP_TEMPLATE" "$REAL_IP_CONFIG"
echo "已安全写入 $APP_YML，文件权限为 0600。"

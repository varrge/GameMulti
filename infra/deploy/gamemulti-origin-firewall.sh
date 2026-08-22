#!/usr/bin/env bash
set -euo pipefail

ACTION=${1:-apply}
INGRESS_PROXY_IP=${INGRESS_PROXY_IP:-}
INGRESS_ORIGIN_IP=${INGRESS_ORIGIN_IP:-}
INGRESS_PORTS=${INGRESS_PORTS:-1050,1051}
CHAIN=${INGRESS_CHAIN:-GAMEMULTI_ORIGIN}
HOOK_COMMENT=gamemulti-origin-allowlist

fail() {
  echo "$*" >&2
  exit 1
}

if [[ $(id -u) -ne 0 ]]; then
  fail "请使用 root 运行：sudo $0 $ACTION"
fi

command -v iptables >/dev/null 2>&1 || fail "未找到 iptables"

if ! iptables -nL DOCKER-USER >/dev/null 2>&1; then
  fail "未找到 DOCKER-USER；请先启动 Docker"
fi

remove_hook() {
  while iptables -w -C DOCKER-USER \
    -m comment --comment "$HOOK_COMMENT" -j "$CHAIN" >/dev/null 2>&1; do
    iptables -w -D DOCKER-USER \
      -m comment --comment "$HOOK_COMMENT" -j "$CHAIN"
  done
}

remove_rules() {
  remove_hook
  if iptables -nL "$CHAIN" >/dev/null 2>&1; then
    iptables -w -F "$CHAIN"
    iptables -w -X "$CHAIN"
  fi
}

validate_ipv4() {
  local name=$1
  local value=$2
  [[ "$value" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || \
    fail "$name 必须是 IPv4 地址"

  local octet
  IFS=. read -r -a octets <<< "$value"
  for octet in "${octets[@]}"; do
    (( octet >= 0 && octet <= 255 )) || fail "$name 非法"
  done
}

apply_rules() {
  validate_ipv4 INGRESS_PROXY_IP "$INGRESS_PROXY_IP"
  validate_ipv4 INGRESS_ORIGIN_IP "$INGRESS_ORIGIN_IP"

  if ! iptables -nL "$CHAIN" >/dev/null 2>&1; then
    iptables -w -N "$CHAIN"
  fi
  iptables -w -F "$CHAIN"

  local port
  IFS=, read -r -a ports <<< "$INGRESS_PORTS"
  for port in "${ports[@]}"; do
    [[ "$port" =~ ^[0-9]+$ ]] || fail "INGRESS_PORTS 包含非法端口: $port"
    (( port >= 1 && port <= 65535 )) || fail "端口超出范围: $port"

    iptables -w -A "$CHAIN" \
      -p tcp -s "$INGRESS_PROXY_IP" \
      -m conntrack --ctdir ORIGINAL \
      --ctorigdst "$INGRESS_ORIGIN_IP" --ctorigdstport "$port" \
      -j ACCEPT
    iptables -w -A "$CHAIN" \
      -p tcp \
      -m conntrack --ctdir ORIGINAL \
      --ctorigdst "$INGRESS_ORIGIN_IP" --ctorigdstport "$port" \
      -j DROP
  done
  iptables -w -A "$CHAIN" -j RETURN

  remove_hook
  iptables -w -I DOCKER-USER 1 \
    -m comment --comment "$HOOK_COMMENT" -j "$CHAIN"
}

case "$ACTION" in
  apply)
    apply_rules
    ;;
  remove)
    remove_rules
    ;;
  status)
    iptables -w -S DOCKER-USER
    if iptables -nL "$CHAIN" >/dev/null 2>&1; then
      iptables -w -S "$CHAIN"
    fi
    ;;
  *)
    fail "用法: $0 apply|remove|status"
    ;;
esac

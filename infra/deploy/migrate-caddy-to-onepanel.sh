#!/usr/bin/env bash
set -euo pipefail

ACTION=${1:-status}
REPO_ROOT=${REPO_ROOT:-/opt/gamemulti/current}
DISCOURSE_DIR=${DISCOURSE_DIR:-/var/discourse}
APP_YML=${DISCOURSE_APP_YML:-$DISCOURSE_DIR/containers/app.yml}
COMPOSE_DIR=${COMPOSE_DIR:-$REPO_ROOT/infra/compose}
ENV_FILE=${ENV_FILE:-$COMPOSE_DIR/.env}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/gamemulti-caddy-to-onepanel}
ORIGIN_IP=${INGRESS_ORIGIN_IP:-192.168.110.243}
FORUM_PORT=${FORUM_ORIGIN_PORT:-1050}
BRIDGE_PORT=${BRIDGE_ORIGIN_PORT:-1051}
CADDY_CONTAINER=${CADDY_CONTAINER:-gamemulti-caddy}
FIREWALL_SERVICE=gamemulti-origin-firewall.service

fail() {
  echo "$*" >&2
  exit 1
}

require_root() {
  [[ $(id -u) -eq 0 ]] || fail "请使用 sudo 运行：sudo $0 $ACTION"
}

require_paths() {
  [[ -f "$APP_YML" ]] || fail "未找到 Discourse 配置: $APP_YML"
  [[ -f "$ENV_FILE" ]] || fail "未找到 Bridge 环境文件: $ENV_FILE"
  [[ -f "$COMPOSE_DIR/docker-compose.yml" ]] || fail "未找到 Bridge compose"
  [[ -f "$COMPOSE_DIR/docker-compose.prod.yml" ]] || fail "未找到生产 compose 覆盖"
  [[ -x "$REPO_ROOT/infra/deploy/gamemulti-origin-firewall.sh" ]] || \
    fail "未找到源站防火墙脚本"
  [[ -f "$REPO_ROOT/infra/nginx/onepanel-origin.conf" ]] || \
    fail "未找到 1Panel Nginx 配置"
  [[ -f "$REPO_ROOT/infra/forum/discourse-prod/onepanel-real-ip.conf" ]] || \
    fail "未找到 Discourse real-ip 配置"
}

backup_configs() {
  install -d -m 700 "$BACKUP_DIR"
  if [[ ! -f "$BACKUP_DIR/app.yml" ]]; then
    cp -a "$APP_YML" "$BACKUP_DIR/app.yml"
  fi
  if [[ ! -f "$BACKUP_DIR/compose.env" ]]; then
    cp -a "$ENV_FILE" "$BACKUP_DIR/compose.env"
  fi
}

set_env_value() {
  local name=$1
  local value=$2
  local tmp
  tmp=$(mktemp)
  awk -F= -v key="$name" -v value="$value" '
    BEGIN { replaced = 0 }
    $1 == key {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (!replaced) print key "=" value
    }
  ' "$ENV_FILE" > "$tmp"
  install -m 600 -o "$(stat -c %u "$ENV_FILE")" -g "$(stat -c %g "$ENV_FILE")" \
    "$tmp" "$ENV_FILE"
  rm -f "$tmp"
}

patch_discourse_config() {
  if grep -Fq "127.0.0.1:8081:80" "$APP_YML"; then
    sed -i "s|127.0.0.1:8081:80|${ORIGIN_IP}:${FORUM_PORT}:80|" "$APP_YML"
  elif ! grep -Fq "${ORIGIN_IP}:${FORUM_PORT}:80" "$APP_YML"; then
    fail "Discourse expose 不是预期的旧值或新值，拒绝自动修改"
  fi

  # Remove the earlier build-time hook variant if a previous prepare attempt added it.
  if grep -Fq "  after_web_config:" "$APP_YML" && \
    grep -Fq "40-onepanel-real-ip.conf" "$APP_YML"; then
    sed -i '/^  after_web_config:$/,/^          real_ip_recursive on;$/d' "$APP_YML"
  fi

  if ! grep -Fq "/var/discourse/shared/standalone/config/onepanel-real-ip.conf" "$APP_YML"; then
    local tmp
    tmp=$(mktemp)
    awk '
      BEGIN { inserted = 0 }
      !inserted && /^hooks:/ {
        print "  - volume:"
        print "      host: /var/discourse/shared/standalone/config/onepanel-real-ip.conf"
        print "      guest: /etc/nginx/conf.d/outlets/before-server/40-onepanel-real-ip.conf"
        inserted = 1
      }
      { print }
      END { if (!inserted) exit 1 }
    ' "$APP_YML" > "$tmp"
    install -m 600 -o root -g root "$tmp" "$APP_YML"
    rm -f "$tmp"
  fi
}

install_discourse_real_ip_config() {
  local target="$DISCOURSE_DIR/shared/standalone/config/onepanel-real-ip.conf"
  install -d -m 755 "$(dirname "$target")"
  install -m 644 \
    "$REPO_ROOT/infra/forum/discourse-prod/onepanel-real-ip.conf" \
    "$target"
}

install_firewall_service() {
  install -m 644 \
    "$REPO_ROOT/infra/deploy/gamemulti-origin-firewall.service.example" \
    "/etc/systemd/system/$FIREWALL_SERVICE"
  systemctl daemon-reload
  systemctl enable --now "$FIREWALL_SERVICE"
  systemctl is-active --quiet "$FIREWALL_SERVICE"
}

prepare() {
  require_root
  require_paths
  backup_configs
  set_env_value HOST_HTTP_PORT "${ORIGIN_IP}:${BRIDGE_PORT}"
  set_env_value DEPLOY_HEALTH_URL "http://${ORIGIN_IP}:${BRIDGE_PORT}/api/healthz"
  set_env_value NGINX_CONF "../nginx/onepanel-origin.conf"
  install_discourse_real_ip_config
  patch_discourse_config
  install_firewall_service
  echo "prepare_ok"
}

bootstrap() {
  require_root
  require_paths
  systemctl is-active --quiet "$FIREWALL_SERVICE" || fail "源站防火墙服务未运行"
  install -d -m 700 "$BACKUP_DIR"
  local log="$BACKUP_DIR/discourse-bootstrap.log"
  local socket="$DISCOURSE_DIR/shared/standalone/postgres_run/.s.PGSQL.5432"
  local app_was_running=0

  if [[ $(docker inspect -f '{{.State.Running}}' app 2>/dev/null || true) == "true" ]]; then
    app_was_running=1
    docker stop app >/dev/null
  fi

  restore_old_app() {
    if [[ $app_was_running -eq 1 ]]; then
      docker start app >/dev/null 2>&1 || true
    fi
  }
  trap restore_old_app EXIT

  local attempt
  for attempt in $(seq 1 30); do
    [[ ! -S "$socket" ]] && break
    sleep 1
  done
  [[ ! -S "$socket" ]] || fail "旧 Discourse 停止后 PostgreSQL socket 仍被占用"

  umask 077
  if ! (cd "$DISCOURSE_DIR" && ./launcher bootstrap app) >"$log" 2>&1; then
    echo "Discourse bootstrap 失败；受保护日志保留在 $log" >&2
    exit 1
  fi
  rm -f "$log"
  restore_old_app
  trap - EXIT
  echo "bootstrap_ok"
}

compose_nginx() {
  (cd "$COMPOSE_DIR" && docker compose \
    --project-name gamemulti \
    --env-file "$ENV_FILE" \
    -f docker-compose.yml \
    -f docker-compose.prod.yml \
    up -d --no-deps --force-recreate nginx)
}

start_discourse_from_current_config() {
  local log="$BACKUP_DIR/discourse-start.log"
  umask 077
  (cd "$DISCOURSE_DIR" && ./launcher destroy app) >"$log" 2>&1 || true
  if ! (cd "$DISCOURSE_DIR" && ./launcher start app) >>"$log" 2>&1; then
    echo "Discourse start 失败；受保护日志保留在 $log" >&2
    return 1
  fi
  rm -f "$log"
}

origin_healthcheck() {
  local attempt
  for attempt in $(seq 1 60); do
    if curl -fsS \
      -H 'Host: bbs.game-mp.cn' \
      -H 'X-Forwarded-Proto: https' \
      "http://${ORIGIN_IP}:${FORUM_PORT}/" >/dev/null 2>&1 && \
      curl -fsS \
        -H 'Host: sso.game-mp.cn' \
        -H 'X-Forwarded-Proto: https' \
        "http://${ORIGIN_IP}:${BRIDGE_PORT}/api/healthz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  require_root
  [[ -f "$BACKUP_DIR/app.yml" ]] || fail "缺少回滚 app.yml"
  [[ -f "$BACKUP_DIR/compose.env" ]] || fail "缺少回滚 compose.env"

  cp -a "$BACKUP_DIR/app.yml" "$APP_YML"
  cp -a "$BACKUP_DIR/compose.env" "$ENV_FILE"
  compose_nginx
  start_discourse_from_current_config
  docker start "$CADDY_CONTAINER" >/dev/null 2>&1 || true
  systemctl disable --now "$FIREWALL_SERVICE" >/dev/null 2>&1 || true
  echo "rollback_ok"
}

activate() {
  require_root
  require_paths
  systemctl is-active --quiet "$FIREWALL_SERVICE" || fail "源站防火墙服务未运行"
  docker image inspect local_discourse/app >/dev/null 2>&1 || fail "缺少预构建的 Discourse 镜像"

  trap 'status=$?; trap - ERR; echo "切换失败，正在恢复 Caddy 链路" >&2; rollback; exit $status' ERR
  docker stop "$CADDY_CONTAINER" >/dev/null
  compose_nginx
  start_discourse_from_current_config
  origin_healthcheck
  trap - ERR
  echo "activate_ok"
}

finalize() {
  require_root
  origin_healthcheck || fail "源站健康检查未通过，拒绝移除 Caddy 容器"
  if docker container inspect "$CADDY_CONTAINER" >/dev/null 2>&1; then
    docker rm "$CADDY_CONTAINER" >/dev/null
  fi
  if [[ -d "$REPO_ROOT/infra/gateway" && ! -e "$BACKUP_DIR/gateway" ]]; then
    mv "$REPO_ROOT/infra/gateway" "$BACKUP_DIR/gateway"
  fi
  rm -f "$BACKUP_DIR/discourse-bootstrap.log"
  echo "finalize_ok"
}

status() {
  require_root
  systemctl is-active "$FIREWALL_SERVICE" 2>/dev/null || true
  docker ps -a --filter "name=^/app$" --filter "name=^/gamemulti-nginx$" \
    --filter "name=^/${CADDY_CONTAINER}$" \
    --format '{{.Names}} {{.Ports}} {{.Status}}'
  ss -ltnp | awk -v forum=":${FORUM_PORT}" -v bridge=":${BRIDGE_PORT}" \
    '$4 ~ forum || $4 ~ bridge { print }'
}

case "$ACTION" in
  prepare) prepare ;;
  bootstrap) bootstrap ;;
  activate) activate ;;
  rollback) rollback ;;
  finalize) finalize ;;
  status) status ;;
  *) fail "用法: $0 prepare|bootstrap|activate|rollback|finalize|status" ;;
esac

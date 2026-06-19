#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
COMPOSE_DIR="$REPO_ROOT/infra/compose"
ENV_FILE="$COMPOSE_DIR/.env"

if ! command -v git >/dev/null 2>&1; then
  echo "git 未安装，无法继续。" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "未找到环境变量文件: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DEPLOY_REMOTE=${DEPLOY_REMOTE:-origin}
DEPLOY_BRANCH=${DEPLOY_BRANCH:-$(git -C "$REPO_ROOT" branch --show-current)}
DEPLOY_UPDATE_MODE=${DEPLOY_UPDATE_MODE:-ff-only}
DEPLOY_HEALTH_URL=${DEPLOY_HEALTH_URL:-http://127.0.0.1:${HOST_HTTP_PORT:-8080}/api/healthz}
DEPLOY_HEALTH_ATTEMPTS=${DEPLOY_HEALTH_ATTEMPTS:-30}
DEPLOY_HEALTH_DELAY_SECONDS=${DEPLOY_HEALTH_DELAY_SECONDS:-3}

if [[ -z "$DEPLOY_BRANCH" ]]; then
  echo "DEPLOY_BRANCH 未设置，且无法从当前 git 分支推断。" >&2
  exit 1
fi

cd "$REPO_ROOT"

before_rev=$(git rev-parse --short HEAD)
echo "==> 当前版本: $before_rev"
echo "==> 更新来源: $DEPLOY_REMOTE/$DEPLOY_BRANCH"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "检测到已跟踪文件存在本地改动，停止更新，避免覆盖服务器现场改动：" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

echo "==> 拉取远端元数据"
git fetch --prune "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"

target_ref="$DEPLOY_REMOTE/$DEPLOY_BRANCH"
target_rev=$(git rev-parse --short "$target_ref")

if [[ "$before_rev" == "$target_rev" ]]; then
  echo "==> 已是最新版本: $target_rev"
else
  case "$DEPLOY_UPDATE_MODE" in
    ff-only)
      echo "==> fast-forward 到 $target_rev"
      git merge --ff-only "$target_ref"
      ;;
    reset)
      echo "==> reset 到 $target_rev"
      git reset --hard "$target_ref"
      ;;
    *)
      echo "DEPLOY_UPDATE_MODE 只支持 ff-only 或 reset，当前: $DEPLOY_UPDATE_MODE" >&2
      exit 1
      ;;
  esac
fi

after_rev=$(git rev-parse --short HEAD)
echo "==> 部署版本: $after_rev"

echo "==> 重启 GameMulti"
bash "$SCRIPT_DIR/up.sh"

if command -v curl >/dev/null 2>&1; then
  echo "==> 健康检查: $DEPLOY_HEALTH_URL"
  for attempt in $(seq 1 "$DEPLOY_HEALTH_ATTEMPTS"); do
    if curl -fsS "$DEPLOY_HEALTH_URL" >/dev/null; then
      echo "==> 更新完成: $after_rev"
      exit 0
    fi
    echo "等待服务健康 ($attempt/$DEPLOY_HEALTH_ATTEMPTS)"
    sleep "$DEPLOY_HEALTH_DELAY_SECONDS"
  done

  echo "健康检查失败: $DEPLOY_HEALTH_URL" >&2
  exit 1
fi

echo "curl 未安装，已跳过健康检查。"
echo "==> 更新完成: $after_rev"

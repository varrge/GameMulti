# 验收摘要

- 真实仓库路径：`/home/yinan/.openclaw/workspace/GameMulti`
- 统一入口：`infra/deploy/up.sh`
- 关键配置：`infra/compose/docker-compose.yml`、`infra/compose/.env.example`、`infra/nginx/default.conf`
- 默认源码目录已指向真实仓库：`/home/yinan/.openclaw/workspace/GameMulti/apps/web`
- 启动前检查：脚本会校验 `docker`、`docker compose`、compose 文件、`.env`、`WEB_SOURCE_DIR`、`package.json`、nginx 配置；缺项即退出
- 最少必填变量：`WEB_SOURCE_DIR`
- 默认行为：读取 `infra/compose/.env`，执行 `docker compose up -d --remove-orphans`，随后输出 `docker compose ps`
- 失败退出条件：依赖缺失、配置文件缺失、源码目录不存在、源码目录缺少 `package.json`

## 现场验证证据

- `deploy_up.txt`：直接执行 `bash infra/deploy/up.sh` 的完整输出
- `deploy_up.exitcode`：入口脚本退出码
- `compose_ps.txt`：执行后的服务状态
- `http_check.txt`：`curl -I http://127.0.0.1:8080` 检查输出
- `git_status.txt`：真实仓库 `git status --short`
- `key_files.txt`：关键交付文件路径

## 当前结果

- 入口脚本已可在真实仓库直接执行
- 当前宿主机 `127.0.0.1:8080` 返回 200
- 交付文件均落在真实仓库内，未再引用历史任务临时目录

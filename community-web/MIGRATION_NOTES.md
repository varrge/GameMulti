# Community Web Migration Notes

## 迁入结果

- 正式仓库：`/home/yinan/.openclaw/workspace/GameMulti`
- 主站目录：`community-web/`
- 来源压缩包：`/home/yinan/.openclaw/media/inbound/nexus---multi-game-community-platform---fb0bd00f-d328-4120-8f07-c90fd827491f.zip`
- 迁入方式：直接从用户提供 zip 解压到 `GameMulti/community-web/`，作为正式仓库内的主站源码目录

## 后续前端改造唯一落点

以下改造统一只在 `community-web/` 内实现，不再分散到临时目录或其他仓库：

1. `/forums` 入口页
2. 导航栏论坛按钮
3. 登录成功后的默认跳转 `/forums`

## 分支与合并路径

- 当前执行基线：`develop` 基线要求下的正式仓库落点为 `GameMulti/community-web/`
- 当前本地工作仓分支：以 `GameMulti` 仓库中的后续功能分支继续提交
- 合并目标：后续前端改造完成后，统一合并到 `devops` 分支

## 本地验证说明

- 若本地调试需避开 3000 端口，可自行指定其他端口启动
- 但代码与提交记录必须仍然落在 `GameMulti/community-web/`

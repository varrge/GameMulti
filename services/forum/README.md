# Forum Service

论坛作为独立运行服务存在；部署资产与运行说明以这里为入口，具体历史资产当前仍可参考 `infra/forum/`。

## GameMulti 入口

执行 `infra/deploy/discourse_configure_sso.sh` 或本地
`infra/forum/discourse-dev/dev.sh configure-local-sso` 时，会在 Discourse
创建一个“游戏绑定”分类和置顶帖，包含：

- 我的游戏绑定：`<BRIDGE_PUBLIC_ORIGIN>/bind/account`
- 插件安装、服务器审核和在线更新：`<BRIDGE_PUBLIC_ORIGIN>/api/admin/plugin-client-generator`

这只是论坛轻集成：论坛负责注册、登录和社区内容；绑定确认、服务器凭证和审核仍由
GameMulti Bridge 处理。

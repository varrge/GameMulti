# Minecraft PoC Plugin Skeleton

这是一个首个 PoC 游戏插件的最小 Node 版模拟骨架，用来把 **绑定命令、事件上报、状态上报** 这三条最小链路先跑通，方便后续迁移到真正的 Paper/Java 插件实现。

## 目录

```text
plugin-poc/minecraft-js/
  README.md
  bind-live.js
  cli.js
  demo.js
  src/plugin_service.js
```

## 当前覆盖范围

- `/gm bind` 命令对应的绑定会话请求载荷生成
- 真实 `POST /api/plugin/bindings/session` HMAC 签名调用
- 玩家可打开的 `publicBindUrl` 绑定链接输出
- 首次安装 `installToken` claim，换取服务器专属 `clientKey/clientSecret`
- 模拟游戏命令循环：`/gm bind`、`/gm join`、`/gm quit`、`/gm heartbeat`
- `player_join` / `player_quit` / `online_duration` 事件上报骨架
- `heartbeat` 状态上报骨架
- 本地内存队列，便于演示待上报事件堆积情况

## 运行方式

离线 demo：

仓库根目录执行：

```bash
node plugin-poc/minecraft-js/demo.js
```

单元测试：

```bash
npm --workspace plugin-poc/minecraft-js test
```

连接当前本地 GameMulti API 创建真实绑定 session：

```bash
npm --workspace plugin-poc/minecraft-js run bind:live
```

启动模拟游戏命令循环：

```bash
npm --workspace plugin-poc/minecraft-js run cli
```

示例输入：

```text
/gm bind Steve
/gm join Steve
/gm heartbeat
/gm quit Steve
exit
```

可覆盖的环境变量：

```env
GM_API_BASE_URL=http://127.0.0.1:8080
GM_SERVER_CODE=cn-mc-01
GM_PLUGIN_CLIENT_KEY=demo-client
GM_PLUGIN_CLIENT_SECRET=demo-secret
GM_PLAYER_UUID=poc-player-001
GM_PLAYER_NAME=Steve
```

## 最小闭环说明

1. 玩家执行绑定命令，插件签名调用 `POST /api/plugin/bindings/session`
2. Bridge 返回 `pairCode` 和 `publicBindUrl`，插件把它们展示给玩家
3. 玩家上线后记录 `player_join`
4. 定时器触发 `online_duration` 事件上报，用于主站奖励结算
5. 插件通过 `POST /api/game-servers/heartbeat` 发送健康状态与在线人数
6. 玩家离线时记录 `player_quit`

插件链接契约见 `docs/backend/plugin_binding_link_contract.md`。
插件首次安装契约见 `docs/backend/plugin_install_token_flow.md`。

## 后续迁移建议

- 将 `MinecraftPluginPoCService` 迁移为 Java/Paper 插件里的 command handler 与 event listener
- 增加失败重试策略与持久化队列
- 增加命令下发轮询、奖励回执、封禁联动
- 为每种事件增加持久化队列与幂等键

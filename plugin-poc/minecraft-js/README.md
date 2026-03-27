# Minecraft PoC Plugin Skeleton

这是一个首个 PoC 游戏插件的最小 Node 版模拟骨架，用来把 **绑定命令、事件上报、状态上报** 这三条最小链路先跑通，方便后续迁移到真正的 Paper/Java 插件实现。

## 目录

```text
plugin-poc/minecraft-js/
  README.md
  demo.js
  src/plugin_service.js
```

## 当前覆盖范围

- `/gm bind` 命令对应的绑定会话请求载荷生成
- `player_join` / `player_quit` / `online_duration` 事件上报骨架
- `heartbeat` 状态上报骨架
- 本地内存队列，便于演示待上报事件堆积情况

## 运行方式

仓库根目录执行：

```bash
node plugin-poc/minecraft-js/demo.js
```

## 最小闭环说明

1. 玩家执行绑定命令，插件生成 `POST /api/plugin/bindings/session` 请求载荷与配对信息
2. 玩家上线后记录 `player_join`
3. 定时器触发 `online_duration` 事件上报，用于主站奖励结算
4. 插件通过 `POST /api/game-servers/heartbeat` 发送健康状态与在线人数
5. 玩家离线时记录 `player_quit`

## 后续迁移建议

- 将 `MinecraftPluginPoCService` 迁移为 Java/Paper 插件里的 command handler 与 event listener
- 接入真实 HTTP client、签名鉴权和失败重试策略
- 增加命令下发轮询、奖励回执、封禁联动
- 为每种事件增加持久化队列与幂等键

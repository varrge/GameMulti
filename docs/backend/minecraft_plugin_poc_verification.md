# Minecraft PoC 插件实机验证说明

## 目标

把首个 PoC 游戏插件推进到可实机验证状态，先稳定验证这条最小闭环：

1. 游戏内 `/gm bind` 触发绑定会话创建
2. 玩家上线时产生 `player_join` 事件
3. 在线 10 分钟产生 `online_duration` 事件
4. 插件按心跳协议上报服务器状态
5. 玩家离线时产生 `player_quit` 事件

本轮交付仍是 Node 版 PoC，但已经补齐了可直接运行的脚本、自测用例和实机接线说明，方便下一步迁移到 Paper/Java 插件。

## 代码路径

- 插件 PoC 服务：`plugin-poc/minecraft-js/src/plugin_service.js`
- 演示脚本：`plugin-poc/minecraft-js/demo.js`
- 自动化测试：`plugin-poc/minecraft-js/test/plugin_service.test.js`
- 运行配置：`plugin-poc/minecraft-js/package.json`

## 当前支持的命令 / 事件 / 状态

### 命令

- `/gm bind <displayName>`
  - 生成绑定会话请求载荷
  - 目标接口：`POST /api/plugin/bindings/session`
  - 返回：`sessionId`、`token`、`pairCode`、`bindUrl`

### 事件

- `player_join`
  - 来源：玩家上线监听器
  - 目标接口：`POST /api/plugin/events`
- `online_duration`
  - 来源：在线时长定时器
  - 默认示例窗口：10 分钟
  - 目标接口：`POST /api/plugin/events`
- `player_quit`
  - 来源：玩家离线监听器
  - 附带 `sessionDurationSeconds`
  - 目标接口：`POST /api/plugin/events`

### 状态上报

- `heartbeat`
  - 目标接口：`POST /api/game-servers/heartbeat`
  - 字段：`serverId`、`serverCode`、`healthy`、`onlineCount`、`queueDepth`、`sentAt`

## 本地验证环境

- 仓库：`/home/yinan/.openclaw/workspace/GameMulti`
- Node.js：使用系统 Node 运行
- 验证方式：
  - `node plugin-poc/minecraft-js/demo.js`
  - `node --test plugin-poc/minecraft-js/test/plugin_service.test.js`

## 本地验证步骤

在仓库根目录执行：

```bash
cd /home/yinan/.openclaw/workspace/GameMulti
node plugin-poc/minecraft-js/demo.js
node --test plugin-poc/minecraft-js/test/plugin_service.test.js
```

### 预期结果

1. `demo.js` 输出 `bind`、`joinEvent`、`durationEvent`、`heartbeat`、`quitEvent`
2. `bind.endpoint` 指向 `/api/plugin/bindings/session`
3. 事件输出里的 `eventType` 至少覆盖：
   - `player_join`
   - `online_duration`
   - `player_quit`
4. `heartbeat.payload` 中带有：
   - `onlineCount`
   - `queueDepth`
   - `serverId`
   - `serverCode`
5. 自动化测试全部通过

## 实机接线建议

迁移到 Paper/Java 插件时，至少映射下面几个接入点：

- `onEnable` → 初始化 HTTP 客户端、注册命令、启动心跳和在线时长调度器
- `/gm bind` → 调用 `createBindingCommand` 对应逻辑
- `PlayerJoinEvent` → 调用 `recordPlayerJoin`
- 定时任务（每 10 分钟） → 调用 `recordDurationTick`
- `PlayerQuitEvent` → 调用 `recordPlayerQuit`
- 周期健康检查任务 → 调用 `reportStatus`

## 下一步迁移清单

要进入真正“服内可验证”的 Java 插件阶段，下一步建议按顺序补：

1. 把 Node PoC 的事件结构迁移到 Java DTO
2. 接入真实 HTTP client 与超时/重试
3. 增加插件配置文件：API Base URL、serverId、serverCode、pluginClientKey
4. 给事件和心跳增加签名头
5. 在测试服验证 `/gm bind` + join/quit + heartbeat 三条链路

## 对应提交

- 当前基础 PoC 骨架提交：`49606e4 feat: add minecraft plugin poc skeleton`
- 本轮建议在提交后补充新的 commit 哈希到这里，便于交付摘要直接引用

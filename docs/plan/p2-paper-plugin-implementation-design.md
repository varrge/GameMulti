# P2 Paper/Java 插件可实施架构设计

> 状态：首版实施基线（后端开工阻塞已关闭）
> 目标协议：`2026-06-mvp`
> 适用范围：Minecraft Java Edition 的 GameMulti Paper 插件首版
> 非目标：本文件不实现完整插件，不提前实现远程发奖、封禁或通用多游戏 SDK

## 1. 结论与开工门槛

首版插件采用单插件、内部模块化架构，复用现有 Nest API 和 Node PoC 已验证的 HMAC 协议。插件只负责游戏服侧事实采集、绑定入口展示、结果查询和可靠上报；Bridge 继续作为身份、绑定状态、插件凭证和服务器状态的唯一权威。

服内完整绑定闭环所需的后端开工门槛已经关闭：状态查询、结构化错误、协议版本校验、审核状态和绑定创建幂等均已进入正式契约与自动化测试，细节见 14.1。可以开始 Paper 脚手架、传输层和绑定闭环实现。

远程命令 `pending/ack` 当前只有规划稿、没有正式控制器和持久化实现，不进入首版。首版保留模块边界，不创建假接口。

## 2. 依据与现状盘点

### 2.1 已冻结的上层决策

- 插件不访问 Discourse，不构造论坛登录 URL。
- 插件只展示 Bridge 返回的 `publicBindUrl`；仅为旧 Bridge 兼容回退到 `bindUrl`。
- 绑定会话 TTL 为 300 秒。
- Bridge 校验插件凭证、HMAC、时间戳、nonce 和服务器归属。
- 绑定业务状态采用 `pending`、`bound`、`expired`、`cancelled`、`conflict`、`revoked`、`denied`、`unavailable`。
- `discourseUserId` 和最终绑定归属均由 Bridge 处理，插件不得推断或覆盖。
- 远程命令、自动封禁和异步奖励在 P0 基线中属于可延后能力。

### 2.2 必须复用的正式 API

| 能力 | 接口 | 鉴权 | 当前实现 | 首版用途 |
| --- | --- | --- | --- | --- |
| 安装领取 | `POST /api/plugin/installations/claim` | 一次性 install token | 已实现 | 首次生成服务器与客户端凭证 |
| 创建绑定 | `POST /api/plugin/bindings/session` | HMAC | 已实现 | `/gm bind` 创建 5 分钟会话 |
| 上报事件 | `POST /api/plugin/events` | HMAC | 已实现，按 `pluginClientId + eventId` 幂等 | join/quit/online_duration |
| 上报心跳 | `POST /api/game-servers/heartbeat` | HMAC | 已实现，按 `pluginClientId + statusId` 幂等 | 健康、在线数、本地队列深度 |
| 查询绑定状态 | `GET /api/plugin/bindings/{sessionId}` | HMAC | 已实现，按 plugin client/server 隔离且不返回 token | 告知在线玩家最终结果 |

公开的 `GET /api/bindings/session/by-token?token=...` 已实现，但它面向浏览器，并会使敏感 token 进入代理访问日志。Paper 插件不得把它当作状态轮询接口。

### 2.3 当前接口请求字段

安装领取请求：

```json
{
  "installToken": "gmit_xxx",
  "serverCode": "survival-01",
  "serverName": "Survival 01",
  "publicHost": "mc.example.com",
  "publicPort": 25565,
  "pluginVersion": "1.0.0",
  "protocolVersion": "2026-06-mvp",
  "region": "cn-east"
}
```

领取成功响应中的 `pluginClient.clientSecret` 只返回一次。插件必须先持久化并验证落盘，再擦除 `installToken`；任何一步失败都进入明确的恢复状态，不能自动重复领取。

绑定创建请求：

```json
{
  "requestId": "bind_01J...",
  "serverCode": "survival-01",
  "gameCode": "minecraft",
  "platform": "java",
  "gameUserId": "550e8400-e29b-41d4-a716-446655440000",
  "displayName": "Steve",
  "bindMode": "bind_existing"
}
```

事件请求：

```json
{
  "eventId": "evt_01J...",
  "serverCode": "survival-01",
  "serverId": "optional-server-id",
  "eventType": "player_join",
  "playerUuid": "550e8400-e29b-41d4-a716-446655440000",
  "displayName": "Steve",
  "occurredAt": "2026-08-17T10:30:00Z",
  "metadata": { "source": "player_join_listener" }
}
```

心跳请求：

```json
{
  "statusId": "status_01J...",
  "serverCode": "survival-01",
  "serverId": "optional-server-id",
  "healthy": true,
  "onlineCount": 12,
  "queueDepth": 4,
  "sentAt": "2026-08-17T10:30:00Z",
  "metadata": {
    "publicHost": "mc.example.com",
    "publicPort": 25565,
    "pluginVersion": "1.0.0",
    "paperVersion": "1.21.11"
  }
}
```

首版事件逐条发送，沿用现有 API。批量事件端点必须作为后续协议扩展，不能让插件自行向单事件接口发送数组。

## 3. 协议 `2026-06-mvp` 冻结

### 3.1 HTTP 基线

- 只允许 HTTPS；仅当 `development.allowInsecureHttp=true` 且目标是 loopback/私网测试地址时允许 HTTP。
- JSON 编码固定 UTF-8，`Content-Type: application/json`。
- API base URL 去掉结尾 `/`，不得包含 query、fragment 或用户凭证。
- 连接超时 3 秒，请求总超时 8 秒；绑定命令总等待预算 10 秒。
- 响应体上限 1 MiB，超限立即失败并记录脱敏错误。
- 插件发送 `User-Agent: GameMulti-Paper/<pluginVersion>` 和 `X-GM-Protocol-Version: 2026-06-mvp`；服务端会同时校验允许版本和凭证版本。

### 3.2 HMAC 规范

签名头固定为：

```text
X-GM-Client-Key: <clientKey>
X-GM-Timestamp: <Unix epoch seconds>
X-GM-Nonce: <32-byte random value encoded as 64 lowercase hex chars>
X-GM-Signature: <64 lowercase hex chars>
X-GM-Protocol-Version: 2026-06-mvp
```

签名明文严格为五行，行尾不追加换行：

```text
UPPERCASE_METHOD
PATH_WITHOUT_QUERY
UNIX_SECONDS
NONCE
LOWERCASE_HEX_SHA256(EXACT_REQUEST_BODY_BYTES)
```

签名为：

```text
lowercase_hex(HMAC-SHA256(clientSecret UTF-8 bytes, signingPayload UTF-8 bytes))
```

实现约束：

- JSON 只序列化一次；SHA-256 和 HTTP 发送必须使用同一份 byte array，禁止签名后再次序列化。
- path 使用实际发送的绝对路径，例如 `/api/plugin/events`，不含 scheme、host 和 query。
- 每一次网络尝试生成新 timestamp 和 nonce。业务 `eventId`/`statusId` 保持不变以获得幂等；绝不能重放整份带旧 nonce 的请求。
- nonce 使用 `SecureRandom`，不使用 UUID 截断、玩家 UUID、时间戳或计数器。
- 服务端当前允许正负 300 秒偏差并保存 nonce 600 秒。插件启动时若系统时间明显异常，只上报本地诊断，不尝试自行修改系统时钟。
- HMAC 比较由后端常量时间完成；插件不记录签名明文、secret、完整签名或 nonce。

### 3.3 时钟偏差恢复

首版不依赖未签名的任意响应来永久校时。推荐后端在 `CLOCK_SKEW` 错误中返回 `serverTime`（epoch seconds）并带标准 HTTP `Date` 头；插件只计算本进程内、最大正负 300 秒的临时偏移，且仅在 TLS 校验成功时采用。偏移在重启后清零。

一次请求收到明确 `CLOCK_SKEW` 后最多使用服务端时间立即重试一次，新建 nonce；再次失败则熔断签名请求 60 秒，并提示管理员校准主机 NTP。普通 401 不触发校时。

### 3.4 版本兼容策略

- `protocolVersion` 是线协议版本，不等同于插件版本或 Minecraft 版本。
- `2026-06-mvp` 在首版内保持现有字段名称、类型、签名五行格式和路径不变。
- 响应允许新增可选字段；插件忽略未知字段。
- 删除字段、改变类型/语义、改变签名规范、收紧现有枚举或改变路径必须发布新协议版本。
- 请求新增字段必须先为可选；服务端当前启用了 `forbidNonWhitelisted`，因此旧后端不接受插件擅自新增字段。
- 插件只发送当前协商版本定义的字段，不把 Paper/Minecraft 新字段直接塞进顶层；扩展诊断放入有大小限制的 `metadata`。
- 服务端返回 `426 PROTOCOL_UNSUPPORTED` 时停止业务重试，心跳降频到 5 分钟，仅用于发现恢复；控制台输出升级指引。
- 首版插件只支持一个线协议。后续最多同时支持当前版和前一版，兼容窗口至少覆盖一个插件发布周期。

## 4. Paper/JDK 支持范围

### 4.1 首版支持矩阵

| 项目 | 首版决定 |
| --- | --- |
| 编译 JDK | Temurin/OpenJDK 21 LTS |
| bytecode | `--release 21` |
| Paper API 编译基线 | `paper-api:1.21.4-R0.1-SNAPSHOT`，构建时锁定已验证依赖而非动态 `latest` |
| 运行服务器 | Paper 1.21.4 至 1.21.11 |
| 运行 JDK | 21；服务器自身要求更高 JDK 时可在更高 JDK 运行同一 Java 21 bytecode |
| `plugin.yml api-version` | `1.21` |
| 明确不支持 | Spigot、CraftBukkit、Folia、Paper 1.20.x、代理端插件、Minecraft 26.1+ |

选择 1.21.4 作为编译下界，插件只使用 Bukkit/Paper 公共 API，不依赖 NMS、CraftBukkit、反射映射或 `paperweight-userdev`。CI 至少在最低版 1.21.4 和最高声明版 1.21.11 做加载及核心闭环测试。Folia 的区域线程模型与本设计不同，必须单独评审后再声明支持。

当 Paper 的版本/JDK命名进入 26.x 后，作为新的兼容轨道处理；未经测试不得只修改 `api-version` 宣称兼容。

### 4.2 构建和发布

建议新增独立 Gradle 子项目 `plugins/paper/`：

```text
plugins/paper/
  build.gradle.kts
  settings.gradle.kts
  gradle/wrapper/
  src/main/java/...
  src/main/resources/plugin.yml
  src/main/resources/config.yml
  src/test/java/...
```

- 使用 Gradle Wrapper，版本在仓库中固定。
- `paper-api` 为 `compileOnly`。
- HTTP 使用 JDK `java.net.http.HttpClient`；JSON 使用 Jackson 并通过 Shadow 插件 relocate，避免与其他插件类路径冲突。
- 产物名 `gamemulti-paper-<pluginSemVer>.jar`，不生成包含 `-all` 的第二个模糊产物。
- CI 执行格式检查、单元测试、签名向量测试、Paper 加载 smoke test、依赖漏洞扫描、构建和 SHA-256 生成。
- 发布附带 jar、SHA-256、变更说明、支持矩阵和协议版本。tag 使用 `paper-vX.Y.Z`。
- 构建必须可重复；发布任务不得从工作区读取真实 `credentials.yml`、install token 或环境密钥。

## 5. 模块边界

```text
Paper entrypoint
  ├─ bootstrap/config        配置校验、生命周期、健康状态
  ├─ paper-adapter           命令、事件监听、主线程快照和消息
  ├─ binding                创建会话、跟踪在线玩家、轮询状态
  ├─ telemetry              事件、在线时长和心跳建模
  ├─ transport              HTTP、HMAC、超时、错误映射、重试
  ├─ credentials            领取、原子存储、轮换、擦除
  ├─ outbox                 有界磁盘离线队列和重放
  └─ diagnostics            脱敏日志、状态命令、版本信息
```

边界规则：

- `paper-adapter` 是唯一可直接调用 Bukkit/Paper API 的模块。
- 领域模块只接收不可变快照 DTO，不持有 `Player`、`Server`、`World` 等 Paper 对象。
- `transport` 不理解玩家消息；只返回结构化成功或错误。
- `outbox` 只存可幂等的事件。绑定创建不离线排队，避免玩家收到已过期链接；心跳只保留最新一条，不积压历史心跳。
- `credentials` 不向其他模块返回可打印对象；只以受限的签名器接口使用 secret。
- 远程命令未来放在独立 `command-inbox`，不得复用事件 outbox，也不得在 HTTP 线程执行游戏命令。

## 6. 配置与凭证

### 6.1 `plugins/GameMulti/config.yml`

```yaml
api:
  base-url: "https://app.example.com"
  protocol-version: "2026-06-mvp"
  connect-timeout-ms: 3000
  request-timeout-ms: 8000

server:
  name: "Survival 01"
  code: "survival-01"
  public-host: "mc.example.com"
  public-port: 25565
  region: "cn-east"

binding:
  poll-interval-seconds: 3
  max-active-sessions: 200

telemetry:
  heartbeat-interval-seconds: 60
  duration-interval-seconds: 600

outbox:
  max-events: 10000
  max-bytes: 52428800
  flush-batch-size: 50

logging:
  level: "INFO"
  include-player-display-name: false

development:
  allow-insecure-http: false
```

启动时严格校验范围和 URL。无效配置使网络功能进入 `MISCONFIGURED`，但不让 Paper 服务器崩溃。`/gm admin reload` 只重载非凭证配置；base URL、协议版本和凭证变化需要重建 HTTP 客户端与调度任务。

### 6.2 首次领取

管理员将一次性 token 放入 `plugins/GameMulti/install-token.txt`，文件只允许一行。插件启动后：

1. 校验配置和 token 文件权限。
2. 调用 claim，明确标记当前插件和协议版本。
3. 将响应凭证写到同目录临时文件，flush 后原子 rename 为 `credentials.yml`。
4. 重新读取并做格式校验。
5. 删除 `install-token.txt`；若删除失败则清空并告警。
6. 进入 `PENDING_APPROVAL`，以低频健康探测等待后台审核。

领取请求超时具有“不知道服务端是否已消费 token”的歧义，不得无限自动重试。最多重试一次查询型恢复接口；该接口当前缺失，因此首版在领取超时后进入 `CLAIM_OUTCOME_UNKNOWN`，提示管理员到 Bridge 查看并重新签发 token。

### 6.3 安全存储

`credentials.yml` 只包含 `serverId`、`serverCode`、`clientId`、`clientKey`、`clientSecret`、`issuedAt` 和协议版本，不与普通配置混放。

- POSIX 上创建为 owner-only，目标权限 `0600`，目录目标权限 `0700`；检测到 group/other 可读时拒绝联网并给出修复命令。
- Windows 上尽力使用 ACL 限制当前服务账号，并明确记录无法验证 ACL 的告警。
- 不支持可逆“本地加密但密钥同 jar/同目录”的伪保护。若宿主提供 secret manager，可通过后续 `CredentialStore` 扩展接入。
- secret 不进入命令输出、异常消息、toString、metrics、线程名或 crash dump上下文。
- 支持控制台命令显示 client key 的前 6 位和指纹，不显示完整 key/secret。
- 备份插件目录时应排除 `credentials.yml` 和 outbox 中可能存在的玩家 UUID。

## 7. 绑定命令与状态轮询

### 7.1 命令

首版命令：

- 玩家：`/gm bind`
- 玩家：`/gm status`
- 管理员：`/gm admin status`、`/gm admin reload`、`/gm admin retry-queue`

`/gm bind` 必须使用当前在线玩家的标准 UUID 和当前显示名，不接受玩家传入任意名字，也不生成 offline-name UUID。命令流程：

1. 主线程检查权限、冷却（同玩家 10 秒）和全局并发上限。
2. 捕获 UUID、显示名和 locale 的不可变快照。
3. 异步创建绑定会话。
4. 回到主线程发送 pair code 和可点击的 `publicBindUrl`。
5. 在内存注册 `sessionId -> playerUuid/expiresAt`，开始状态轮询。

创建请求失败不入 outbox。玩家收到明确的可重试消息；认证或协议错误只提示联系管理员，不泄露后端响应细节。

### 7.2 建议后端状态接口

```text
GET /api/plugin/bindings/{sessionId}
```

请求用相同 HMAC 签名，空 body 的 SHA-256 固定为 `e3b0...b855`。建议响应：

```json
{
  "sessionId": "...",
  "status": "pending",
  "sessionStatus": "pending",
  "nextAction": "confirm_binding",
  "expiresAt": "2026-08-17T10:35:00Z",
  "retryable": true
}
```

接口必须校验该 session 属于当前 plugin client/server；不得返回 token、Discourse 身份、邮箱或其他用户资料。

轮询策略：立即一次，此后每 3 秒一次；最多到 `expiresAt + 5s`。`bound/expired/cancelled/conflict/revoked/denied` 为终态；`unavailable` 按响应的 `retryable` 和 `Retry-After` 处理。玩家离线后停止高频轮询，可保留 session 到过期；玩家重新上线时只恢复尚未过期的内存会话。首版不持久化绑定轮询状态，因为链接本身只有 5 分钟。

## 8. 事件、心跳与本地离线队列

### 8.1 事件语义

首版只发送：

- `player_join`
- `player_quit`
- `online_duration`

`eventId` 使用 ULID/UUIDv7 等全局唯一 ID，创建后永不因重试改变。`occurredAt` 是事件发生时刻，不是发送时刻。metadata 首版白名单化，序列化后不超过 8 KiB，不接收任意插件或玩家输入键。

在线时长每 10 分钟为在线玩家生成一个窗口事件。重载或异常停机不伪造 quit；下次 join 可带 `previousShutdownUnclean=true` 作为诊断字段，但奖励结算必须仍由后端规则决定。

### 8.2 outbox 格式与边界

使用 `plugins/GameMulti/outbox/` 的单事件文件 spool：先写 `.tmp`，flush 后原子 rename 为 `<occurredAt>-<eventId>.json`。成功收到 2xx 后删除。这样避免一个损坏 JSONL 文件阻塞全部事件，也不需要引入数据库驱动。

- 上限 10,000 条或 50 MiB，任一先到即生效。
- 达到上限时优先拒绝新的 `online_duration`，保留 join/quit；绝不静默删除已有文件。
- 损坏文件移到 `outbox/quarantine/`，记录文件名和原因，不打印内容。
- flush 单消费者、按文件名 FIFO，每批最多 50 条；同一时刻最多 4 个 HTTP 请求。
- 2xx（含 duplicate）删除；明确不可重试 4xx 移入 quarantine；401/403/426 停止整个 flush；429/5xx/网络错误保留。
- 关服时停止接收新任务，等待最多 5 秒完成正在写盘的事件，不阻塞主线程等待网络。

### 8.3 心跳

心跳默认每 60 秒生成，包含实际在线数和 outbox 深度。心跳失败不进入历史 outbox，只在内存保留最新快照，下一次成功即覆盖。连续失败后采用 60、120、300 秒退避，上限 5 分钟；恢复后回到 60 秒。

`healthy` 表示插件自身能够完成主线程快照且关键模块未故障，不代表 Bridge 可达。Bridge 可达性应由最后成功心跳时间推导，避免插件在网络断开时上报自相矛盾的 `healthy=false`。

## 9. 重试、退避和熔断

| 操作 | 自动重试 | 规则 |
| --- | --- | --- |
| 安装领取 | 仅明确未到服务端的连接失败最多 1 次 | 超时后结果未知，停止并人工恢复 |
| 创建绑定 | 最多 2 次，总预算 10 秒 | 每次新 nonce，保留同一 `requestId`；响应丢失可安全重试并返回同一 session |
| 状态轮询 | 到 session 过期 | 尊重 `Retry-After`，单 session 不超过 1 并发 |
| 事件 | 持久化有限重试 | 1s、2s、5s、10s、30s、60s，之后 5 分钟上限，带抖动 |
| 心跳 | 只保留最新 | 60s 到 5min 退避 |

重试仅适用于连接失败、408、429 和 5xx。400/404/409/422 进入业务错误；401/403 停止队列并进入凭证/审核故障；426 进入协议不兼容。所有重试都生成新 HMAC nonce。

按 API origin 建立简单熔断器：连续 5 次网络/5xx 失败后打开 30 秒；半开只放一个请求。绑定命令可以快速失败，事件继续落盘，心跳只保留最新。限流响应优先采用 `Retry-After`。

## 10. 线程模型

- Paper 主线程：命令入口、事件监听、读取玩家/服务器状态、发送玩家消息。
- 网络执行器：JDK HttpClient 异步回调，固定最多 4 个并发请求，不使用公共 ForkJoinPool。
- outbox 单线程执行器：文件写入、扫描、quarantine 和删除。
- Paper scheduler：只触发主线程快照和调度信号，不直接做网络或磁盘 I/O。

禁止事项：

- 异步线程读取 `Bukkit.getOnlinePlayers()` 后遍历可变对象。
- 在 `PlayerJoinEvent`/命令处理器中同步 HTTP。
- HTTP 回调直接调用 `Player.sendMessage` 或执行控制台命令。
- shutdown hook 与 Paper `onDisable` 重复关闭同一资源。

生命周期状态机：

```text
NEW -> CONFIGURED -> CLAIM_REQUIRED | PENDING_APPROVAL | READY
READY -> DEGRADED_NETWORK | DEGRADED_QUEUE | AUTH_FAILED | PROTOCOL_BLOCKED
任意状态 -> STOPPING -> STOPPED
```

所有调度任务持有可取消句柄。`onDisable` 先阻止新任务，再取消轮询/心跳，最后有界等待 outbox 落盘和执行器退出。

## 11. 日志、隐私和诊断

日志采用固定事件名和 key/value 形式，默认 INFO。必须脱敏：

- 完全隐藏 `clientSecret`、install token、绑定 token、`Authorization`、签名和响应 cookie。
- `clientKey` 只显示前 6 位；nonce 只记录不可逆短指纹，正常日志不记录。
- `publicBindUrl` 在日志中移除 query；玩家聊天中允许发送完整 URL，因为这是其用途。
- 玩家 UUID 日志默认哈希为短指纹；display name 默认不记录。
- HTTP body 不进入 INFO/WARN。DEBUG 也只打印字段名、大小、状态码和 request correlation id。
- 后端若在错误响应中返回 correlation `requestId`，插件原样记录；没有时生成本地 correlation id。它不同于创建绑定请求中已冻结的幂等 `requestId`，不得写入其他未定义请求字段。

`/gm admin status` 输出：插件/协议/Paper/Java 版本、状态机、服务器 code、client key 前缀、最后成功心跳、时钟偏移、活跃绑定轮询数、outbox 数量/字节和最后脱敏错误。

## 12. 密钥轮换

当前后端没有轮换接口，首版只能人工撤销并重新领取，故需要后端补充：

```text
POST /api/plugin/credentials/rotate
POST /api/plugin/credentials/rotate/confirm
```

建议两阶段流程：旧凭证签名请求 rotate，服务端返回新 `clientKey/clientSecret` 和 10 分钟重叠期；插件原子写入 `next` 槽，用新凭证做 confirm；成功后将 next 提升为 current 并清除旧 secret。服务端在重叠期同时接受两把 key，confirm 或超时后撤销旧 key。

插件凭证文件模型保留 `current`/`next` 两槽，启动时若发现未完成轮换，先用 next 探测，失败再用 current，不自动发起第二次轮换。轮换操作写审计，但日志不含 secret。

紧急泄漏时后台可立即 revoke；插件进入 `AUTH_FAILED`，停止事件重放和绑定请求，保留 outbox，等待管理员重新引导。不得用旧 secret 自动匿名注册。

## 13. 升级、回滚与故障恢复

### 13.1 插件升级

- jar 替换前备份普通配置，不复制 secret 到工单或聊天。
- 启动时按 schema version 迁移配置，先写新文件再原子替换；未知未来 schema 拒绝启动网络模块。
- outbox 文件带 `schemaVersion`。新版本至少读取前一个 schema；不可识别文件进入 quarantine，不能删除。
- 不支持热替换 jar。使用完整 Paper 停服/启动，避免遗留类加载器线程。
- 插件升级不得自动升级 Paper 或 Java。

### 13.2 回滚

回滚仅允许到声明支持当前 config/outbox schema 和线协议的版本。若新版本已执行不可逆凭证轮换，旧版本必须能读取 current 槽，否则先在 Bridge 重新签发。发布说明必须标明最低可回滚版本。

### 13.3 故障场景

| 场景 | 行为 | 恢复 |
| --- | --- | --- |
| Bridge 不可达 | 绑定快速失败，事件落盘，心跳降频 | 自动半开探测并 flush |
| 磁盘满/只读 | 禁止声称事件已可靠接收，状态变 `DEGRADED_QUEUE` | 修复磁盘后管理员 retry |
| 凭证文件损坏 | 不联网，不覆盖原文件 | 从备份/Bridge 重新引导 |
| 系统时钟错误 | 一次受限偏移恢复，随后熔断 | 校准 NTP 后自动恢复 |
| 服务端 pending/blocked | 停止业务请求，低频探测 | 后台审核/解封 |
| 协议不兼容 | 停止业务重试，保留 outbox | 升级插件或恢复兼容服务端 |
| 插件异常停机 | 已原子落盘事件保留；内存轮询丢失 | 重启后 flush，玩家重发绑定命令 |
| outbox 单文件损坏 | 隔离该文件，其余继续 | 管理员检查 quarantine |

## 14. 后端契约

### 14.1 已关闭的开工阻塞

- `GET /api/plugin/bindings/{sessionId}` 使用 HMAC，查询强制匹配当前 `pluginClientId` 和 `serverId`，仅返回绑定状态，不返回 binding token。
- 所有插件路由使用 `{code,message,retryable,requestId,serverTime?,details?}` 错误体；已定义 `AUTHENTICATION_FAILED`、`CLOCK_SKEW`、`NONCE_REPLAY`、`SERVER_PENDING_APPROVAL`、`SERVER_BLOCKED`、`RATE_LIMITED`、`INVALID_REQUEST`、`PROTOCOL_UNSUPPORTED`、`SERVICE_UNAVAILABLE` 和 `IDEMPOTENCY_CONFLICT`。
- 每个 HMAC 请求必须携带 `X-GM-Protocol-Version`；版本须匹配 credential 的协议版本及服务端 `PLUGIN_PROTOCOL_VERSIONS`，否则为 `426 PROTOCOL_UNSUPPORTED`。
- 待审核为 `403 SERVER_PENDING_APPROVAL`，blocked/disabled 为 `403 SERVER_BLOCKED`；凭证、签名和过期仍为 `401 AUTHENTICATION_FAILED`。
- 创建绑定请求必须携带 8-128 字符 `requestId`。按 `(pluginClientId, requestId)` 去重，重试需使用新 nonce 和相同 `requestId`；相同键配不同请求内容返回 `409 IDEMPOTENCY_CONFLICT`。

### 14.2 首版上线前应补

| 编号 | 缺口 | 建议 |
| --- | --- | --- |
| BE-P2-07 | 没有明确限流 | 对 client/IP 限流并返回 429、`Retry-After` 和稳定错误码 |
| BE-P2-08 | metadata 无字节/深度限制 | 限制序列化大小、深度和允许键，避免数据库膨胀 |
| BE-P2-09 | 事件类型是任意 string | 对当前协议白名单校验，未知类型返回稳定错误码 |
| BE-P2-10 | event/heartbeat 时间无业务窗口 | 定义可接受过去/未来窗口，原始 occurredAt 保留审计 |
| BE-P2-11 | nonce 清理在每个请求全表 delete | 改为定时批量清理并确保索引，避免请求路径放大 |

### 14.3 后续协议

- BE-P2-13：两阶段凭证轮换与立即撤销后的恢复引导。
- BE-P2-14：批量事件端点，每项独立幂等与结果。
- BE-P2-15：远程命令 lease/pending/ack 协议、持久化、权限和审计。
- BE-P2-16：安装领取结果未知时的只读恢复接口。

远程命令未来必须包含 `commandId`、有限 `type`、结构化 payload、`notBefore/expiresAt`、lease token、attempt 和幂等 ack。禁止后端直接下发任意控制台字符串作为首版通用能力。

## 15. 分阶段实施任务清单

### Phase 0：契约关闭与脚手架

- [x] 后端完成 BE-P2-01 至 BE-P2-05，并发布 OpenAPI/测试向量。
- [ ] 创建 `plugins/paper` Gradle 21 工程、wrapper、`plugin.yml` 和 CI。
- [ ] 建立最低/最高 Paper 测试矩阵。
- [ ] 将 Node PoC 的固定 HMAC 向量复制为跨语言 golden test。
- [ ] 冻结配置 schema v1 和错误码枚举。

验收：Java 客户端对同一 method/path/timestamp/nonce/body 产生与 Node/API 完全一致的签名；空 body、Unicode、字段顺序固定样例均通过。

### Phase 1：安全引导与传输层

- [ ] 实现配置解析和严格校验。
- [ ] 实现 `CredentialStore`、POSIX 权限检查、原子写和领取状态机。
- [ ] 实现单次序列化、HMAC、超时、响应上限、错误映射和受限重试。
- [ ] 实现协议版本头、User-Agent、脱敏日志与 admin status。
- [ ] 用 MockWebServer/WireMock 覆盖 2xx、400、401、403、408、429、5xx、超时、坏 JSON 和超大响应。

验收：secret/install token 不出现在测试日志；领取成功断电点模拟不会留下半个凭证文件；领取超时不会循环消费 token。

### Phase 2：绑定闭环

- [ ] 注册 `/gm bind`、权限和冷却。
- [ ] 从在线 Player 获取 UUID，异步创建会话。
- [ ] 使用 Adventure 可点击消息展示 `publicBindUrl` 和 pair code。
- [ ] 实现有界 session tracker 和 HMAC 状态轮询。
- [ ] 将所有 P0 状态映射为一致玩家消息，所有 Paper 调用回主线程。

验收：测试服完成“命令 -> Bridge -> Discourse -> Bridge -> 游戏内 bound 提示”；过期、冲突、未审核、Bridge 中断均有可恢复结果。

### Phase 3：遥测与可靠性

- [ ] 实现 join/quit/duration 不可变事件 DTO。
- [ ] 实现原子单文件 outbox、上限、quarantine、单消费者 flush。
- [ ] 实现心跳最新值语义、退避和熔断。
- [ ] 实现磁盘满、损坏文件、重复事件、服务重启和乱序响应测试。
- [ ] 验证关闭过程不阻塞主线程且无遗留线程。

验收：断网 30 分钟后恢复，事件按相同 eventId 重放且后端不重复入库；10,000 条上限行为可预测；心跳不形成历史积压。

### Phase 4：兼容、发布与演练

- [ ] 在 Paper 1.21.4/JDK 21 与 Paper 1.21.11/JDK 21 完成加载和闭环测试。
- [ ] 进行 24 小时 soak，观察主线程 tick、线程数、文件句柄、堆和 outbox。
- [ ] 演练凭证撤销、时钟偏差、API 5xx、磁盘只读、坏配置、协议 426 和插件回滚。
- [ ] 生成 jar、SHA-256、SBOM、支持矩阵、升级/回滚说明。
- [ ] 安全检查 jar 和构建日志中不存在 token/secret/真实环境 URL。

验收：发布包可在干净测试服按文档完成首次领取、审核、绑定和事件恢复；所有故障演练都有明确状态和恢复步骤。

### Phase 5：后续能力（不阻塞首版）

- [ ] 两阶段密钥轮换。
- [ ] 批量事件协议。
- [ ] 远程命令 lease/ack 模块。
- [ ] Folia 单独适配评审。
- [ ] Minecraft/Paper 26.x 与 JDK 25 新兼容轨道。

## 16. 首版完成定义

首版不是“jar 能加载”即完成，必须同时满足：

1. 支持矩阵中的两端版本均通过加载与核心闭环。
2. HMAC、nonce、时钟偏差和错误码有跨语言契约测试。
3. `/gm bind` 不阻塞主线程，只使用真实在线玩家 UUID，并展示 Bridge 生成 URL。
4. 绑定所有 P0 状态能在服内得到一致、可恢复提示。
5. 事件在断网和重启后可有限、幂等重放；队列有硬上限和隔离机制。
6. 心跳、重试和熔断不会制造请求风暴。
7. install token 和 client secret 在文件、日志、命令、构建产物中均按本设计保护。
8. 插件关闭后无遗留线程，磁盘和网络故障不拖慢 Paper 主线程。
9. 升级、回滚、撤销凭证和 API 故障均完成测试服演练。
10. 后端 BE-P2-01 至 BE-P2-05 已关闭，正式 OpenAPI 与实现一致。

## 17. 关联实现依据

- `docs/plan/p0-unified-product-baseline.md`
- `docs/contracts/discourse-binding-flow.md`
- `docs/backend/plugin_binding_link_contract.md`
- `docs/backend/plugin_install_token_flow.md`
- `docs/backend/minecraft_plugin_poc_verification.md`
- `docs/plan/api_and_module_boundaries.md`
- `plugin-poc/minecraft-js/src/plugin_service.js`
- `plugin-poc/minecraft-js/test/plugin_service.test.js`
- `apps/api/src/security/plugin-signature.ts`
- `apps/api/src/plugin/plugin-auth.guard.ts`
- `apps/api/src/modules/game/`
- `apps/api/src/modules/binding/`

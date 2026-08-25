# GameMulti Paper 插件

首版支持 Paper 1.21.4–1.21.11 和 Java 21，线协议固定为 `2026-06-mvp`。它只实现安装认领、Minecraft 账号绑定、绑定状态轮询和服务器心跳。

## 构建

```bash
./gradlew clean test shadowJar releaseChecksum
```

产物为 `build/libs/gamemulti-paper-0.1.0.jar`，同目录生成 SHA-256 文件。Gradle Wrapper 会自动获取 Java 21 编译工具链，不要求修改服务器或开发机的默认 Java。

## 首次安装

1. 把 JAR 放入 Paper 的 `plugins/`，启动一次后关闭服务器。
2. 编辑 `plugins/GameMulti/config.yml`，至少设置服务器名称、唯一 `server.code`、公网主机和端口。
3. 在 GameMulti 管理端创建一次性插件安装 token。
4. 将 token 单独写入 `plugins/GameMulti/install-token.txt`，文件只能包含一行，然后执行：

   ```bash
   chmod 700 plugins/GameMulti
   chmod 600 plugins/GameMulti/install-token.txt
   ```

5. 启动 Paper。插件会先把 token 原子改名为 `install-token.claiming`，认领成功后安全写入 `credentials.yml` 并删除该标记。
6. 管理员在 GameMulti 后台把新服务器从 `pending` 审核为 `active`。
7. 控制台执行 `gm admin status`，看到 `READY` 后，玩家可使用 `gm bind` 和 `gm status`。

不要把 `credentials.yml`、安装 token 或完整绑定链接发到日志、工单或聊天群。插件不会访问 Discourse，也不会在游戏服内保存论坛凭证。

如果状态是 `CLAIM_OUTCOME_UNKNOWN`，先到 GameMulti 后台确认服务器是否已经创建。不要直接恢复或复用 `install-token.claiming`；只有确认认领未成功后，才能删除该标记并放入新 token。

package cn.gamemp.gamemulti;

import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.PluginCommand;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

public final class GameMultiPlugin extends JavaPlugin {
    private static final Set<String> TERMINAL_BINDING_STATES = Set.of(
            "bound", "expired", "cancelled", "conflict", "revoked", "denied");
    private static final long BIND_COOLDOWN_MILLIS = 10_000;

    private final Map<UUID, ActiveBinding> bindings = new ConcurrentHashMap<>();
    private final Map<UUID, Long> bindCooldowns = new ConcurrentHashMap<>();
    private final Set<UUID> bindingCreates = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean heartbeatInFlight = new AtomicBoolean();
    private final Object lifecycleLock = new Object();
    private volatile RuntimeState state = RuntimeState.STARTING;
    private volatile String lastError = "none";
    private volatile Instant lastHeartbeat;
    private volatile boolean stopping;
    private PluginConfig pluginConfig;
    private PluginCredentials credentials;
    private CredentialStore credentialStore;
    private volatile GameMultiClient client;
    private BukkitTask heartbeatTask;
    private int heartbeatFailures;
    private volatile HeartbeatSnapshot pendingHeartbeat;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        PluginCommand command = getCommand("gm");
        if (command == null) {
            getLogger().severe("Command /gm is missing from plugin.yml");
            setState(RuntimeState.MISCONFIGURED, "command registration failed");
            return;
        }
        command.setExecutor(this::handleCommand);

        credentialStore = new CredentialStore(getDataFolder().toPath(), getLogger());
        try {
            credentialStore.prepareDirectory();
            pluginConfig = PluginConfig.load(getConfig());
        } catch (Exception error) {
            lastError = safeError(error);
            setState(RuntimeState.MISCONFIGURED, "config.yml is invalid; run gm admin status for details");
            return;
        }

        try {
            if (credentialStore.hasCredentials()) {
                activate(credentialStore.load(), RuntimeState.CONNECTING);
            } else if (credentialStore.hasClaimInProgress()) {
                setState(RuntimeState.CLAIM_OUTCOME_UNKNOWN,
                        "a previous claim may have consumed its token; check Bridge before replacing install-token.claiming");
            } else if (credentialStore.hasInstallToken()) {
                claimInstallation(credentialStore.beginClaim());
            } else {
                setState(RuntimeState.NEEDS_INSTALL_TOKEN,
                        "create plugins/GameMulti/install-token.txt with mode 600, then restart the server");
            }
        } catch (Exception error) {
            lastError = safeError(error);
            setState(RuntimeState.MISCONFIGURED, "credential bootstrap failed; run gm admin status for details");
        }
    }

    @Override
    public void onDisable() {
        synchronized (lifecycleLock) {
            stopping = true;
            if (heartbeatTask != null) {
                heartbeatTask.cancel();
            }
            if (client != null) {
                client.close();
            }
            state = RuntimeState.STOPPED;
        }
        bindings.clear();
        bindCooldowns.clear();
        bindingCreates.clear();
    }

    private void claimInstallation(String installToken) {
        setState(RuntimeState.CLAIMING, "claiming the one-time install token");
        GameMultiClient claimingClient = new GameMultiClient(
                pluginConfig,
                getPluginMeta().getVersion(),
                null);
        claimingClient.claimInstallation(installToken).whenComplete((response, error) -> {
            try {
                if (error != null) {
                    Throwable cause = unwrap(error);
                    lastError = safeError(cause);
                    RuntimeState next = cause instanceof ApiException api
                            && api.status() < 500
                            && api.status() != 408
                            && api.status() != 429
                            ? RuntimeState.CLAIM_FAILED
                            : RuntimeState.CLAIM_OUTCOME_UNKNOWN;
                    if (!stopping) {
                        setState(next, next == RuntimeState.CLAIM_FAILED
                                ? "install token was rejected; remove install-token.claiming before issuing a new token"
                                : "claim result is unknown; check Bridge before replacing install-token.claiming");
                    }
                    return;
                }
                if (!pluginConfig.serverCode().equals(response.server().serverCode())) {
                    throw new IOException("claimed server code does not match config.yml");
                }
                PluginCredentials claimed = new PluginCredentials(
                        response.server().id(),
                        response.server().serverCode(),
                        response.pluginClient().id(),
                        response.pluginClient().clientKey(),
                        response.pluginClient().clientSecret(),
                        Instant.now().toString(),
                        pluginConfig.protocolVersion());
                credentialStore.save(claimed);
                credentialStore.consumeClaimMarker();
                synchronized (lifecycleLock) {
                    if (!stopping) {
                        activate(claimed, RuntimeState.PENDING_APPROVAL);
                    }
                }
            } catch (Exception saveError) {
                lastError = safeError(saveError);
                if (!stopping) {
                    setState(RuntimeState.CLAIM_OUTCOME_UNKNOWN,
                            "claim succeeded but credentials could not be safely persisted; do not reuse the token");
                }
            } finally {
                claimingClient.close();
            }
        });
    }

    private void activate(PluginCredentials loaded, RuntimeState initialState) {
        if (!pluginConfig.serverCode().equals(loaded.serverCode())) {
            throw new IllegalArgumentException("credentials.yml serverCode does not match config.yml");
        }
        if (!pluginConfig.protocolVersion().equals(loaded.protocolVersion())) {
            throw new IllegalArgumentException("credentials.yml protocolVersion does not match config.yml");
        }
        credentials = loaded;
        client = new GameMultiClient(pluginConfig, getPluginMeta().getVersion(), loaded);
        setState(initialState, initialState == RuntimeState.PENDING_APPROVAL
                ? "server is waiting for Bridge approval"
                : "checking Bridge connectivity");
        getServer().getScheduler().runTask(this, this::startHeartbeat);
    }

    private void startHeartbeat() {
        if (stopping || heartbeatTask != null) {
            return;
        }
        scheduleHeartbeat(1L);
    }

    private void scheduleHeartbeat(long delayTicks) {
        if (stopping || heartbeatTask != null) {
            return;
        }
        heartbeatTask = getServer().getScheduler().runTaskLater(this, this::heartbeat, delayTicks);
    }

    private void heartbeat() {
        heartbeatTask = null;
        GameMultiClient currentClient = client;
        if (stopping || currentClient == null || !heartbeatInFlight.compareAndSet(false, true)) {
            return;
        }
        if (pendingHeartbeat == null) {
            pendingHeartbeat = new HeartbeatSnapshot(
                    "status_" + UUID.randomUUID(),
                    getServer().getOnlinePlayers().size(),
                    getServer().getVersion(),
                    state != RuntimeState.MISCONFIGURED,
                    Instant.now());
        }
        HeartbeatSnapshot snapshot = pendingHeartbeat;
        currentClient.heartbeat(
                        snapshot.statusId(),
                        snapshot.onlineCount(),
                        snapshot.paperVersion(),
                        snapshot.healthy(),
                        snapshot.sentAt())
                .whenComplete((ignored, error) -> {
                    heartbeatInFlight.set(false);
                    if (stopping) {
                        return;
                    }
                    if (error == null) {
                        if (pendingHeartbeat == snapshot) {
                            pendingHeartbeat = null;
                        }
                        heartbeatFailures = 0;
                        lastHeartbeat = Instant.now();
                        lastError = "none";
                        setState(RuntimeState.READY, "Bridge heartbeat accepted");
                    } else {
                        heartbeatFailures++;
                        updateStateFromApiError(unwrap(error));
                    }
                    long delaySeconds = heartbeatDelaySeconds();
                    runOnMain(() -> scheduleHeartbeat(delaySeconds * 20L));
                });
    }

    private long heartbeatDelaySeconds() {
        if (state == RuntimeState.PROTOCOL_UNSUPPORTED) {
            return 300;
        }
        if (heartbeatFailures == 0) {
            return pluginConfig.heartbeatIntervalSeconds();
        }
        return switch (heartbeatFailures) {
            case 1 -> 60;
            case 2 -> 120;
            default -> 300;
        };
    }

    private boolean handleCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 1 && "bind".equalsIgnoreCase(args[0])) {
            handleBind(sender);
            return true;
        }
        if (args.length == 1 && "status".equalsIgnoreCase(args[0])) {
            handlePlayerStatus(sender);
            return true;
        }
        if (args.length == 2 && "admin".equalsIgnoreCase(args[0]) && "status".equalsIgnoreCase(args[1])) {
            handleAdminStatus(sender);
            return true;
        }
        sender.sendMessage("用法：/gm bind、/gm status、/gm admin status");
        return true;
    }

    private void handleBind(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("此命令只能由在线玩家执行。");
            return;
        }
        if (!player.hasPermission("gamemulti.bind")) {
            player.sendMessage("你没有使用绑定命令的权限。");
            return;
        }
        if (state != RuntimeState.READY || client == null) {
            player.sendMessage("绑定服务当前不可用，请稍后重试或联系管理员（状态：" + state + "）。");
            return;
        }
        ActiveBinding existing = bindings.get(player.getUniqueId());
        if (existing != null && existing.isPending() && !existing.isExpired()) {
            player.sendMessage("已有绑定正在等待确认，请使用 /gm status 查看。");
            return;
        }
        if (bindingCreates.contains(player.getUniqueId())) {
            player.sendMessage("绑定请求正在创建，请稍候。");
            return;
        }
        long now = System.currentTimeMillis();
        bindCooldowns.entrySet().removeIf(entry -> now - entry.getValue() >= BIND_COOLDOWN_MILLIS);
        long previous = bindCooldowns.getOrDefault(player.getUniqueId(), 0L);
        if (now - previous < BIND_COOLDOWN_MILLIS) {
            player.sendMessage("操作太频繁，请稍后再试。");
            return;
        }
        long activeCount = bindingCreates.size() + bindings.values().stream()
                .filter(binding -> binding.isPending() && !binding.isExpiredWithGrace())
                .count();
        if (activeCount >= pluginConfig.maxActiveSessions()) {
            player.sendMessage("当前绑定请求较多，请稍后再试。");
            return;
        }

        UUID playerId = player.getUniqueId();
        if (!bindingCreates.add(playerId)) {
            player.sendMessage("绑定请求正在创建，请稍候。");
            return;
        }
        bindCooldowns.put(playerId, now);
        String displayName = player.getName();
        String requestId = "bind_" + UUID.randomUUID();
        player.sendMessage("正在创建绑定请求……");
        client.createBinding(requestId, playerId, displayName).whenComplete((response, error) -> {
            bindingCreates.remove(playerId);
            runOnMain(() -> {
                    Player online = getServer().getPlayer(playerId);
                    if (error != null) {
                        Throwable cause = unwrap(error);
                        updateStateFromApiError(cause);
                        if (online != null) {
                            online.sendMessage("绑定请求创建失败，请稍后重试；若持续失败请联系管理员。");
                        }
                        return;
                    }
                    try {
                        int lifetimeSeconds = Math.max(1, Math.min(600, response.expiresIn()));
                        ActiveBinding binding = new ActiveBinding(
                                response.sessionId(),
                                response.pairCode(),
                                response.displayUrl(pluginConfig.baseUri()),
                                Instant.now().plusSeconds(lifetimeSeconds));
                        bindings.put(playerId, binding);
                        if (online != null) {
                            sendBindingLink(online, binding);
                        }
                        schedulePoll(playerId, binding, 0L);
                    } catch (RuntimeException invalidResponse) {
                        lastError = safeError(invalidResponse);
                        if (online != null) {
                            online.sendMessage("绑定服务返回了无效结果，请联系管理员。");
                        }
                    }
            });
        });
    }

    private void sendBindingLink(Player player, ActiveBinding binding) {
        Component message = Component.text("绑定码 " + binding.pairCode + "，打开 ", NamedTextColor.GREEN);
        if (isWebUrl(binding.url)) {
            message = message.append(Component.text(binding.url, NamedTextColor.AQUA)
                    .clickEvent(ClickEvent.openUrl(binding.url)));
        } else {
            message = message.append(Component.text(binding.url, NamedTextColor.AQUA));
        }
        message = message.append(Component.text(" 完成绑定（请在链接失效前操作）。", NamedTextColor.GREEN));
        player.sendMessage(message);
    }

    private void handlePlayerStatus(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("此命令只能由在线玩家执行。");
            return;
        }
        if (!player.hasPermission("gamemulti.bind")) {
            player.sendMessage("你没有查看绑定状态的权限。");
            return;
        }
        ActiveBinding binding = bindings.get(player.getUniqueId());
        if (binding == null) {
            player.sendMessage("本次服务器运行期间尚未发起绑定，请使用 /gm bind。");
            return;
        }
        if (binding.isPending() && binding.isExpired()) {
            finishBinding(player.getUniqueId(), binding, "expired");
            return;
        }
        switch (binding.status) {
            case "pending", "unavailable" -> sendBindingLink(player, binding);
            case "bound" -> player.sendMessage("绑定已完成。");
            case "expired" -> player.sendMessage("绑定请求已过期，请重新使用 /gm bind。");
            case "conflict" -> player.sendMessage("此游戏账号已被其他身份绑定，请联系管理员处理。");
            case "cancelled" -> player.sendMessage("绑定请求已取消，请重新使用 /gm bind。");
            case "revoked" -> player.sendMessage("绑定授权已撤销，请重新绑定或联系管理员。");
            case "denied" -> player.sendMessage("绑定请求未获授权，请联系管理员。");
            case "failed" -> player.sendMessage("绑定状态查询失败，请重新使用 /gm bind 或联系管理员。");
            default -> player.sendMessage("绑定状态暂时未知，请稍后重试。");
        }
    }

    private void handleAdminStatus(CommandSender sender) {
        if (!sender.hasPermission("gamemulti.admin")) {
            sender.sendMessage("你没有管理员权限。");
            return;
        }
        long activeCount = bindingCreates.size() + bindings.values().stream()
                .filter(binding -> binding.isPending() && !binding.isExpiredWithGrace())
                .count();
        sender.sendMessage("GameMulti " + getPluginMeta().getVersion() + " | 状态 " + state);
        sender.sendMessage("协议 " + (pluginConfig == null ? "unknown" : pluginConfig.protocolVersion())
                + " | 服务器 " + (pluginConfig == null ? "unknown" : pluginConfig.serverCode()));
        sender.sendMessage("客户端 " + (credentials == null ? "unclaimed" : credentials.keyPrefix())
                + " | Paper " + getServer().getVersion() + " | Java " + System.getProperty("java.version"));
        sender.sendMessage("最后心跳 " + (lastHeartbeat == null ? "never" : lastHeartbeat)
                + " | 活跃绑定 " + activeCount + " | 最后错误 " + lastError);
    }

    private void schedulePoll(UUID playerId, ActiveBinding binding, long delayTicks) {
        if (stopping || bindings.get(playerId) != binding || !binding.isPending()) {
            return;
        }
        getServer().getScheduler().runTaskLater(this, () -> {
            if (stopping || bindings.get(playerId) != binding || !binding.isPending()) {
                return;
            }
            if (binding.isExpiredWithGrace()) {
                finishBinding(playerId, binding, "expired");
                return;
            }
            GameMultiClient currentClient = client;
            if (currentClient == null) {
                finishBinding(playerId, binding, "unavailable");
                return;
            }
            currentClient.getBindingStatus(binding.sessionId).whenComplete((status, error) ->
                    runOnMain(() -> handlePollResult(playerId, binding, status, error)));
        }, delayTicks);
    }

    private void handlePollResult(
            UUID playerId,
            ActiveBinding binding,
            GameMultiClient.BindingStatus result,
            Throwable error) {
        if (stopping || bindings.get(playerId) != binding || !binding.isPending()) {
            return;
        }
        if (error != null) {
            Throwable cause = unwrap(error);
            updateStateFromApiError(cause);
            binding.status = "unavailable";
            if (!(cause instanceof ApiException api) || api.retryable()) {
                long delaySeconds = cause instanceof ApiException api && api.retryAfterSeconds() != null
                        ? Math.max(pluginConfig.pollIntervalSeconds(), Math.min(300, api.retryAfterSeconds()))
                        : pluginConfig.pollIntervalSeconds();
                schedulePoll(playerId, binding, delaySeconds * 20L);
            } else {
                finishBinding(playerId, binding, "failed");
            }
            return;
        }
        if (result.sessionId() != null && !binding.sessionId.equals(result.sessionId())) {
            lastError = "binding session response mismatch";
            binding.status = "unavailable";
            schedulePoll(playerId, binding, pluginConfig.pollIntervalSeconds() * 20L);
            return;
        }
        String status = result.status().toLowerCase();
        if (TERMINAL_BINDING_STATES.contains(status)) {
            finishBinding(playerId, binding, status);
            return;
        }
        if ("unavailable".equals(status) && !result.retryable()) {
            finishBinding(playerId, binding, "failed");
            return;
        }
        binding.status = "unavailable".equals(status) ? "unavailable" : "pending";
        Player player = getServer().getPlayer(playerId);
        long delaySeconds = player == null
                ? Math.max(15, pluginConfig.pollIntervalSeconds())
                : pluginConfig.pollIntervalSeconds();
        schedulePoll(playerId, binding, delaySeconds * 20L);
    }

    private void finishBinding(UUID playerId, ActiveBinding binding, String status) {
        if (bindings.get(playerId) != binding) {
            return;
        }
        binding.status = status;
        getServer().getScheduler().runTaskLater(this,
                () -> bindings.remove(playerId, binding),
                5 * 60 * 20L);
        Player player = getServer().getPlayer(playerId);
        if (player == null) {
            return;
        }
        switch (status) {
            case "bound" -> player.sendMessage(Component.text("GameMulti 绑定成功！", NamedTextColor.GREEN));
            case "expired" -> player.sendMessage("绑定请求已过期，请重新使用 /gm bind。");
            case "conflict" -> player.sendMessage("绑定失败：此游戏账号已被其他身份绑定。");
            case "cancelled" -> player.sendMessage("绑定请求已取消。");
            case "revoked" -> player.sendMessage("绑定授权已撤销。");
            case "denied" -> player.sendMessage("绑定请求未获授权。");
            case "failed" -> player.sendMessage("绑定状态查询失败，请重新使用 /gm bind 或联系管理员。");
            default -> player.sendMessage("绑定状态暂时不可用，请稍后使用 /gm status。");
        }
    }

    private void updateStateFromApiError(Throwable error) {
        lastError = safeError(error);
        if (!(error instanceof ApiException api)) {
            setState(RuntimeState.DEGRADED, "Bridge is temporarily unreachable");
            return;
        }
        switch (api.code()) {
            case "SERVER_PENDING_APPROVAL" -> setState(RuntimeState.PENDING_APPROVAL,
                    "server is waiting for Bridge approval");
            case "SERVER_BLOCKED" -> setState(RuntimeState.BLOCKED, "server was blocked by Bridge");
            case "AUTHENTICATION_FAILED" -> setState(RuntimeState.AUTH_ERROR,
                    "plugin credentials were rejected");
            case "PROTOCOL_UNSUPPORTED" -> setState(RuntimeState.PROTOCOL_UNSUPPORTED,
                    "plugin protocol is not supported by Bridge");
            default -> setState(RuntimeState.DEGRADED, "Bridge request failed with " + api.code());
        }
    }

    private void setState(RuntimeState next, String reason) {
        RuntimeState previous = state;
        state = next;
        if (previous == next) {
            return;
        }
        if (next == RuntimeState.READY) {
            getLogger().info("GameMulti is ready: " + reason);
        } else if (next == RuntimeState.STARTING || next == RuntimeState.CONNECTING || next == RuntimeState.CLAIMING) {
            getLogger().info("GameMulti state " + next + ": " + reason);
        } else {
            getLogger().warning("GameMulti state " + next + ": " + reason);
        }
    }

    private void runOnMain(Runnable task) {
        if (!stopping && isEnabled()) {
            getServer().getScheduler().runTask(this, task);
        }
    }

    private static Throwable unwrap(Throwable error) {
        Throwable result = error;
        while (result instanceof CompletionException && result.getCause() != null) {
            result = result.getCause();
        }
        return result;
    }

    private static String safeError(Throwable error) {
        Throwable cause = unwrap(error);
        if (cause instanceof ApiException api) {
            return api.code() + " (HTTP " + api.status() + ")"
                    + (api.requestId() == null ? "" : " requestId=" + api.requestId());
        }
        return cause.getClass().getSimpleName();
    }

    private static boolean isWebUrl(String value) {
        try {
            URI uri = URI.create(value);
            return uri.isAbsolute() && ("https".equalsIgnoreCase(uri.getScheme())
                    || "http".equalsIgnoreCase(uri.getScheme()));
        } catch (IllegalArgumentException error) {
            return false;
        }
    }

    private enum RuntimeState {
        STARTING,
        CONNECTING,
        NEEDS_INSTALL_TOKEN,
        CLAIMING,
        CLAIM_FAILED,
        CLAIM_OUTCOME_UNKNOWN,
        PENDING_APPROVAL,
        READY,
        DEGRADED,
        AUTH_ERROR,
        PROTOCOL_UNSUPPORTED,
        BLOCKED,
        MISCONFIGURED,
        STOPPED
    }

    private static final class ActiveBinding {
        private final String sessionId;
        private final String pairCode;
        private final String url;
        private final Instant expiresAt;
        private volatile String status = "pending";

        private ActiveBinding(String sessionId, String pairCode, String url, Instant expiresAt) {
            if (sessionId == null || !sessionId.matches("[A-Za-z0-9_-]{1,128}")) {
                throw new IllegalArgumentException("binding session id is invalid");
            }
            if (pairCode == null || !pairCode.matches("[0-9]{6}")) {
                throw new IllegalArgumentException("binding pair code is invalid");
            }
            this.sessionId = sessionId;
            this.pairCode = pairCode;
            this.url = url;
            this.expiresAt = expiresAt;
        }

        private boolean isPending() {
            return "pending".equals(status) || "unavailable".equals(status);
        }

        private boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }

        private boolean isExpiredWithGrace() {
            return Instant.now().isAfter(expiresAt.plusSeconds(5));
        }
    }

    private record HeartbeatSnapshot(
            String statusId,
            int onlineCount,
            String paperVersion,
            boolean healthy,
            Instant sentAt) {}
}

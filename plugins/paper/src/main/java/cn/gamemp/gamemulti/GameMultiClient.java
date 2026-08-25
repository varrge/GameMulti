package cn.gamemp.gamemulti;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Flow;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicLong;

final class GameMultiClient implements AutoCloseable {
    private static final int MAX_RESPONSE_BYTES = 1024 * 1024;
    private static final byte[] EMPTY_BODY = new byte[0];
    private final PluginConfig config;
    private final String pluginVersion;
    private final PluginCredentials credentials;
    private final HmacSigner signer;
    private final Clock clock;
    private final ObjectMapper json;
    private final HttpClient http;
    private final ExecutorService executor;
    private final ExecutorService admissionExecutor;
    private final Semaphore requestSlots = new Semaphore(4);
    private final AtomicLong clockOffsetSeconds = new AtomicLong();
    private final AtomicLong signingBlockedUntilNanos = new AtomicLong();

    GameMultiClient(PluginConfig config, String pluginVersion, PluginCredentials credentials) {
        this(config, pluginVersion, credentials, Clock.systemUTC());
    }

    GameMultiClient(PluginConfig config, String pluginVersion, PluginCredentials credentials, Clock clock) {
        this.config = config;
        this.pluginVersion = pluginVersion;
        this.credentials = credentials;
        this.signer = credentials == null ? null : new HmacSigner(credentials.clientSecret());
        this.clock = clock;
        this.json = new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        this.executor = Executors.newFixedThreadPool(4, runnable ->
                Thread.ofPlatform().daemon().name("gamemulti-http-", 0).unstarted(runnable));
        this.admissionExecutor = Executors.newVirtualThreadPerTaskExecutor();
        this.http = HttpClient.newBuilder()
                .connectTimeout(config.connectTimeout())
                .executor(executor)
                .followRedirects(HttpClient.Redirect.NEVER)
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    CompletableFuture<ClaimResponse> claimInstallation(String installToken) {
        ObjectNode payload = json.createObjectNode();
        payload.put("installToken", installToken);
        payload.put("serverCode", config.serverCode());
        payload.put("serverName", config.serverName());
        payload.put("publicHost", config.publicHost());
        payload.put("publicPort", config.publicPort());
        payload.put("pluginVersion", pluginVersion);
        payload.put("protocolVersion", config.protocolVersion());
        if (config.region() != null) {
            payload.put("region", config.region());
        }
        byte[] body = encode(payload);
        return send("POST", "/api/plugin/installations/claim", body, false)
                .thenApply(bytes -> decode(bytes, ClaimResponse.class))
                .whenComplete((ignored, error) -> Arrays.fill(body, (byte) 0));
    }

    CompletableFuture<BindingSession> createBinding(String requestId, UUID playerId, String displayName) {
        ObjectNode payload = json.createObjectNode();
        payload.put("requestId", requestId);
        payload.put("serverCode", config.serverCode());
        payload.put("gameCode", "minecraft");
        payload.put("platform", "java");
        payload.put("gameUserId", playerId.toString());
        payload.put("displayName", displayName);
        payload.put("bindMode", "bind_existing");
        byte[] body = encode(payload);
        return send("POST", "/api/plugin/bindings/session", body, true)
                .thenApply(bytes -> decode(bytes, BindingSession.class));
    }

    CompletableFuture<BindingStatus> getBindingStatus(String sessionId) {
        if (sessionId == null || !sessionId.matches("[A-Za-z0-9_-]{1,128}")) {
            return CompletableFuture.failedFuture(new IllegalArgumentException("invalid binding session id"));
        }
        return send("GET", "/api/plugin/bindings/" + sessionId, EMPTY_BODY, true)
                .thenApply(bytes -> decode(bytes, BindingStatus.class));
    }

    CompletableFuture<Void> heartbeat(
            String statusId,
            int onlineCount,
            String paperVersion,
            boolean healthy,
            Instant sentAt) {
        ObjectNode payload = json.createObjectNode();
        payload.put("statusId", statusId);
        payload.put("serverCode", config.serverCode());
        payload.put("serverId", credentials.serverId());
        payload.put("healthy", healthy);
        payload.put("onlineCount", onlineCount);
        payload.put("queueDepth", 0);
        payload.put("sentAt", sentAt.toString());
        ObjectNode metadata = payload.putObject("metadata");
        metadata.put("publicHost", config.publicHost());
        metadata.put("publicPort", config.publicPort());
        metadata.put("pluginVersion", pluginVersion);
        metadata.put("paperVersion", paperVersion);
        return send("POST", "/api/game-servers/heartbeat", encode(payload), true).thenApply(ignored -> null);
    }

    private CompletableFuture<byte[]> send(String method, String endpoint, byte[] body, boolean authenticated) {
        return send(method, endpoint, body, authenticated, true);
    }

    private CompletableFuture<byte[]> send(
            String method,
            String endpoint,
            byte[] body,
            boolean authenticated,
            boolean allowClockSkewRetry) {
        return sendAttempt(method, endpoint, body, authenticated).handle((response, error) -> {
            if (error == null) {
                return CompletableFuture.completedFuture(response);
            }
            Throwable cause = unwrap(error);
            if (authenticated
                    && allowClockSkewRetry
                    && cause instanceof ApiException api
                    && "CLOCK_SKEW".equals(api.code())
                    && api.serverTime() != null
                    && "https".equalsIgnoreCase(config.baseUri().getScheme())) {
                long localTime = Instant.now(clock).getEpochSecond();
                long offset = Math.max(-300, Math.min(300, api.serverTime() - localTime));
                clockOffsetSeconds.set(offset);
                return send(method, endpoint, body, true, false);
            }
            if (authenticated && !allowClockSkewRetry
                    && cause instanceof ApiException api
                    && "CLOCK_SKEW".equals(api.code())) {
                signingBlockedUntilNanos.set(System.nanoTime() + java.time.Duration.ofSeconds(60).toNanos());
            }
            return CompletableFuture.<byte[]>failedFuture(cause);
        }).thenCompose(result -> result);
    }

    private CompletableFuture<byte[]> sendAttempt(
            String method,
            String endpoint,
            byte[] body,
            boolean authenticated) {
        return CompletableFuture.runAsync(requestSlots::acquireUninterruptibly, admissionExecutor)
                .thenCompose(ignored -> sendAcquired(method, endpoint, body, authenticated))
                .whenComplete((ignored, error) -> requestSlots.release());
    }

    private CompletableFuture<byte[]> sendAcquired(
            String method,
            String endpoint,
            byte[] body,
            boolean authenticated) {
        URI uri = URI.create(config.baseUri().toASCIIString() + endpoint);
        String signingPath = uri.getRawPath();
        HttpRequest.Builder request = HttpRequest.newBuilder(uri)
                .timeout(config.requestTimeout())
                .header("Accept", "application/json")
                .header("User-Agent", "GameMulti-Paper/" + pluginVersion)
                .header("X-GM-Protocol-Version", config.protocolVersion());

        if (authenticated) {
            if (credentials == null || signer == null) {
                return CompletableFuture.failedFuture(new IllegalStateException("plugin credentials are unavailable"));
            }
            long localTime = Instant.now(clock).getEpochSecond();
            long blockedUntil = signingBlockedUntilNanos.get();
            if (blockedUntil != 0 && blockedUntil - System.nanoTime() > 0) {
                return CompletableFuture.failedFuture(
                        new IllegalStateException("signed requests are paused after repeated clock skew"));
            }
            long timestamp = localTime + clockOffsetSeconds.get();
            String nonce = signer.newNonce();
            request.header("X-GM-Client-Key", credentials.clientKey())
                    .header("X-GM-Timestamp", Long.toString(timestamp))
                    .header("X-GM-Nonce", nonce)
                    .header("X-GM-Signature", signer.sign(method, signingPath, timestamp, nonce, body));
        }

        if ("GET".equals(method)) {
            request.GET();
        } else {
            request.header("Content-Type", "application/json; charset=utf-8")
                    .method(method, HttpRequest.BodyPublishers.ofByteArray(body));
        }

        return http.sendAsync(request.build(), ignored -> new LimitedBodySubscriber(MAX_RESPONSE_BYTES))
                .thenApply(this::readResponse);
    }

    private byte[] readResponse(HttpResponse<byte[]> response) {
        byte[] bytes = response.body();
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw apiError(response.statusCode(), bytes, response.headers().firstValueAsLong("Retry-After").orElse(-1));
        }
        return bytes;
    }

    private ApiException apiError(int status, byte[] body, long retryAfterSeconds) {
        try {
            JsonNode value = json.readTree(body);
            String code = text(value, "code");
            String requestId = text(value, "requestId");
            boolean retryable = value != null && value.has("retryable")
                    ? value.path("retryable").asBoolean(false)
                    : status == 408 || status == 429 || status >= 500;
            JsonNode serverTimeValue = value == null ? null : value.get("serverTime");
            Long serverTime = serverTimeValue != null && serverTimeValue.canConvertToLong()
                    ? serverTimeValue.longValue()
                    : null;
            return new ApiException(
                    status,
                    code,
                    retryable,
                    requestId,
                    serverTime,
                    retryAfterSeconds >= 0 ? retryAfterSeconds : null);
        } catch (IOException ignored) {
            return new ApiException(
                    status,
                    null,
                    status == 408 || status == 429 || status >= 500,
                    null,
                    null,
                    retryAfterSeconds >= 0 ? retryAfterSeconds : null);
        }
    }

    private static String text(JsonNode value, String field) {
        JsonNode item = value == null ? null : value.get(field);
        return item != null && item.isTextual() ? item.textValue() : null;
    }

    private byte[] encode(JsonNode value) {
        try {
            return json.writeValueAsBytes(value);
        } catch (IOException error) {
            throw new IllegalStateException("failed to encode GameMulti request", error);
        }
    }

    private <T> T decode(byte[] bytes, Class<T> type) {
        try {
            return json.readValue(bytes, type);
        } catch (IOException error) {
            throw new CompletionException(new IOException("GameMulti API returned invalid JSON", error));
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static final class ClaimResponse {
        private final ClaimedServer server;
        private final ClaimedClient pluginClient;

        @JsonCreator
        ClaimResponse(
                @JsonProperty("server") ClaimedServer server,
                @JsonProperty("pluginClient") ClaimedClient pluginClient) {
            if (server == null || pluginClient == null) {
                throw new IllegalArgumentException("claim response is incomplete");
            }
            this.server = server;
            this.pluginClient = pluginClient;
        }

        ClaimedServer server() { return server; }
        ClaimedClient pluginClient() { return pluginClient; }

        @Override public String toString() {
            return "ClaimResponse{serverCode='" + server.serverCode() + "', pluginClient=<redacted>}";
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static final class ClaimedServer {
        private final String id;
        private final String serverCode;
        private final String status;

        @JsonCreator
        ClaimedServer(
                @JsonProperty("id") String id,
                @JsonProperty("serverCode") String serverCode,
                @JsonProperty("status") String status) {
            this.id = required(id, "server id");
            this.serverCode = required(serverCode, "server code");
            this.status = required(status, "server status");
        }

        String id() { return id; }
        String serverCode() { return serverCode; }
        String status() { return status; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static final class ClaimedClient {
        private final String id;
        private final String clientKey;
        private final String clientSecret;

        @JsonCreator
        ClaimedClient(
                @JsonProperty("id") String id,
                @JsonProperty("clientKey") String clientKey,
                @JsonProperty("clientSecret") String clientSecret) {
            this.id = required(id, "client id");
            this.clientKey = required(clientKey, "client key");
            this.clientSecret = required(clientSecret, "client secret");
        }

        String id() { return id; }
        String clientKey() { return clientKey; }
        String clientSecret() { return clientSecret; }

        @Override public String toString() {
            return "ClaimedClient{id='" + id + "', clientKey=<redacted>, clientSecret=<redacted>}";
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static final class BindingSession {
        private final String sessionId;
        private final String pairCode;
        private final int expiresIn;
        private final String bindUrl;
        private final String publicBindUrl;

        @JsonCreator
        BindingSession(
                @JsonProperty("sessionId") String sessionId,
                @JsonProperty("pairCode") String pairCode,
                @JsonProperty("expiresIn") int expiresIn,
                @JsonProperty("bindUrl") String bindUrl,
                @JsonProperty("publicBindUrl") String publicBindUrl) {
            this.sessionId = required(sessionId, "binding session id");
            this.pairCode = required(pairCode, "binding pair code");
            this.expiresIn = expiresIn;
            this.bindUrl = bindUrl;
            this.publicBindUrl = publicBindUrl;
        }

        String sessionId() { return sessionId; }
        String pairCode() { return pairCode; }
        int expiresIn() { return expiresIn; }

        String displayUrl(URI legacyBaseUri) {
            if (publicBindUrl != null && !publicBindUrl.isBlank()) {
                return publicBindUrl;
            }
            if (bindUrl != null && !bindUrl.isBlank()) {
                URI legacyUrl = URI.create(bindUrl);
                return legacyUrl.isAbsolute() ? legacyUrl.toString() : legacyBaseUri.resolve(legacyUrl).toString();
            }
            throw new IllegalArgumentException("binding response did not include a player URL");
        }

        @Override public String toString() {
            return "BindingSession{sessionId='" + sessionId + "', pairCode='" + pairCode + "', url=<redacted>}";
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static final class BindingStatus {
        private final String sessionId;
        private final String status;
        private final String nextAction;
        private final String expiresAt;
        private final Boolean retryable;
        private final Boolean recoverable;

        @JsonCreator
        BindingStatus(
                @JsonProperty("sessionId") String sessionId,
                @JsonProperty("status") String status,
                @JsonProperty("nextAction") String nextAction,
                @JsonProperty("expiresAt") String expiresAt,
                @JsonProperty("retryable") Boolean retryable,
                @JsonProperty("recoverable") Boolean recoverable) {
            this.sessionId = sessionId;
            this.status = required(status, "binding status");
            this.nextAction = nextAction;
            this.expiresAt = expiresAt;
            this.retryable = retryable;
            this.recoverable = recoverable;
        }

        String sessionId() { return sessionId; }
        String status() { return status; }
        String nextAction() { return nextAction; }
        String expiresAt() { return expiresAt; }
        boolean retryable() {
            return retryable != null ? retryable : recoverable == null || recoverable;
        }
    }

    private static String required(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is missing from API response");
        }
        return value.trim();
    }

    private static Throwable unwrap(Throwable error) {
        Throwable result = error;
        while (result instanceof CompletionException && result.getCause() != null) {
            result = result.getCause();
        }
        return result;
    }

    @Override
    public void close() {
        admissionExecutor.shutdownNow();
        executor.shutdownNow();
    }

    private static final class LimitedBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> body = new CompletableFuture<>();
        private final ByteArrayOutputStream output;
        private final int maximumBytes;
        private Flow.Subscription subscription;

        private LimitedBodySubscriber(int maximumBytes) {
            this.maximumBytes = maximumBytes;
            this.output = new ByteArrayOutputStream(Math.min(maximumBytes, 8192));
        }

        @Override
        public CompletionStage<byte[]> getBody() {
            return body;
        }

        @Override
        public void onSubscribe(Flow.Subscription value) {
            subscription = value;
            value.request(1);
        }

        @Override
        public void onNext(List<ByteBuffer> buffers) {
            try {
                for (ByteBuffer buffer : buffers) {
                    int size = buffer.remaining();
                    if ((long) output.size() + size > maximumBytes) {
                        subscription.cancel();
                        body.completeExceptionally(new IOException("GameMulti API response exceeded 1 MiB"));
                        return;
                    }
                    byte[] chunk = new byte[size];
                    buffer.get(chunk);
                    output.writeBytes(chunk);
                }
                subscription.request(1);
            } catch (RuntimeException error) {
                subscription.cancel();
                body.completeExceptionally(new IOException("failed to read GameMulti API response"));
            }
        }

        @Override
        public void onError(Throwable error) {
            body.completeExceptionally(new IOException("failed to read GameMulti API response"));
        }

        @Override
        public void onComplete() {
            body.complete(output.toByteArray());
        }
    }
}

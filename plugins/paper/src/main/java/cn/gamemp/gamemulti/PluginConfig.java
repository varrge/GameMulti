package cn.gamemp.gamemulti;

import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;
import org.bukkit.configuration.file.FileConfiguration;

final class PluginConfig {
    static final String SUPPORTED_PROTOCOL = "2026-06-mvp";
    private static final Pattern SERVER_CODE = Pattern.compile("[a-z0-9][a-z0-9-]{0,127}");

    private final URI baseUri;
    private final String protocolVersion;
    private final Duration connectTimeout;
    private final Duration requestTimeout;
    private final String serverName;
    private final String serverCode;
    private final String publicHost;
    private final int publicPort;
    private final String region;
    private final int pollIntervalSeconds;
    private final int maxActiveSessions;
    private final int heartbeatIntervalSeconds;

    private PluginConfig(
            URI baseUri,
            String protocolVersion,
            Duration connectTimeout,
            Duration requestTimeout,
            String serverName,
            String serverCode,
            String publicHost,
            int publicPort,
            String region,
            int pollIntervalSeconds,
            int maxActiveSessions,
            int heartbeatIntervalSeconds) {
        this.baseUri = baseUri;
        this.protocolVersion = protocolVersion;
        this.connectTimeout = connectTimeout;
        this.requestTimeout = requestTimeout;
        this.serverName = serverName;
        this.serverCode = serverCode;
        this.publicHost = publicHost;
        this.publicPort = publicPort;
        this.region = region;
        this.pollIntervalSeconds = pollIntervalSeconds;
        this.maxActiveSessions = maxActiveSessions;
        this.heartbeatIntervalSeconds = heartbeatIntervalSeconds;
    }

    static PluginConfig load(FileConfiguration source) {
        Objects.requireNonNull(source, "source");
        boolean allowInsecure = source.getBoolean("development.allow-insecure-http", false);
        URI baseUri = normalizeBaseUri(required(source, "api.base-url"), allowInsecure);
        String protocol = required(source, "api.protocol-version");
        if (!SUPPORTED_PROTOCOL.equals(protocol)) {
            throw new IllegalArgumentException("api.protocol-version must be " + SUPPORTED_PROTOCOL);
        }

        int connectTimeout = bounded(source, "api.connect-timeout-ms", 3000, 500, 30_000);
        int requestTimeout = bounded(source, "api.request-timeout-ms", 8000, 1000, 60_000);
        if (requestTimeout < connectTimeout) {
            throw new IllegalArgumentException("api.request-timeout-ms must not be shorter than connect timeout");
        }

        String serverName = required(source, "server.name");
        String serverCode = required(source, "server.code").toLowerCase(Locale.ROOT);
        if ("change-me".equals(serverCode) || !SERVER_CODE.matcher(serverCode).matches()) {
            throw new IllegalArgumentException("server.code must be configured with lowercase letters, digits, or hyphens");
        }
        String publicHost = required(source, "server.public-host");
        if (publicHost.length() > 128 || publicHost.contains("://")) {
            throw new IllegalArgumentException("server.public-host must be a hostname, not a URL");
        }

        return new PluginConfig(
                baseUri,
                protocol,
                Duration.ofMillis(connectTimeout),
                Duration.ofMillis(requestTimeout),
                serverName,
                serverCode,
                publicHost,
                bounded(source, "server.public-port", 25565, 1, 65_535),
                optional(source, "server.region"),
                bounded(source, "binding.poll-interval-seconds", 3, 1, 30),
                bounded(source, "binding.max-active-sessions", 200, 1, 1000),
                bounded(source, "telemetry.heartbeat-interval-seconds", 60, 30, 300));
    }

    static URI normalizeBaseUri(String rawValue, boolean allowInsecureHttp) {
        String value = Objects.requireNonNull(rawValue, "rawValue").trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        final URI uri;
        try {
            uri = URI.create(value).normalize();
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("api.base-url is not a valid URL");
        }
        if (!uri.isAbsolute() || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalArgumentException("api.base-url must be an absolute URL without credentials, query, or fragment");
        }
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if ("https".equals(scheme)) {
            return uri;
        }
        if (!"http".equals(scheme) || !allowInsecureHttp || !isPrivateHost(uri.getHost())) {
            throw new IllegalArgumentException("api.base-url must use HTTPS (HTTP is limited to private development hosts)");
        }
        return uri;
    }

    private static boolean isPrivateHost(String value) {
        String host = value.toLowerCase(Locale.ROOT);
        if ("localhost".equals(host)) {
            return true;
        }
        String ipv6 = host.startsWith("[") && host.endsWith("]")
                ? host.substring(1, host.length() - 1)
                : host;
        if (ipv6.contains(":") && ("::1".equals(ipv6) || ipv6.startsWith("fc")
                || ipv6.startsWith("fd") || ipv6.startsWith("fe80:"))) {
            return true;
        }
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) {
            return false;
        }
        int[] octets = new int[4];
        try {
            for (int i = 0; i < parts.length; i++) {
                octets[i] = Integer.parseInt(parts[i]);
                if (octets[i] < 0 || octets[i] > 255) {
                    return false;
                }
            }
        } catch (NumberFormatException error) {
            return false;
        }
        return octets[0] == 10
                || octets[0] == 127
                || (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31)
                || (octets[0] == 192 && octets[1] == 168)
                || (octets[0] == 169 && octets[1] == 254);
    }

    private static String required(FileConfiguration source, String path) {
        String value = optional(source, path);
        if (value == null) {
            throw new IllegalArgumentException(path + " is required");
        }
        return value;
    }

    private static String optional(FileConfiguration source, String path) {
        String value = source.getString(path);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static int bounded(FileConfiguration source, String path, int fallback, int min, int max) {
        int value = source.getInt(path, fallback);
        if (value < min || value > max) {
            throw new IllegalArgumentException(path + " must be between " + min + " and " + max);
        }
        return value;
    }

    URI baseUri() { return baseUri; }
    String protocolVersion() { return protocolVersion; }
    Duration connectTimeout() { return connectTimeout; }
    Duration requestTimeout() { return requestTimeout; }
    String serverName() { return serverName; }
    String serverCode() { return serverCode; }
    String publicHost() { return publicHost; }
    int publicPort() { return publicPort; }
    String region() { return region; }
    int pollIntervalSeconds() { return pollIntervalSeconds; }
    int maxActiveSessions() { return maxActiveSessions; }
    int heartbeatIntervalSeconds() { return heartbeatIntervalSeconds; }
}

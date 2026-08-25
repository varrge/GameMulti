package cn.gamemp.gamemulti;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Objects;

final class PluginCredentials {
    private final String serverId;
    private final String serverCode;
    private final String clientId;
    private final String clientKey;
    private final String clientSecret;
    private final String issuedAt;
    private final String protocolVersion;

    @JsonCreator
    PluginCredentials(
            @JsonProperty("serverId") String serverId,
            @JsonProperty("serverCode") String serverCode,
            @JsonProperty("clientId") String clientId,
            @JsonProperty("clientKey") String clientKey,
            @JsonProperty("clientSecret") String clientSecret,
            @JsonProperty("issuedAt") String issuedAt,
            @JsonProperty("protocolVersion") String protocolVersion) {
        this.serverId = required(serverId, "serverId");
        this.serverCode = required(serverCode, "serverCode");
        this.clientId = required(clientId, "clientId");
        this.clientKey = required(clientKey, "clientKey");
        this.clientSecret = required(clientSecret, "clientSecret");
        this.issuedAt = required(issuedAt, "issuedAt");
        this.protocolVersion = required(protocolVersion, "protocolVersion");
    }

    private static String required(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("credential " + field + " is missing");
        }
        return value.trim();
    }

    boolean sameSecret(PluginCredentials other) {
        return other != null
                && serverId.equals(other.serverId)
                && serverCode.equals(other.serverCode)
                && clientId.equals(other.clientId)
                && clientKey.equals(other.clientKey)
                && clientSecret.equals(other.clientSecret)
                && protocolVersion.equals(other.protocolVersion);
    }

    String keyPrefix() {
        return clientKey.substring(0, Math.min(6, clientKey.length())) + "…";
    }

    @JsonProperty("serverId") String serverId() { return serverId; }
    @JsonProperty("serverCode") String serverCode() { return serverCode; }
    @JsonProperty("clientId") String clientId() { return clientId; }
    @JsonProperty("clientKey") String clientKey() { return clientKey; }
    @JsonProperty("clientSecret") String clientSecret() { return clientSecret; }
    @JsonProperty("issuedAt") String issuedAt() { return issuedAt; }
    @JsonProperty("protocolVersion") String protocolVersion() { return protocolVersion; }

    @Override
    public String toString() {
        return "PluginCredentials{serverCode='" + serverCode + "', clientKey='" + keyPrefix()
                + "', clientSecret=<redacted>, protocolVersion='" + protocolVersion + "'}";
    }

    @Override
    public boolean equals(Object value) {
        if (this == value) return true;
        if (!(value instanceof PluginCredentials other)) return false;
        return sameSecret(other) && issuedAt.equals(other.issuedAt);
    }

    @Override
    public int hashCode() {
        return Objects.hash(serverId, serverCode, clientId, clientKey, clientSecret, issuedAt, protocolVersion);
    }
}

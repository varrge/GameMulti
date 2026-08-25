package cn.gamemp.gamemulti;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Locale;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class HmacSigner {
    private static final HexFormat HEX = HexFormat.of();
    private final byte[] secret;
    private final SecureRandom random;

    HmacSigner(String secret) {
        this(secret, new SecureRandom());
    }

    HmacSigner(String secret, SecureRandom random) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalArgumentException("plugin client secret is missing");
        }
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.random = random;
    }

    String sign(String method, String path, long timestamp, String nonce, byte[] body) {
        String payload = signingPayload(method, path, timestamp, nonce, body);
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return HEX.formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("HMAC-SHA256 is unavailable", error);
        }
    }

    String newNonce() {
        byte[] value = new byte[32];
        random.nextBytes(value);
        return HEX.formatHex(value);
    }

    static String signingPayload(String method, String path, long timestamp, String nonce, byte[] body) {
        return String.join("\n",
                method.toUpperCase(Locale.ROOT),
                path,
                Long.toString(timestamp),
                nonce,
                sha256(body));
    }

    static String sha256(byte[] body) {
        try {
            return HEX.formatHex(MessageDigest.getInstance("SHA-256").digest(body));
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }

    @Override
    public String toString() {
        return "HmacSigner{secret=<redacted>}";
    }
}

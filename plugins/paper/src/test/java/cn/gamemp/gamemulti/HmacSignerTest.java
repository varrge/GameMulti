package cn.gamemp.gamemulti;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class HmacSignerTest {
    @Test
    void matchesTheNodeProtocolVector() {
        byte[] body = ("{\"serverCode\":\"cn-mc-01\",\"gameCode\":\"minecraft\","
                + "\"platform\":\"java\",\"gameUserId\":\"player-1\","
                + "\"displayName\":\"Steve\",\"bindMode\":\"bind_existing\"}")
                .getBytes(StandardCharsets.UTF_8);
        String nonce = "01".repeat(32);

        assertEquals(
                "e503a4d152f334099af17e4912247363e5b48802f6951c3c97417b369786d9a4",
                HmacSigner.sha256(body));
        assertEquals(
                "7de3b2c07d784e0c886ccd95d1f2c9c041de5245f35edf5a075d71da5dc05295",
                new HmacSigner("demo-secret").sign(
                        "POST",
                        "/api/plugin/bindings/session",
                        1_781_845_200L,
                        nonce,
                        body));
    }

    @Test
    void getUsesTheSha256OfAnEmptyBody() {
        assertEquals(
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                HmacSigner.sha256(new byte[0]));
        assertEquals(
                String.join("\n",
                        "GET",
                        "/api/plugin/bindings/session-1",
                        "1781845200",
                        "02".repeat(32),
                        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
                HmacSigner.signingPayload(
                        "get",
                        "/api/plugin/bindings/session-1",
                        1_781_845_200L,
                        "02".repeat(32),
                        new byte[0]));
    }

    @Test
    void signerToStringIsRedacted() {
        String text = new HmacSigner("gmps_do-not-print").toString();
        assertFalse(text.contains("gmps_do-not-print"));
    }
}

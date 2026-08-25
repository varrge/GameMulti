package cn.gamemp.gamemulti;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.net.URI;
import org.junit.jupiter.api.Test;

class BindingSessionTest {
    @Test
    void prefersTheBridgePublicUrl() {
        GameMultiClient.BindingSession session = new GameMultiClient.BindingSession(
                "session-1",
                "123456",
                300,
                "/bind/confirm?token=private-token",
                "https://sso.game-mp.cn/bind/confirm?token=public-token");

        assertEquals(
                "https://sso.game-mp.cn/bind/confirm?token=public-token",
                session.displayUrl(URI.create("https://internal.example.test")));
        assertFalse(session.toString().contains("private-token"));
        assertFalse(session.toString().contains("public-token"));
    }

    @Test
    void fallsBackToTheLegacyRelativeUrl() {
        GameMultiClient.BindingSession session = new GameMultiClient.BindingSession(
                "session-1",
                "123456",
                300,
                "/bind/confirm?token=legacy-token",
                null);

        assertEquals(
                "https://internal.example.test/bind/confirm?token=legacy-token",
                session.displayUrl(URI.create("https://internal.example.test")));
    }
}

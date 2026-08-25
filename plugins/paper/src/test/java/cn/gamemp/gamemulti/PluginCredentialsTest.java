package cn.gamemp.gamemulti;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PluginCredentialsTest {
    @Test
    void toStringNeverContainsTheSecretOrFullClientKey() {
        PluginCredentials credentials = new PluginCredentials(
                "server-1",
                "survival-01",
                "client-1",
                "gmpc_survival_long-client-key",
                "gmps_super-secret-value",
                "2026-08-25T00:00:00Z",
                "2026-06-mvp");

        String text = credentials.toString();
        assertFalse(text.contains("gmps_super-secret-value"));
        assertFalse(text.contains("gmpc_survival_long-client-key"));
        assertTrue(text.contains("<redacted>"));
    }
}

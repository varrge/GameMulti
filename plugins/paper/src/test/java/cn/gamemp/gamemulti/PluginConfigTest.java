package cn.gamemp.gamemulti;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.net.URI;
import org.junit.jupiter.api.Test;

class PluginConfigTest {
    @Test
    void acceptsHttpsAndRemovesTrailingSlash() {
        assertEquals(
                URI.create("https://sso.game-mp.cn"),
                PluginConfig.normalizeBaseUri("https://sso.game-mp.cn/", false));
    }

    @Test
    void rejectsPublicPlainHttpEvenInDevelopmentMode() {
        assertThrows(
                IllegalArgumentException.class,
                () -> PluginConfig.normalizeBaseUri("http://sso.game-mp.cn", true));
        assertThrows(
                IllegalArgumentException.class,
                () -> PluginConfig.normalizeBaseUri("http://8.8.8.8", true));
        assertThrows(
                IllegalArgumentException.class,
                () -> PluginConfig.normalizeBaseUri("http://fdomain.com", true));
    }

    @Test
    void allowsPlainHttpOnlyForExplicitPrivateDevelopmentHosts() {
        assertEquals(
                URI.create("http://127.0.0.1:8080"),
                PluginConfig.normalizeBaseUri("http://127.0.0.1:8080", true));
        assertEquals(
                URI.create("http://192.168.1.20:8080"),
                PluginConfig.normalizeBaseUri("http://192.168.1.20:8080", true));
    }

    @Test
    void rejectsCredentialsQueryAndFragment() {
        assertThrows(
                IllegalArgumentException.class,
                () -> PluginConfig.normalizeBaseUri("https://user:pass@sso.game-mp.cn", false));
        assertThrows(
                IllegalArgumentException.class,
                () -> PluginConfig.normalizeBaseUri("https://sso.game-mp.cn?secret=x", false));
        assertThrows(
                IllegalArgumentException.class,
                () -> PluginConfig.normalizeBaseUri("https://sso.game-mp.cn#fragment", false));
    }
}

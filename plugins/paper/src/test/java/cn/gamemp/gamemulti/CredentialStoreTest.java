package cn.gamemp.gamemulti;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.StandardOpenOption;
import java.util.Set;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CredentialStoreTest {
    @TempDir Path directory;

    @Test
    void atomicallyRoundTripsPrivateCredentials() throws Exception {
        CredentialStore store = new CredentialStore(directory, Logger.getAnonymousLogger());
        PluginCredentials credentials = new PluginCredentials(
                "server-1",
                "survival-01",
                "client-1",
                "gmpc_survival_client",
                "gmps_secret",
                "2026-08-25T00:00:00Z",
                "2026-06-mvp");

        store.save(credentials);

        assertEquals(credentials, store.load());
        String disk = Files.readString(directory.resolve(CredentialStore.CREDENTIALS_FILE));
        assertFalse(disk.isBlank());
        if (Files.getFileStore(directory).supportsFileAttributeView("posix")) {
            assertEquals(
                    Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE),
                    Files.getPosixFilePermissions(directory.resolve(CredentialStore.CREDENTIALS_FILE)));
        }
    }

    @Test
    void marksAnInstallTokenInProgressBeforeReturningIt() throws Exception {
        CredentialStore store = new CredentialStore(directory, Logger.getAnonymousLogger());
        store.prepareDirectory();
        Path token = directory.resolve(CredentialStore.INSTALL_TOKEN_FILE);
        Files.writeString(token, "gmit_test-token-value", StandardOpenOption.CREATE_NEW);
        if (Files.getFileStore(directory).supportsFileAttributeView("posix")) {
            Files.setPosixFilePermissions(token, Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE));
        }

        assertEquals("gmit_test-token-value", store.beginClaim());
        assertFalse(Files.exists(token));
        assertTrue(store.hasClaimInProgress());
    }
}

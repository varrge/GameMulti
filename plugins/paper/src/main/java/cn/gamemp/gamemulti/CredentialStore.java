package cn.gamemp.gamemulti;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.UserPrincipal;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.logging.Logger;

final class CredentialStore {
    private static final long MAX_CREDENTIAL_BYTES = 16 * 1024;
    private static final long MAX_INSTALL_TOKEN_BYTES = 1024;
    static final String CREDENTIALS_FILE = "credentials.yml";
    static final String INSTALL_TOKEN_FILE = "install-token.txt";
    static final String CLAIM_IN_PROGRESS_FILE = "install-token.claiming";
    private static final Set<PosixFilePermission> DIRECTORY_PERMISSIONS = EnumSet.of(
            PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE,
            PosixFilePermission.OWNER_EXECUTE);
    private static final Set<PosixFilePermission> FILE_PERMISSIONS = EnumSet.of(
            PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE);

    private final Path directory;
    private final Logger logger;
    private final ObjectMapper yaml = new ObjectMapper(new YAMLFactory())
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    CredentialStore(Path directory, Logger logger) {
        this.directory = directory;
        this.logger = logger;
    }

    void prepareDirectory() throws IOException {
        Files.createDirectories(directory);
        setPermissionsIfSupported(directory, DIRECTORY_PERMISSIONS);
    }

    boolean hasCredentials() {
        return Files.isRegularFile(directory.resolve(CREDENTIALS_FILE));
    }

    boolean hasInstallToken() {
        return Files.isRegularFile(directory.resolve(INSTALL_TOKEN_FILE));
    }

    boolean hasClaimInProgress() {
        return Files.isRegularFile(directory.resolve(CLAIM_IN_PROGRESS_FILE));
    }

    PluginCredentials load() throws IOException {
        Path path = directory.resolve(CREDENTIALS_FILE);
        requirePrivateFile(path);
        requireSize(path, MAX_CREDENTIAL_BYTES);
        try {
            return yaml.readValue(Files.readAllBytes(path), PluginCredentials.class);
        } catch (Exception error) {
            throw new IOException("credentials.yml is invalid");
        }
    }

    String beginClaim() throws IOException {
        Path source = directory.resolve(INSTALL_TOKEN_FILE);
        Path claiming = directory.resolve(CLAIM_IN_PROGRESS_FILE);
        requirePrivateFile(source);
        if (Files.exists(claiming)) {
            throw new IOException("install-token.claiming already exists; check the previous claim outcome");
        }
        Files.move(source, claiming, StandardCopyOption.ATOMIC_MOVE);
        forceDirectory();
        return readToken(claiming);
    }

    private String readToken(Path path) throws IOException {
        requirePrivateFile(path);
        requireSize(path, MAX_INSTALL_TOKEN_BYTES);
        byte[] bytes = Files.readAllBytes(path);
        try {
            String token = new String(bytes, StandardCharsets.UTF_8).trim();
            if (token.length() < 16 || token.length() > 256 || token.contains("\n") || token.contains("\r")) {
                throw new IOException("install-token.txt must contain exactly one valid token");
            }
            return token;
        } finally {
            Arrays.fill(bytes, (byte) 0);
        }
    }

    void save(PluginCredentials credentials) throws IOException {
        prepareDirectory();
        Path destination = directory.resolve(CREDENTIALS_FILE);
        Path temporary = directory.resolve(CREDENTIALS_FILE + ".tmp");
        byte[] bytes;
        try {
            bytes = yaml.writeValueAsBytes(credentials);
        } catch (Exception error) {
            throw new IOException("failed to encode credentials");
        }
        try {
            Files.deleteIfExists(temporary);
            try (FileChannel channel = FileChannel.open(
                    temporary,
                    StandardOpenOption.CREATE_NEW,
                    StandardOpenOption.WRITE)) {
                setPermissionsIfSupported(temporary, FILE_PERMISSIONS);
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) {
                    channel.write(buffer);
                }
                channel.force(true);
            }
            Files.move(temporary, destination,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
            forceDirectory();
            setPermissionsIfSupported(destination, FILE_PERMISSIONS);
            PluginCredentials reloaded = load();
            if (!credentials.equals(reloaded)) {
                throw new IOException("credential verification failed after writing");
            }
        } finally {
            Arrays.fill(bytes, (byte) 0);
            Files.deleteIfExists(temporary);
        }
    }

    void consumeClaimMarker() throws IOException {
        Path path = directory.resolve(CLAIM_IN_PROGRESS_FILE);
        try {
            Files.deleteIfExists(path);
        } catch (IOException deleteError) {
            try (FileChannel channel = FileChannel.open(path, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
                channel.force(true);
            }
            setPermissionsIfSupported(path, FILE_PERMISSIONS);
            logger.warning("install-token.claiming could not be deleted and was cleared instead");
            return;
        }
        forceDirectory();
    }

    private void forceDirectory() throws IOException {
        try (FileChannel channel = FileChannel.open(directory, StandardOpenOption.READ)) {
            channel.force(true);
        } catch (UnsupportedOperationException error) {
            logger.warning("directory fsync is unavailable on this file system");
        } catch (IOException error) {
            if (System.getProperty("os.name", "").startsWith("Windows")) {
                logger.warning("directory fsync is unavailable on Windows");
                return;
            }
            throw error;
        }
    }

    private void requirePrivateFile(Path path) throws IOException {
        if (!Files.isRegularFile(path)) {
            throw new IOException(path.getFileName() + " is missing");
        }
        try {
            Set<PosixFilePermission> permissions = Files.getPosixFilePermissions(path);
            if (permissions.contains(PosixFilePermission.GROUP_READ)
                    || permissions.contains(PosixFilePermission.GROUP_WRITE)
                    || permissions.contains(PosixFilePermission.GROUP_EXECUTE)
                    || permissions.contains(PosixFilePermission.OTHERS_READ)
                    || permissions.contains(PosixFilePermission.OTHERS_WRITE)
                    || permissions.contains(PosixFilePermission.OTHERS_EXECUTE)) {
                throw new IOException(path.getFileName() + " permissions are unsafe; run chmod 600 on the file");
            }
        } catch (UnsupportedOperationException ignored) {
            requireOwnerOnlyAcl(path);
        }
    }

    private static void requireSize(Path path, long maximumBytes) throws IOException {
        if (Files.size(path) > maximumBytes) {
            throw new IOException(path.getFileName() + " is too large");
        }
    }

    private void setPermissionsIfSupported(Path path, Set<PosixFilePermission> permissions) throws IOException {
        try {
            Files.setPosixFilePermissions(path, permissions);
        } catch (UnsupportedOperationException ignored) {
            AclFileAttributeView view = Files.getFileAttributeView(path, AclFileAttributeView.class);
            if (view == null) {
                throw new IOException("file system does not support owner-only POSIX permissions or ACLs");
            }
            UserPrincipal owner = Files.getOwner(path);
            AclEntry ownerOnly = AclEntry.newBuilder()
                    .setType(AclEntryType.ALLOW)
                    .setPrincipal(owner)
                    .setPermissions(EnumSet.allOf(AclEntryPermission.class))
                    .build();
            view.setAcl(List.of(ownerOnly));
        }
    }

    private static void requireOwnerOnlyAcl(Path path) throws IOException {
        AclFileAttributeView view = Files.getFileAttributeView(path, AclFileAttributeView.class);
        if (view == null) {
            throw new IOException(path.getFileName() + " permissions cannot be verified on this file system");
        }
        UserPrincipal owner = Files.getOwner(path);
        boolean ownerAllowed = false;
        for (AclEntry entry : view.getAcl()) {
            if (entry.type() == AclEntryType.ALLOW && !entry.principal().equals(owner)) {
                throw new IOException(path.getFileName() + " ACL allows access to a non-owner principal");
            }
            if (entry.type() == AclEntryType.ALLOW && entry.principal().equals(owner)) {
                ownerAllowed = true;
            }
        }
        if (!ownerAllowed) {
            throw new IOException(path.getFileName() + " ACL does not grant access to its owner");
        }
    }
}

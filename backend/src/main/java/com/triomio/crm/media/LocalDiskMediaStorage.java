package com.triomio.crm.media;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.stereotype.Component;

@Component
class LocalDiskMediaStorage implements MediaStorage {

    private final MediaProperties properties;
    private final Path root;

    LocalDiskMediaStorage(MediaProperties properties) throws IOException {
        this.properties = properties;
        this.root = properties.dir().toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    @Override
    public StoredObject put(String key, InputStream data, long size, String contentType) {
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            try (OutputStream out = Files.newOutputStream(target)) {
                data.transferTo(out);
            }
        } catch (IOException e) {
            throw new IllegalStateException("Failed to store media " + key, e);
        }
        return new StoredObject(key, publicUrl(key));
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException e) {
            throw new IllegalStateException("Failed to delete media " + key, e);
        }
    }

    @Override
    public URI publicUrl(String key) {
        return URI.create(properties.absolutePublicUrl(key));
    }

    Path resolve(String key) {
        Path resolved = root.resolve(key).normalize();
        if (!resolved.startsWith(root)) {
            throw new IllegalArgumentException("Invalid media key");
        }
        return resolved;
    }
}

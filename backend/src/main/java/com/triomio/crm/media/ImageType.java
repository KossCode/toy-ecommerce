package com.triomio.crm.media;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import org.jspecify.annotations.Nullable;

/** Sniff JPEG / PNG / WebP from magic bytes (docs/backend/09-media-s3.md §3). */
enum ImageType {
    JPEG("image/jpeg", "jpg"),
    PNG("image/png", "png"),
    WEBP("image/webp", "webp");

    private final String contentType;
    private final String extension;

    ImageType(String contentType, String extension) {
        this.contentType = contentType;
        this.extension = extension;
    }

    String contentType() {
        return contentType;
    }

    String extension() {
        return extension;
    }

    static @Nullable ImageType detect(byte[] header) {
        if (header.length < 3) {
            return null;
        }
        if ((header[0] & 0xFF) == 0xFF && (header[1] & 0xFF) == 0xD8 && (header[2] & 0xFF) == 0xFF) {
            return JPEG;
        }
        if (header.length >= 8
                && header[0] == (byte) 0x89
                && header[1] == 0x50
                && header[2] == 0x4E
                && header[3] == 0x47
                && header[4] == 0x0D
                && header[5] == 0x0A
                && header[6] == 0x1A
                && header[7] == 0x0A) {
            return PNG;
        }
        if (header.length >= 12
                && header[0] == 'R'
                && header[1] == 'I'
                && header[2] == 'F'
                && header[3] == 'F'
                && header[8] == 'W'
                && header[9] == 'E'
                && header[10] == 'B'
                && header[11] == 'P') {
            return WEBP;
        }
        return null;
    }

    static byte[] prepend(byte[] header, InputStream rest) throws IOException {
        byte[] tail = rest.readAllBytes();
        byte[] all = Arrays.copyOf(header, header.length + tail.length);
        System.arraycopy(tail, 0, all, header.length, tail.length);
        return all;
    }
}

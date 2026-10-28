package com.triomio.crm.media;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Public product photos for the admin UI and marketplace feed pullers. */
@RestController
class MediaServeController {

    private final LocalDiskMediaStorage storage;

    MediaServeController(LocalDiskMediaStorage storage) {
        this.storage = storage;
    }

    @GetMapping("/media/products/{sku}/{fileName}")
    void productPhoto(@PathVariable String sku, @PathVariable String fileName, HttpServletResponse response)
            throws IOException {
        if (sku.contains("..") || fileName.contains("..") || fileName.contains("/") || fileName.contains("\\")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        String key = "products/" + sku + "/" + fileName;
        Path path = storage.resolve(key);
        if (!Files.isRegularFile(path)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        String contentType = probeContentType(fileName, path);
        response.setStatus(HttpStatus.OK.value());
        response.setContentType(contentType);
        response.setHeader(HttpHeaders.CACHE_CONTROL, "public, max-age=86400");
        try (InputStream in = Files.newInputStream(path)) {
            in.transferTo(response.getOutputStream());
        }
    }

    private static String probeContentType(String fileName, Path path) throws IOException {
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return MediaType.IMAGE_JPEG_VALUE;
        }
        if (lower.endsWith(".png")) {
            return MediaType.IMAGE_PNG_VALUE;
        }
        if (lower.endsWith(".webp")) {
            return "image/webp";
        }
        String probed = Files.probeContentType(path);
        return probed != null ? probed : MediaType.APPLICATION_OCTET_STREAM_VALUE;
    }
}

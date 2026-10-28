package com.triomio.crm.media;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.media")
public record MediaProperties(Path dir, String publicBaseUrl) {

    public MediaProperties {
        if (dir == null) {
            dir = Path.of(".local-media");
        }
        if (publicBaseUrl == null || publicBaseUrl.isBlank()) {
            publicBaseUrl = "http://localhost:8080";
        }
    }

    public String absolutePublicUrl(String key) {
        String base =
                publicBaseUrl.endsWith("/") ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1) : publicBaseUrl;
        String path = key.startsWith("/") ? key : "/" + key;
        return base + "/media" + path;
    }
}

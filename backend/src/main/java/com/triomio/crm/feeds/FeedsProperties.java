package com.triomio.crm.feeds;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.feeds")
public record FeedsProperties(Path dir, String token, String publicBaseUrl) {

    public FeedsProperties {
        if (dir == null) {
            dir = Path.of(".local-feeds");
        }
        if (token == null || token.isBlank()) {
            token = "local-dev-feeds-token";
        }
        if (publicBaseUrl == null || publicBaseUrl.isBlank()) {
            publicBaseUrl = "http://localhost:8080";
        }
    }

    public String feedUrl(String marketplaceWire) {
        String base =
                publicBaseUrl.endsWith("/") ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1) : publicBaseUrl;
        return base + "/feeds/" + token + "/" + marketplaceWire + ".xml";
    }

    public Path fileFor(String marketplace) {
        return dir.resolve(marketplace.toLowerCase() + ".xml");
    }
}

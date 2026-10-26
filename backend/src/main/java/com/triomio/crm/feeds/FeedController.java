package com.triomio.crm.feeds;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
class FeedController {

    private final FeedsProperties properties;

    FeedController(FeedsProperties properties) {
        this.properties = properties;
    }

    @GetMapping("/feeds/{token}/{marketplace}.xml")
    void feed(@PathVariable String token, @PathVariable String marketplace, HttpServletResponse response)
            throws IOException {
        if (!properties.token().equals(token)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        String mp = marketplace.toUpperCase();
        if (!mp.equals("PROM") && !mp.equals("ROZETKA") && !mp.equals("EPICENTR")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        var path = properties.fileFor(mp);
        if (!Files.isRegularFile(path)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        response.setStatus(HttpStatus.OK.value());
        response.setContentType(MediaType.APPLICATION_XML_VALUE);
        response.setCharacterEncoding("UTF-8");
        try (InputStream in = Files.newInputStream(path)) {
            in.transferTo(response.getOutputStream());
        }
    }
}

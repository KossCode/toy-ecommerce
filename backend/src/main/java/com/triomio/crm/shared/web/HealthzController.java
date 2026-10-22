package com.triomio.crm.shared.web;

import io.swagger.v3.oas.annotations.Hidden;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@Hidden
@RestController
class HealthzController {

    private static final Logger log = LoggerFactory.getLogger(HealthzController.class);

    private final JdbcClient jdbc;

    HealthzController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/healthz")
    ResponseEntity<Map<String, String>> healthz() {
        try {
            jdbc.sql("SELECT 1").query(Integer.class).single();
            return ResponseEntity.ok(Map.of("status", "UP"));
        } catch (RuntimeException e) {
            log.warn("healthz: database check failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("status", "DOWN"));
        }
    }
}

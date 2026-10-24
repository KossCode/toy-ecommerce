package com.triomio.crm.integrations.marketplace;

import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * In-process stand-in for Prom/Rozetka/Epicentr. Records every call in {@code sync_log} and never leaves the process —
 * safe for local and CI until real clients are wired behind the same interface.
 */
@Component
@Primary
public class MockMarketplaceClient implements MarketplaceClient {

    private static final Logger log = LoggerFactory.getLogger(MockMarketplaceClient.class);

    private final JdbcClient jdbc;
    private final Clock clock;

    public MockMarketplaceClient(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Override
    public String pollOrders(String marketplace, String cursorOrNull) {
        long started = clock.millis();
        String path = "/mock/" + marketplace.toLowerCase() + "/orders";
        log.debug("Mock pollOrders {} cursor={}", marketplace, cursorOrNull);
        writeLog(marketplace, "ORDERS_POLL", "GET", path, 200, (int) (clock.millis() - started), null, "[]");
        return cursorOrNull == null ? "mock-0" : cursorOrNull;
    }

    @Override
    public void pushStock(String marketplace, long productId, JsonNode payload) {
        long started = clock.millis();
        String path = "/mock/" + marketplace.toLowerCase() + "/stock/" + productId;
        writeLog(
                marketplace,
                "STOCK_PUSH",
                "PUT",
                path,
                200,
                (int) (clock.millis() - started),
                payload.toString(),
                "{\"ok\":true}");
    }

    @Override
    public void pushPrice(String marketplace, long productId, JsonNode payload) {
        long started = clock.millis();
        String path = "/mock/" + marketplace.toLowerCase() + "/price/" + productId;
        writeLog(
                marketplace,
                "PRICE_PUSH",
                "PUT",
                path,
                200,
                (int) (clock.millis() - started),
                payload.toString(),
                "{\"ok\":true}");
    }

    private void writeLog(
            String marketplace,
            String operation,
            String method,
            String path,
            int status,
            int durationMs,
            String requestExcerpt,
            String responseExcerpt) {
        jdbc.sql("""
                        INSERT INTO sync_log (marketplace, operation, http_method, path, http_status, duration_ms,
                                              request_excerpt, response_excerpt)
                        VALUES (:mp, :op, :method, :path, :status, :ms, :req, :res)
                        """)
                .param("mp", marketplace)
                .param("op", operation)
                .param("method", method)
                .param("path", path)
                .param("status", status)
                .param("ms", durationMs)
                .param("req", requestExcerpt)
                .param("res", responseExcerpt)
                .update();
    }
}

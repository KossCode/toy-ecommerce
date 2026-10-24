package com.triomio.crm.integrations.outbox;

import com.triomio.crm.integrations.marketplace.MarketplaceClient;
import com.triomio.crm.integrations.mode.IntegrationModeService;
import com.triomio.crm.integrations.mode.WriteMode;
import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Claims due outbox rows and applies mode + safeguards before any marketplace write
 * (docs/backend/08-marketplace-sync.md §3–4).
 */
@Service
public class OutboxDispatcher {

    private static final Logger log = LoggerFactory.getLogger(OutboxDispatcher.class);
    private static final int BATCH = 50;
    private static final int MAX_ATTEMPTS = 10;
    private static final Duration[] BACKOFF = {
        Duration.ofSeconds(30),
        Duration.ofMinutes(2),
        Duration.ofMinutes(10),
        Duration.ofMinutes(30),
        Duration.ofHours(1)
    };

    private final JdbcClient jdbc;
    private final IntegrationModeService modes;
    private final OutboxSafeguards safeguards;
    private final MarketplaceClient marketplaces;
    private final JsonMapper json;

    public OutboxDispatcher(
            JdbcClient jdbc,
            IntegrationModeService modes,
            OutboxSafeguards safeguards,
            MarketplaceClient marketplaces,
            JsonMapper json) {
        this.jdbc = jdbc;
        this.modes = modes;
        this.safeguards = safeguards;
        this.marketplaces = marketplaces;
        this.json = json;
    }

    @Transactional
    public int dispatchDue() {
        List<Long> ids = jdbc.sql("""
                        SELECT id FROM sync_outbox
                        WHERE status = 'PENDING' AND next_attempt_at <= now()
                        ORDER BY next_attempt_at
                        FOR UPDATE SKIP LOCKED
                        LIMIT :limit
                        """).param("limit", BATCH).query(Long.class).list();
        int handled = 0;
        for (Long id : ids) {
            if (processOne(id)) {
                handled++;
            }
        }
        return handled;
    }

    private boolean processOne(long id) {
        record Row(long id, String marketplace, String kind, Long productId, String payload, int attempts) {}
        Row row = jdbc.sql("""
                        SELECT id, marketplace, kind, product_id AS product_id, payload::text AS payload, attempts
                        FROM sync_outbox WHERE id = :id
                        """).param("id", id).query(Row.class).single();

        WriteMode mode = modes.effectiveMode(row.marketplace());
        if (mode == WriteMode.OFF || mode == WriteMode.READ_ONLY) {
            mark(row.id(), "BLOCKED", row.attempts(), "режим " + mode.name(), null);
            return true;
        }

        JsonNode payload = json.readTree(row.payload());
        if ("STOCK".equals(row.kind())) {
            String mass = safeguards.checkMassZero(row.marketplace(), payload);
            if (mass != null) {
                mark(row.id(), "PENDING", row.attempts(), mass, Duration.ofMinutes(10));
                return true;
            }
        }
        if ("PRICE".equals(row.kind()) && row.productId() != null) {
            String jump = safeguards.checkPriceJump(row.productId(), payload);
            if (jump != null) {
                mark(row.id(), "BLOCKED", row.attempts(), jump, null);
                return true;
            }
        }

        if (mode.isDryRun()) {
            jdbc.sql("""
                            INSERT INTO sync_log (marketplace, operation, http_method, path, http_status, duration_ms,
                                                  request_excerpt, response_excerpt)
                            VALUES (:mp, :op, 'PUT', :path, null, 0, :req, 'DRY_RUN')
                            """)
                    .param("mp", row.marketplace())
                    .param("op", row.kind() + "_DRY_RUN")
                    .param("path", "/dry-run/" + row.kind().toLowerCase() + "/" + row.productId())
                    .param("req", row.payload())
                    .update();
            mark(row.id(), "DRY_RUN", row.attempts(), null, null);
            return true;
        }

        try {
            if ("STOCK".equals(row.kind())) {
                marketplaces.pushStock(row.marketplace(), row.productId(), payload);
            } else if ("PRICE".equals(row.kind())) {
                marketplaces.pushPrice(row.marketplace(), row.productId(), payload);
            } else {
                mark(row.id(), "BLOCKED", row.attempts(), "ORDER_STATUS ще не реалізовано в диспетчері", null);
                return true;
            }
            mark(row.id(), "DONE", row.attempts(), null, null);
            return true;
        } catch (RuntimeException ex) {
            int nextAttempts = row.attempts() + 1;
            if (nextAttempts >= MAX_ATTEMPTS) {
                mark(row.id(), "FAILED", nextAttempts, ex.getMessage(), null);
            } else {
                Duration delay = BACKOFF[Math.min(nextAttempts - 1, BACKOFF.length - 1)];
                mark(row.id(), "PENDING", nextAttempts, ex.getMessage(), delay);
            }
            log.warn("Outbox {} failed attempt {}: {}", row.id(), nextAttempts, ex.toString());
            return true;
        }
    }

    private void mark(long id, String status, int attempts, String error, Duration delay) {
        if (delay == null) {
            jdbc.sql("""
                            UPDATE sync_outbox SET status = :status, attempts = :attempts, last_error = :error,
                              updated_at = now(),
                              processed_at = CASE WHEN :status IN ('DONE', 'DRY_RUN', 'BLOCKED', 'FAILED')
                                                  THEN now() ELSE processed_at END
                            WHERE id = :id
                            """)
                    .param("id", id)
                    .param("status", status)
                    .param("attempts", attempts)
                    .param("error", error)
                    .update();
        } else {
            jdbc.sql("""
                            UPDATE sync_outbox SET status = :status, attempts = :attempts, last_error = :error,
                              next_attempt_at = now() + make_interval(secs => :secs), updated_at = now()
                            WHERE id = :id
                            """)
                    .param("id", id)
                    .param("status", status)
                    .param("attempts", attempts)
                    .param("error", error)
                    .param("secs", delay.toSeconds())
                    .update();
        }
    }
}

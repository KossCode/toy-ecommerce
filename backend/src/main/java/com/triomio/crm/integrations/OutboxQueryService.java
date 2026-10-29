package com.triomio.crm.integrations;

import com.triomio.crm.shared.ApiProblemException;
import com.triomio.crm.shared.WireLabels;
import java.time.OffsetDateTime;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class OutboxQueryService {

    record OutboxItem(
            long id,
            String kind,
            String status,
            int attempts,
            @Nullable String sku,
            @Nullable String orderId,
            @Nullable String lastError,
            @Nullable OffsetDateTime nextAttemptAt,
            OffsetDateTime updatedAt) {}

    record OutboxPayload(List<OutboxItem> items) {}

    private final JdbcClient jdbc;

    OutboxQueryService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    OutboxPayload list(String marketplaceWire) {
        String mp = WireLabels.marketplaceCode(marketplaceWire);
        if (!List.of("PROM", "ROZETKA", "EPICENTR").contains(mp)) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "INTEGRATION_NOT_FOUND", "Площадку не знайдено");
        }
        List<OutboxItem> items = jdbc.sql("""
                        SELECT o.id, o.kind, o.status, o.attempts, p.sku,
                               ord.number AS order_id, o.last_error, o.next_attempt_at, o.updated_at
                        FROM sync_outbox o
                        LEFT JOIN products p ON p.id = o.product_id
                        LEFT JOIN orders ord ON ord.id = o.order_id
                        WHERE o.marketplace = :mp
                          AND o.status IN ('PENDING', 'IN_PROGRESS', 'FAILED', 'BLOCKED', 'DRY_RUN')
                        ORDER BY
                          CASE o.status
                            WHEN 'FAILED' THEN 0
                            WHEN 'BLOCKED' THEN 1
                            WHEN 'IN_PROGRESS' THEN 2
                            WHEN 'PENDING' THEN 3
                            ELSE 4
                          END,
                          o.updated_at DESC
                        LIMIT 100
                        """)
                .param("mp", mp)
                .query((rs, i) -> new OutboxItem(
                        rs.getLong("id"),
                        rs.getString("kind"),
                        rs.getString("status"),
                        rs.getInt("attempts"),
                        rs.getString("sku"),
                        rs.getString("order_id"),
                        rs.getString("last_error"),
                        rs.getObject("next_attempt_at", OffsetDateTime.class),
                        rs.getObject("updated_at", OffsetDateTime.class)))
                .list();
        return new OutboxPayload(items);
    }
}

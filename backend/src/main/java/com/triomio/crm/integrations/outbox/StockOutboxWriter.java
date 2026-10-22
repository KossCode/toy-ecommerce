package com.triomio.crm.integrations.outbox;

import com.triomio.crm.inventory.StockChanged;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Enqueues the absolute "available" value for every enabled channel of a sellable product, in the same transaction as
 * the stock change. Demo, draft and archived products never get a row (docs/backend/08-marketplace-sync.md §4).
 */
@Component
class StockOutboxWriter {

    private static final String UPSERT = """
            INSERT INTO sync_outbox (marketplace, kind, product_id, payload, dedupe_key)
            SELECT pc.marketplace, 'STOCK', p.id, jsonb_build_object('available', :available),
                   pc.marketplace || ':STOCK:' || p.id
            FROM products p
            JOIN product_channels pc ON pc.product_id = p.id
            WHERE p.id = :productId AND p.status = 'ACTIVE' AND NOT p.is_demo AND pc.enabled
            ON CONFLICT (dedupe_key) WHERE status = 'PENDING'
            DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
            """;

    private final JdbcClient jdbc;

    StockOutboxWriter(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    void on(StockChanged event) {
        if (event.availableBefore() == event.after().available()) {
            return;
        }
        jdbc.sql(UPSERT)
                .param("productId", event.productId())
                .param("available", event.after().available())
                .update();
    }
}

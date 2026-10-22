package com.triomio.crm.audit;

import com.triomio.crm.inventory.StockChanged;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
class StockAuditWriter {

    private static final String INSERT = """
            INSERT INTO audit_log (entity_type, entity_id, sku, kind, message, diff)
            SELECT 'PRODUCT', p.id, p.sku, 'STOCK', :message,
                   jsonb_build_object('total', :total, 'reserve', :reserve,
                                      'available', jsonb_build_object('from', :before, 'to', :after))
            FROM products p
            WHERE p.id = :productId
            """;

    private final JdbcClient jdbc;

    StockAuditWriter(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    void on(StockChanged event) {
        jdbc.sql(INSERT)
                .param("productId", event.productId())
                .param("message", message(event))
                .param("total", event.after().total())
                .param("reserve", event.after().reserve())
                .param("before", event.availableBefore())
                .param("after", event.after().available())
                .update();
    }

    static String message(StockChanged event) {
        String action = switch (event.operation()) {
            case RESERVE -> "Резерв +" + event.qty();
            case RELEASE -> "Зняття резерву −" + event.qty();
            case SHIP -> "Відвантаження −" + event.qty();
            case SET_TOTAL -> "Всього = " + event.qty();
        };
        String reason = event.reason() == null || event.reason().isBlank() ? "" : ", " + event.reason();
        return action + reason + " (доступно " + event.availableBefore() + " → "
                + event.after().available() + ")";
    }
}

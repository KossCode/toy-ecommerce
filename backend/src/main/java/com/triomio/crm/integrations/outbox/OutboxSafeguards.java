package com.triomio.crm.integrations.outbox;

import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * docs/backend/08-marketplace-sync.md §4 — mass stock zero and sharp price jumps. Thresholds live in {@code settings}
 * when present; otherwise the documented defaults apply.
 */
@Component
public class OutboxSafeguards {

    private static final int MASS_ZERO_SKU_LIMIT = 10;
    private static final BigDecimal PRICE_UP_FACTOR = new BigDecimal("1.5");
    private static final BigDecimal PRICE_DOWN_FACTOR = new BigDecimal("0.5");

    private final JdbcClient jdbc;

    public OutboxSafeguards(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * If this STOCK payload would zero availability and enough other pending zeros already exist for the marketplace,
     * pause the marketplace and return a human reason. Otherwise null.
     */
    @Transactional
    public String checkMassZero(String marketplace, JsonNode payload) {
        JsonNode availableNode = payload.get("available");
        if (availableNode == null || !availableNode.isNumber() || availableNode.intValue() != 0) {
            return null;
        }
        int pendingZeros =
                jdbc.sql("""
                        SELECT count(*) FROM sync_outbox
                        WHERE marketplace = :mp AND kind = 'STOCK' AND status = 'PENDING'
                          AND (payload->>'available')::int = 0
                          AND created_at > now() - interval '10 minutes'
                        """).param("mp", marketplace).query(Integer.class).single();
        if (pendingZeros < MASS_ZERO_SKU_LIMIT) {
            return null;
        }
        String reason = "Масове обнулення: ≥" + MASS_ZERO_SKU_LIMIT + " SKU за 10 хв";
        jdbc.sql("""
                        UPDATE integration_settings
                        SET mode = 'READ_ONLY', paused_reason = :reason, updated_at = now()
                        WHERE marketplace = :mp AND mode <> 'OFF'
                        """).param("reason", reason).param("mp", marketplace).update();
        return reason;
    }

    /**
     * Sharp price change vs current base_price of the product. Returns a block reason or null.
     */
    @Transactional(readOnly = true)
    public String checkPriceJump(long productId, JsonNode payload) {
        JsonNode priceNode = payload.get("price");
        if (priceNode == null || priceNode.isNull()) {
            return null;
        }
        BigDecimal next = new BigDecimal(priceNode.asString());
        BigDecimal current = jdbc.sql("SELECT base_price FROM products WHERE id = :id")
                .param("id", productId)
                .query(BigDecimal.class)
                .optional()
                .orElse(null);
        if (current == null || current.signum() <= 0 || next.signum() <= 0) {
            return null;
        }
        BigDecimal ratio = next.divide(current, 4, RoundingMode.HALF_UP);
        if (ratio.compareTo(PRICE_UP_FACTOR) > 0 || ratio.compareTo(PRICE_DOWN_FACTOR) < 0) {
            return "Різке змінення ціни: " + current + " → " + next;
        }
        return null;
    }
}

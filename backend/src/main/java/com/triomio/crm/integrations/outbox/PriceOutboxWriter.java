package com.triomio.crm.integrations.outbox;

import com.triomio.crm.catalog.ProductChanged;
import com.triomio.crm.pricing.PriceCalculator;
import com.triomio.crm.pricing.PriceRulesChanged;
import com.triomio.crm.shared.WireLabels;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Enqueues absolute marketplace prices for enabled non-demo channels (docs/backend/08-marketplace-sync.md §3).
 */
@Component
class PriceOutboxWriter {

    private final JdbcClient jdbc;
    private final PriceCalculator prices;

    PriceOutboxWriter(JdbcClient jdbc, PriceCalculator prices) {
        this.jdbc = jdbc;
        this.prices = prices;
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    void onProduct(ProductChanged event) {
        if (!event.priceAffecting()) {
            return;
        }
        enqueueProduct(event.productId());
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    void onRules(PriceRulesChanged event) {
        List<Long> ids =
                jdbc.sql("""
                        SELECT p.id FROM products p
                        JOIN product_channels c ON c.product_id = p.id AND c.marketplace = :mp AND c.enabled
                        WHERE p.status = 'ACTIVE' AND NOT p.is_demo
                        """).param("mp", event.marketplace()).query(Long.class).list();
        for (Long id : ids) {
            enqueueProduct(id);
        }
    }

    private void enqueueProduct(long productId) {
        record Row(
                long id,
                String sku,
                BigDecimal basePrice,
                BigDecimal oldPrice,
                Long categoryId,
                boolean demo,
                String status) {}
        Row product =
                jdbc.sql("""
                        SELECT id, sku, base_price, old_price, category_id, is_demo AS demo, status
                        FROM products WHERE id = :id
                        """).param("id", productId).query(Row.class).optional().orElse(null);
        if (product == null || product.demo() || !"ACTIVE".equals(product.status())) {
            return;
        }
        Map<String, PriceCalculator.MarketplacePrice> mpPrices =
                prices.forProduct(product.basePrice(), product.oldPrice(), product.categoryId(), product.sku());
        List<String> channels =
                jdbc.sql("""
                        SELECT marketplace FROM product_channels WHERE product_id = :id AND enabled
                        """).param("id", productId).query(String.class).list();
        for (String mp : channels) {
            PriceCalculator.MarketplacePrice priced = mpPrices.get(WireLabels.marketplaceWire(mp));
            if (priced == null || priced.price() == null) {
                continue;
            }
            BigDecimal price = new BigDecimal(priced.price().toString());
            jdbc.sql("""
                            INSERT INTO sync_outbox (marketplace, kind, product_id, payload, dedupe_key)
                            VALUES (:mp, 'PRICE', :pid, jsonb_build_object('price', :price::numeric),
                                    :mp || ':PRICE:' || :pid)
                            ON CONFLICT (dedupe_key) WHERE status = 'PENDING'
                            DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
                            """)
                    .param("mp", mp)
                    .param("pid", productId)
                    .param("price", price)
                    .update();
        }
    }
}

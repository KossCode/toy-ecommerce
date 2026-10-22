package com.triomio.crm.inventory;

import com.triomio.crm.inventory.StockChanged.Operation;
import java.util.Optional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Every change is a single atomic UPDATE ... RETURNING, never read-modify-write in Java, so concurrent reservations
 * from the admin, order polling and the site cannot lose updates (docs/backend/04-data-model.md §3).
 */
@Service
public class InventoryService {

    private static final String RETURNING = " RETURNING product_id, total, reserve, available, awaiting";

    private final JdbcClient jdbc;
    private final ApplicationEventPublisher events;

    InventoryService(JdbcClient jdbc, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public Optional<StockLevel> find(long productId) {
        return jdbc.sql("SELECT product_id, total, reserve, available, awaiting FROM stock WHERE product_id = :id")
                .param("id", productId)
                .query(StockLevel.class)
                .optional();
    }

    @Transactional
    public StockLevel reserve(long productId, int qty, String reason) {
        requirePositive(qty);
        StockLevel after = update(
                "UPDATE stock SET reserve = reserve + :qty, updated_at = now() WHERE product_id = :id", productId, qty);
        int before = Math.max(after.total() - (after.reserve() - qty), 0);
        return publish(Operation.RESERVE, qty, before, after, reason);
    }

    @Transactional
    public StockLevel release(long productId, int qty, String reason) {
        requirePositive(qty);
        StockLevel after = update(
                "UPDATE stock SET reserve = reserve - :qty, updated_at = now() WHERE product_id = :id", productId, qty);
        int before = Math.max(after.total() - (after.reserve() + qty), 0);
        return publish(Operation.RELEASE, qty, before, after, reason);
    }

    /** Goods left the warehouse: total and reserve go down by the same amount, so available does not change. */
    @Transactional
    public StockLevel ship(long productId, int qty, String reason) {
        requirePositive(qty);
        StockLevel after = update(
                "UPDATE stock SET total = total - :qty, reserve = reserve - :qty, updated_at = now() WHERE product_id = :id",
                productId,
                qty);
        return publish(Operation.SHIP, qty, after.available(), after, reason);
    }

    @Transactional
    public StockLevel setTotal(long productId, int total, String reason) {
        if (total < 0) {
            throw new IllegalArgumentException("total must be >= 0");
        }
        int before = jdbc.sql("SELECT available FROM stock WHERE product_id = :id FOR UPDATE")
                .param("id", productId)
                .query(Integer.class)
                .optional()
                .orElseThrow(() -> new StockNotFoundException(productId));
        StockLevel after =
                update("UPDATE stock SET total = :qty, updated_at = now() WHERE product_id = :id", productId, total);
        return publish(Operation.SET_TOTAL, total, before, after, reason);
    }

    private StockLevel update(String sql, long productId, int qty) {
        return jdbc.sql(sql + RETURNING)
                .param("id", productId)
                .param("qty", qty)
                .query(StockLevel.class)
                .optional()
                .orElseThrow(() -> new StockNotFoundException(productId));
    }

    private StockLevel publish(Operation operation, int qty, int availableBefore, StockLevel after, String reason) {
        events.publishEvent(new StockChanged(operation, qty, availableBefore, after, reason));
        return after;
    }

    private static void requirePositive(int qty) {
        if (qty <= 0) {
            throw new IllegalArgumentException("qty must be > 0");
        }
    }
}

package com.triomio.crm.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.triomio.crm.TestProducts;
import com.triomio.crm.TestcontainersConfiguration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class InventoryServiceTests {

    @Autowired
    InventoryService inventory;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    TransactionTemplate tx;

    @Test
    void fiftyParallelReservesAreAllCounted() throws Exception {
        long id = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "ACTIVE", false, 20, 0);
        TestProducts.enableChannel(jdbc, id, "PROM", true);
        TestProducts.enableChannel(jdbc, id, "ROZETKA", true);

        CountDownLatch start = new CountDownLatch(1);
        List<Future<StockLevel>> results = new ArrayList<>();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 50; i++) {
                String reason = "TM-" + i;
                results.add(pool.submit(() -> {
                    start.await();
                    return inventory.reserve(id, 1, reason);
                }));
            }
            start.countDown();
            for (Future<StockLevel> result : results) {
                assertThat(result.get().available()).isGreaterThanOrEqualTo(0);
            }
        }

        StockLevel level = inventory.find(id).orElseThrow();
        assertThat(level.reserve()).isEqualTo(50);
        assertThat(level.total()).isEqualTo(20);
        assertThat(level.available()).isZero();

        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE entity_id = :id AND kind = 'STOCK'")
                        .param("id", id)
                        .query(Integer.class)
                        .single())
                .isEqualTo(50);

        List<OutboxRow> outbox = outbox(id);
        assertThat(outbox).extracting(OutboxRow::marketplace).containsExactlyInAnyOrder("PROM", "ROZETKA");
        assertThat(outbox).allSatisfy(row -> {
            assertThat(row.status()).isEqualTo("PENDING");
            assertThat(row.available()).isZero();
        });
    }

    @Test
    void stockChangeAndOutboxRollBackTogether() {
        long id = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "ACTIVE", false, 10, 0);
        TestProducts.enableChannel(jdbc, id, "PROM", true);

        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
                    inventory.reserve(id, 3, "TM-ROLLBACK");
                    assertThat(outbox(id)).hasSize(1);
                    throw new IllegalStateException("simulated failure after the stock change");
                }))
                .isInstanceOf(IllegalStateException.class);

        assertThat(inventory.find(id).orElseThrow().reserve()).isZero();
        assertThat(outbox(id)).isEmpty();
        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE entity_id = :id")
                        .param("id", id)
                        .query(Integer.class)
                        .single())
                .isZero();
    }

    @Test
    void pendingOutboxRowIsCollapsedToLatestValue() {
        long id = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "ACTIVE", false, 10, 0);
        TestProducts.enableChannel(jdbc, id, "EPICENTR", true);

        inventory.reserve(id, 2, "TM-A");
        inventory.reserve(id, 3, "TM-B");
        inventory.release(id, 1, "TM-A");

        assertThat(outbox(id))
                .singleElement()
                .satisfies(row -> assertThat(row.available()).isEqualTo(6));
    }

    @Test
    void demoDraftAndDisabledChannelsNeverReachOutbox() {
        long demo = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "ACTIVE", true, 10, 0);
        TestProducts.enableChannel(jdbc, demo, "PROM", true);
        long draft = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "DRAFT", false, 10, 0);
        TestProducts.enableChannel(jdbc, draft, "PROM", true);
        long disabled = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "ACTIVE", false, 10, 0);
        TestProducts.enableChannel(jdbc, disabled, "PROM", false);

        inventory.reserve(demo, 1, "TM-X");
        inventory.reserve(draft, 1, "TM-X");
        inventory.reserve(disabled, 1, "TM-X");

        assertThat(outbox(demo)).isEmpty();
        assertThat(outbox(draft)).isEmpty();
        assertThat(outbox(disabled)).isEmpty();
    }

    @Test
    void shippingKeepsAvailableAndDoesNotEnqueue() {
        long id = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "ACTIVE", false, 10, 4);
        TestProducts.enableChannel(jdbc, id, "PROM", true);

        StockLevel after = inventory.ship(id, 4, "TM-SHIP");

        assertThat(after.total()).isEqualTo(6);
        assertThat(after.reserve()).isZero();
        assertThat(after.available()).isEqualTo(6);
        assertThat(outbox(id)).isEmpty();
    }

    @Test
    void releasingMoreThanReservedFailsWithoutSideEffects() {
        long id = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "ACTIVE", false, 10, 1);
        TestProducts.enableChannel(jdbc, id, "PROM", true);

        assertThatThrownBy(() -> inventory.release(id, 2, "TM-OVER"))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThat(inventory.find(id).orElseThrow().reserve()).isEqualTo(1);
        assertThat(outbox(id)).isEmpty();
    }

    @Test
    void setTotalWritesAuditWithBeforeAndAfter() {
        long id = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "ACTIVE", false, 10, 2);

        inventory.setTotal(id, 15, "Інвентаризація");

        String message = jdbc.sql("SELECT message FROM audit_log WHERE entity_id = :id")
                .param("id", id)
                .query(String.class)
                .single();
        assertThat(message).isEqualTo("Всього = 15, Інвентаризація (доступно 8 → 13)");
    }

    @Test
    void unknownProductIsReported() {
        assertThatThrownBy(() -> inventory.reserve(-1, 1, "TM-404")).isInstanceOf(StockNotFoundException.class);
    }

    private List<OutboxRow> outbox(long productId) {
        return jdbc.sql("""
                        SELECT marketplace, status, (payload ->> 'available')::int AS available
                        FROM sync_outbox WHERE product_id = :id AND kind = 'STOCK'
                        """).param("id", productId).query(OutboxRow.class).list();
    }

    record OutboxRow(String marketplace, String status, int available) {}
}

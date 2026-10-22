package com.triomio.crm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class SchemaConstraintsTests {

    @Autowired
    JdbcClient jdbc;

    @Test
    void stockCannotGoNegative() {
        long id = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "ACTIVE", false, 2, 1);

        assertThatThrownBy(() -> jdbc.sql("UPDATE stock SET total = total - 3 WHERE product_id = :id")
                        .param("id", id)
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.sql("UPDATE stock SET reserve = reserve - 2 WHERE product_id = :id")
                        .param("id", id)
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void availableIsComputedAndNeverNegative() {
        long id = TestProducts.insert(jdbc, TestProducts.uniqueSku(), "ACTIVE", false, 3, 5);

        Integer available = jdbc.sql("SELECT available FROM stock WHERE product_id = :id")
                .param("id", id)
                .query(Integer.class)
                .single();
        assertThat(available).isZero();
    }

    @Test
    void marketplaceOrderIsUniquePerChannelAndExternalId() {
        insertOrder("TM-T1", "PROM", "777");
        insertOrder("TM-T2", "ROZETKA", "777");

        assertThatThrownBy(() -> insertOrder("TM-T3", "PROM", "777"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void marketplaceOrderNeedsExternalIdButManualDoesNot() {
        insertOrder("TM-T4", "INSTAGRAM", null);
        insertOrder("TM-T5", "INSTAGRAM", null);

        assertThatThrownBy(() -> insertOrder("TM-T6", "EPICENTR", null))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void unknownEnumValuesAreRejected() {
        assertThatThrownBy(() -> TestProducts.insert(jdbc, TestProducts.uniqueSku(), "PUBLISHED", false, 0, 0))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.sql("UPDATE integration_settings SET mode = 'YOLO' WHERE marketplace = 'PROM'")
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void marketplacesStartReadOnly() {
        assertThat(jdbc.sql("SELECT DISTINCT mode FROM integration_settings")
                        .query(String.class)
                        .list())
                .containsExactly("READ_ONLY");
    }

    private void insertOrder(String number, String channel, String externalId) {
        jdbc.sql("""
                        INSERT INTO orders (number, channel, external_id, status, placed_at)
                        VALUES (:number, :channel, :external, 'NEW', now())
                        """)
                .param("number", number)
                .param("channel", channel)
                .param("external", externalId)
                .update();
    }
}

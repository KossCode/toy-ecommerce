package com.triomio.crm.demo;

import static org.assertj.core.api.Assertions.assertThat;

import com.triomio.crm.TestcontainersConfiguration;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

class DemoSeedTests {

    @Nested
    @SpringBootTest
    @ActiveProfiles("local")
    @Import(TestcontainersConfiguration.class)
    class LocalProfile {

        @Autowired
        JdbcClient jdbc;

        @Test
        void loadsMockDataAsDemo() {
            assertThat(count("SELECT count(*) FROM products")).isEqualTo(10);
            assertThat(count("SELECT count(*) FROM products WHERE NOT is_demo")).isZero();
            assertThat(count("SELECT count(*) FROM stock")).isEqualTo(10);
            assertThat(count("SELECT count(*) FROM orders")).isEqualTo(9);
            assertThat(count("SELECT count(*) FROM price_rules")).isEqualTo(5);
            assertThat(count("SELECT count(*) FROM categories")).isEqualTo(14);
            assertThat(count("SELECT count(*) FROM sync_outbox")).isZero();
        }

        @Test
        void keepsStockFromMock() {
            assertThat(jdbc.sql(
                                    "SELECT s.available FROM stock s JOIN products p ON p.id = s.product_id WHERE p.sku = 'TM-10018'")
                            .query(Integer.class)
                            .single())
                    .isEqualTo(17);
        }

        private int count(String sql) {
            return jdbc.sql(sql).query(Integer.class).single();
        }
    }

    @Nested
    @SpringBootTest
    @ActiveProfiles("prod")
    @Import(TestcontainersConfiguration.class)
    class ProdProfile {

        @Autowired
        ApplicationContext context;

        @Autowired
        JdbcClient jdbc;

        @Test
        void hasNoDemoLoaderAndNoDemoData() {
            assertThat(context.getBeanNamesForType(DemoSeedRunner.class)).isEmpty();
            assertThat(jdbc.sql("SELECT count(*) FROM products")
                            .query(Integer.class)
                            .single())
                    .isZero();
        }
    }
}

package com.triomio.crm;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Inserts minimal products straight into the schema for tests that exercise SQL-level behaviour. */
public final class TestProducts {

    private TestProducts() {}

    public static String uniqueSku() {
        return "T-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    public static long insert(JdbcClient jdbc, String sku, String status, boolean demo, int total, int reserve) {
        long id = jdbc.sql("INSERT INTO products (sku, status, is_demo, name_uk) VALUES (:sku, :status, :demo, :sku)"
                        + " RETURNING id")
                .param("sku", sku)
                .param("status", status)
                .param("demo", demo)
                .query(Long.class)
                .single();
        jdbc.sql("INSERT INTO stock (product_id, total, reserve) VALUES (:id, :total, :reserve)")
                .param("id", id)
                .param("total", total)
                .param("reserve", reserve)
                .update();
        return id;
    }

    public static void enableChannel(JdbcClient jdbc, long productId, String marketplace, boolean enabled) {
        jdbc.sql("""
                        INSERT INTO product_channels (product_id, marketplace, enabled, external_id)
                        SELECT id, :marketplace, :enabled, replace(sku, '-', '') FROM products WHERE id = :id
                        """)
                .param("id", productId)
                .param("marketplace", marketplace)
                .param("enabled", enabled)
                .update();
    }
}

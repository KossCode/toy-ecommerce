package com.triomio.crm.integrations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.triomio.crm.TestProducts;
import com.triomio.crm.TestcontainersConfiguration;
import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.auth.Role;
import com.triomio.crm.feeds.FeedXmlBuilder;
import com.triomio.crm.inventory.InventoryService;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = {"app.feeds.include-demo=true", "app.feeds.dirty-poll-ms=3600000"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class MarketplaceSyncTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    InventoryService inventory;

    @Autowired
    FeedXmlBuilder feedXml;

    @Autowired
    FeedDirtyService dirty;

    @Autowired
    TransactionTemplate tx;

    @Test
    void stockChangeEnqueuesStockOutboxAndMarksFeedDirty() {
        String sku = TestProducts.uniqueSku();
        long id = TestProducts.insert(jdbc, sku, "ACTIVE", false, 10, 0);
        TestProducts.enableChannel(jdbc, id, "PROM", true);

        inventory.setTotal(id, 7, "тест");

        assertThat(jdbc.sql("""
                        SELECT (payload ->> 'available')::int FROM sync_outbox
                        WHERE product_id = :id AND kind = 'STOCK' AND marketplace = 'PROM'
                        """).param("id", id).query(Integer.class).single()).isEqualTo(7);
        assertThat(jdbc.sql("SELECT count(*) FROM settings WHERE key = 'feeds.dirty.PROM'")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
    }

    @Test
    void pricePatchEnqueuesPriceOutbox() throws Exception {
        String sku = TestProducts.uniqueSku();
        long id = TestProducts.insert(jdbc, sku, "ACTIVE", false, 5, 0);
        jdbc.sql("UPDATE products SET base_price = 100 WHERE id = :id")
                .param("id", id)
                .update();
        TestProducts.enableChannel(jdbc, id, "ROZETKA", true);

        long userId = jdbc.sql("""
                        INSERT INTO users (email, password_hash, full_name, role, must_change_password)
                        VALUES (:email, 'x', 'O', 'OWNER', false) RETURNING id
                        """)
                .param("email", "sync-owner-" + System.nanoTime() + "@test.local")
                .query(Long.class)
                .single();
        CurrentUser owner = new CurrentUser(userId, "owner@test.local", "O", Role.OWNER, false);
        mvc.perform(patch("/api/products/" + sku)
                        .with(user(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"price\":150}"))
                .andExpect(status().isOk());

        BigDecimal price =
                jdbc.sql("""
                        SELECT (payload ->> 'price')::numeric FROM sync_outbox
                        WHERE product_id = :id AND kind = 'PRICE' AND marketplace = 'ROZETKA'
                        """).param("id", id).query(BigDecimal.class).optional().orElse(null);
        assertThat(price).isNotNull();
        assertThat(price.compareTo(new BigDecimal("150"))).isZero();
    }

    @Test
    void feedXmlUsesCalculatedPriceAndIncludeDemo() throws Exception {
        String sku = TestProducts.uniqueSku();
        long id = TestProducts.insert(jdbc, sku, "ACTIVE", true, 3, 0);
        long brandId = jdbc.sql("INSERT INTO brands (name) VALUES (:name) RETURNING id")
                .param("name", "FeedBrand-" + sku)
                .query(Long.class)
                .single();
        jdbc.sql("""
                        UPDATE products SET base_price = 200, name_uk = 'Demo feed',
                          description_uk = 'Опис <b>CDATA</b>', brand_id = :brand
                        WHERE id = :id
                        """).param("id", id).param("brand", brandId).update();
        String storageKey = "test/" + sku + "/1.jpg";
        jdbc.sql("""
                        INSERT INTO product_images (product_id, storage_key, position, content_type, size_bytes)
                        VALUES (:id, :key, 0, 'image/jpeg', 1024)
                        """).param("id", id).param("key", storageKey).update();
        TestProducts.enableChannel(jdbc, id, "EPICENTR", true);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int items = feedXml.write("EPICENTR", out);
        String xml = out.toString(StandardCharsets.UTF_8);
        assertThat(items).isGreaterThan(0);
        assertThat(xml).contains(sku);
        assertThat(xml).contains("<price>200");
        assertThat(xml).contains("available=\"true\"");
        assertThat(xml).contains("<quantity_in_stock>3</quantity_in_stock>");
        assertThat(xml).contains("<description><![CDATA[Опис <b>CDATA</b>]]></description>");
        assertThat(xml).contains("<picture>");
        assertThat(xml).contains(storageKey);
        assertThat(xml).contains("<vendor>");
    }

    @Test
    void syncProductsListAndPatch() throws Exception {
        String sku = TestProducts.uniqueSku();
        long id = TestProducts.insert(jdbc, sku, "ACTIVE", false, 2, 0);
        TestProducts.enableChannel(jdbc, id, "PROM", false);

        CurrentUser manager = new CurrentUser(1L, "m@test.local", "M", Role.MANAGER, false);
        mvc.perform(get("/api/integrations/prom/products").with(user(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidates[?(@.sku == '%s')]".formatted(sku))
                        .exists());

        mvc.perform(patch("/api/integrations/prom/products")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"sku\":\"%s\",\"enabled\":true}]}".formatted(sku)))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath("$.products[?(@.sku == '%s')]".formatted(sku)).exists());

        assertThat(jdbc.sql("""
                        SELECT enabled FROM product_channels WHERE product_id = :id AND marketplace = 'PROM'
                        """).param("id", id).query(Boolean.class).single()).isTrue();
        assertThat(jdbc.sql("""
                        SELECT count(*) FROM sync_outbox WHERE product_id = :id AND kind = 'STOCK'
                        """).param("id", id).query(Integer.class).single()).isEqualTo(1);

        mvc.perform(patch("/api/integrations/prom/products")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"sku\":\"%s\",\"enabled\":false}]}".formatted(sku)))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath("$.products[?(@.sku == '%s')]".formatted(sku)).doesNotExist());
    }

    @Test
    void markDirtyCanBeClearedAfterBuild() {
        dirty.mark("PROM");
        assertThat(jdbc.sql("SELECT count(*) FROM settings WHERE key = 'feeds.dirty.PROM'")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
        tx.executeWithoutResult(status -> dirty.clear("PROM"));
        assertThat(jdbc.sql("SELECT count(*) FROM settings WHERE key = 'feeds.dirty.PROM'")
                        .query(Integer.class)
                        .single())
                .isZero();
    }
}

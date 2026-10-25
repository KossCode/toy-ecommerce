package com.triomio.crm.integrations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.triomio.crm.TestProducts;
import com.triomio.crm.TestcontainersConfiguration;
import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.auth.Role;
import com.triomio.crm.integrations.mode.IntegrationModeService;
import com.triomio.crm.integrations.mode.WriteMode;
import com.triomio.crm.integrations.outbox.OutboxDispatcher;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "app.integrations.max-mode=DRY_RUN")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class OutboxModeTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    OutboxDispatcher dispatcher;

    @Autowired
    IntegrationModeService modes;

    @Test
    void liveRejectedWhenCeilingIsDryRun() throws Exception {
        CurrentUser owner = new CurrentUser(1L, "owner@test.local", "Owner", Role.OWNER, false);
        mvc.perform(patch("/api/integrations/prom/mode")
                        .with(user(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"LIVE\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MODE_CEILING"));
    }

    @Test
    void dryRunMarksOutboxWithoutHttpWriteSemantics() {
        String sku = TestProducts.uniqueSku();
        long productId = TestProducts.insert(jdbc, sku, "ACTIVE", false, 10, 0);
        TestProducts.enableChannel(jdbc, productId, "PROM", true);
        jdbc.sql("UPDATE integration_settings SET mode = 'DRY_RUN' WHERE marketplace = 'PROM'")
                .update();
        assertThat(modes.effectiveMode("PROM")).isEqualTo(WriteMode.DRY_RUN);

        jdbc.sql("""
                        INSERT INTO sync_outbox (marketplace, kind, product_id, payload, dedupe_key)
                        VALUES ('PROM', 'STOCK', :pid, '{"available": 7}'::jsonb, 'PROM:STOCK:' || :pid)
                        """).param("pid", productId).update();

        int handled = dispatcher.dispatchDue();
        assertThat(handled).isGreaterThanOrEqualTo(1);

        String status =
                jdbc.sql("""
                        SELECT status FROM sync_outbox WHERE product_id = :pid AND kind = 'STOCK'
                        ORDER BY id DESC LIMIT 1
                        """).param("pid", productId).query(String.class).single();
        assertThat(status).isEqualTo("DRY_RUN");

        int dryLogs = jdbc.sql("""
                        SELECT count(*) FROM sync_log
                        WHERE marketplace = 'PROM' AND operation = 'STOCK_DRY_RUN'
                        """).query(Integer.class).single();
        assertThat(dryLogs).isGreaterThanOrEqualTo(1);
    }

    @Test
    void readOnlyBlocksPendingRows() {
        String sku = TestProducts.uniqueSku();
        long productId = TestProducts.insert(jdbc, sku, "ACTIVE", false, 5, 0);
        jdbc.sql("UPDATE integration_settings SET mode = 'READ_ONLY' WHERE marketplace = 'ROZETKA'")
                .update();
        jdbc.sql("""
                        INSERT INTO sync_outbox (marketplace, kind, product_id, payload, dedupe_key)
                        VALUES ('ROZETKA', 'STOCK', :pid, '{"available": 1}'::jsonb, 'ROZETKA:STOCK:' || :pid)
                        """).param("pid", productId).update();

        dispatcher.dispatchDue();

        String status =
                jdbc.sql("""
                        SELECT status FROM sync_outbox WHERE product_id = :pid ORDER BY id DESC LIMIT 1
                        """).param("pid", productId).query(String.class).single();
        assertThat(status).isEqualTo("BLOCKED");
    }
}

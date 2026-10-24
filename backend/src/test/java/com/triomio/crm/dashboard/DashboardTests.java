package com.triomio.crm.dashboard;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.triomio.crm.TestProducts;
import com.triomio.crm.TestcontainersConfiguration;
import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.auth.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class DashboardTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Test
    void metaAndOverviewReflectDatabase() throws Exception {
        String sku = TestProducts.uniqueSku();
        long productId = TestProducts.insert(jdbc, sku, "ACTIVE", false, 3, 0);
        jdbc.sql("UPDATE products SET name_uk = :name WHERE id = :id")
                .param("name", "Тестова іграшка")
                .param("id", productId)
                .update();
        jdbc.sql("""
                        INSERT INTO orders (number, channel, status, placed_at, confirm_deadline_at, customer_name, total)
                        VALUES (:number, 'INSTAGRAM', 'NEW', now(), now() + interval '90 minutes', 'Іван', 100)
                        """).param("number", "TM-DASH-" + System.nanoTime()).update();

        CurrentUser owner = new CurrentUser(1L, "owner@test.local", "Олена Тест", Role.OWNER, false);

        mvc.perform(get("/api/meta").with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.name").value("Олена Тест"))
                .andExpect(jsonPath("$.user.role").value("Власник"))
                .andExpect(jsonPath("$.todayIso").isNotEmpty())
                .andExpect(jsonPath("$.counts.productsTotal").isNumber())
                .andExpect(jsonPath("$.counts.lowStock").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));

        mvc.perform(get("/api/overview").with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.todo", hasSize(org.hamcrest.Matchers.greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$.todo[0].status").value("Нове"))
                .andExpect(jsonPath("$.todo[0].channel").value("Instagram"))
                .andExpect(jsonPath("$.todo[0].actionKind").value("confirm"))
                .andExpect(jsonPath("$.todo[0].urgent").value(true))
                .andExpect(jsonPath("$.integrations", hasSize(3)))
                .andExpect(jsonPath("$.lowStockSample.sku").value(sku))
                .andExpect(
                        jsonPath("$.meta.overview.needConfirm").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));
    }
}

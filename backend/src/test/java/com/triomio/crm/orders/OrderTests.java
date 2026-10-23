package com.triomio.crm.orders;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.triomio.crm.TestProducts;
import com.triomio.crm.TestcontainersConfiguration;
import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.auth.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class OrderTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    JsonMapper json;

    CurrentUser manager;
    String sku;

    @BeforeEach
    void setUp() {
        String email = "order-mgr-" + System.nanoTime() + "@test.local";
        long id = jdbc.sql("""
                        INSERT INTO users (email, password_hash, full_name, role, must_change_password)
                        VALUES (:email, :hash, 'Менеджер', 'MANAGER', false) RETURNING id
                        """)
                .param("email", email)
                .param("hash", encoder.encode("Order-Manager-Pass1"))
                .query(Long.class)
                .single();
        manager = new CurrentUser(id, email, "Менеджер", Role.MANAGER, false);
        sku = TestProducts.uniqueSku();
        long productId = TestProducts.insert(jdbc, sku, "ACTIVE", false, 10, 0);
        jdbc.sql("UPDATE products SET name_uk = 'Тест', base_price = 100 WHERE id = :id")
                .param("id", productId)
                .update();
    }

    @Test
    void createConfirmTtnCancel() throws Exception {
        MvcResult created = mvc.perform(post("/api/orders")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"customerName":"Іван","status":"Нове","items":[{"sku":"%s","qty":2}]}
                                """.formatted(sku)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("Нове"))
                .andExpect(jsonPath("$.items[0].sku").value(sku))
                .andReturn();
        String number = json.readTree(created.getResponse().getContentAsString())
                .get("id")
                .asString();

        Integer reserve = jdbc.sql(
                        "SELECT reserve FROM stock s JOIN products p ON p.id = s.product_id WHERE p.sku = :sku")
                .param("sku", sku)
                .query(Integer.class)
                .single();
        org.assertj.core.api.Assertions.assertThat(reserve).isEqualTo(2);

        mvc.perform(post("/api/orders/" + number + "/confirm")
                        .with(user(manager))
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Підтверджено"));

        mvc.perform(post("/api/orders/" + number + "/ttn").with(user(manager)).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ttn").isNotEmpty())
                .andExpect(jsonPath("$.ttnStatus").value("Створено (мок)"));

        mvc.perform(get("/api/orders/" + number).with(user(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stock[0].available").value(8));

        mvc.perform(post("/api/orders/" + number + "/cancel")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"клієнт відмовився\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Скасовано"));

        reserve = jdbc.sql("SELECT reserve FROM stock s JOIN products p ON p.id = s.product_id WHERE p.sku = :sku")
                .param("sku", sku)
                .query(Integer.class)
                .single();
        org.assertj.core.api.Assertions.assertThat(reserve).isZero();
    }
}

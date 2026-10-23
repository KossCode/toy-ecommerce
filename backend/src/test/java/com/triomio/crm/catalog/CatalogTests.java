package com.triomio.crm.catalog;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
class CatalogTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    JsonMapper json;

    CurrentUser owner;

    @BeforeEach
    void owner() {
        String email = "catalog-owner-" + System.nanoTime() + "@test.local";
        long id = jdbc.sql("""
                        INSERT INTO users (email, password_hash, full_name, role, must_change_password)
                        VALUES (:email, :hash, 'Каталог Власник', 'OWNER', false) RETURNING id
                        """)
                .param("email", email)
                .param("hash", encoder.encode("Catalog-Owner-Pass-1"))
                .query(Long.class)
                .single();
        owner = new CurrentUser(id, email, "Каталог Власник", Role.OWNER, false);
    }

    @Test
    void productsAndCategoriesRoundTrip() throws Exception {
        MvcResult created = mvc.perform(post("/api/products").with(user(owner)).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("Чернетка"))
                .andExpect(jsonPath("$.sku").value(org.hamcrest.Matchers.startsWith("TM-")))
                .andExpect(jsonPath("$.marketplacePrices.rozetka").exists())
                .andReturn();
        String sku = json.readTree(created.getResponse().getContentAsString())
                .get("sku")
                .asString();

        mvc.perform(get("/api/products").with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()", greaterThanOrEqualTo(1)));

        mvc.perform(
                        patch("/api/products/" + sku)
                                .with(user(owner))
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"name\":\"М'яч\",\"brand\":\"LEGO\",\"status\":\"Активний\",\"total\":8,\"price\":199}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("М'яч"))
                .andExpect(jsonPath("$.brand").value("LEGO"))
                .andExpect(jsonPath("$.status").value("Активний"))
                .andExpect(jsonPath("$.total").value(8))
                .andExpect(jsonPath("$.available").value(8))
                .andExpect(jsonPath("$.stockLabel").value("В наявності"))
                .andExpect(jsonPath("$.brandMissing").value(false));

        mvc.perform(get("/api/products/" + sku + "/history").with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.text == 'Створено чернетку товару')].kind")
                        .value("Статус"));

        mvc.perform(post("/api/categories")
                        .with(user(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Тестова категорія\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Тестова категорія"))
                .andExpect(jsonPath("$.id").isNotEmpty());

        mvc.perform(post("/api/categories/refresh-dictionaries")
                        .with(user(owner))
                        .with(csrf()))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.meta.dictionariesUpdatedAt").value(org.hamcrest.Matchers.not("—")));

        mvc.perform(get("/api/categories").with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories.length()", greaterThanOrEqualTo(1)));
    }
}

package com.triomio.crm.integrations;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CredentialsTests {

    @DynamicPropertySource
    static void crypto(DynamicPropertyRegistry registry) {
        // 32 ASCII bytes → Base64 (same shape as local-profile fallback; not a prod secret).
        registry.add(
                "app.crypto.master-key",
                () -> java.util.Base64.getEncoder()
                        .encodeToString(
                                "local-dev-crm-master-key-32byte!".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        registry.add("app.integrations.max-mode", () -> "LIVE");
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    CurrentUser owner;
    CurrentUser manager;

    @BeforeEach
    void users() {
        String oEmail = "cred-owner-" + System.nanoTime() + "@test.local";
        long oid = jdbc.sql("""
                        INSERT INTO users (email, password_hash, full_name, role, must_change_password)
                        VALUES (:email, :hash, 'Cred Owner', 'OWNER', false) RETURNING id
                        """)
                .param("email", oEmail)
                .param("hash", encoder.encode("Cred-Owner-Pass-12"))
                .query(Long.class)
                .single();
        owner = new CurrentUser(oid, oEmail, "Cred Owner", Role.OWNER, false);

        String mEmail = "cred-mgr-" + System.nanoTime() + "@test.local";
        long mid = jdbc.sql("""
                        INSERT INTO users (email, password_hash, full_name, role, must_change_password)
                        VALUES (:email, :hash, 'Cred Mgr', 'MANAGER', false) RETURNING id
                        """)
                .param("email", mEmail)
                .param("hash", encoder.encode("Cred-Manager-Pass12"))
                .query(Long.class)
                .single();
        manager = new CurrentUser(mid, mEmail, "Cred Mgr", Role.MANAGER, false);
    }

    @Test
    void ownerSavesPromTokenMaskedOnly() throws Exception {
        mvc.perform(put("/api/integrations/prom/credentials")
                        .with(user(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"secret-token-9xyz\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenMasked").value("••••9xyz"))
                .andExpect(jsonPath("$.token").doesNotExist());

        mvc.perform(get("/api/integrations").with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.marketplaces[?(@.id=='prom')].connection.tokenMasked")
                        .value(org.hamcrest.Matchers.hasItem("••••9xyz")))
                .andExpect(jsonPath("$..token").doesNotExist());

        String dump = jdbc.sql(
                        "SELECT encode(credentials_ciphertext, 'hex') FROM integration_settings WHERE marketplace = 'PROM'")
                .query(String.class)
                .single();
        org.assertj.core.api.Assertions.assertThat(dump).doesNotContain("secret-token");
    }

    @Test
    void managerCannotSaveCredentials() throws Exception {
        mvc.perform(put("/api/integrations/prom/credentials")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"nope\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void liveRequiresCredentials() throws Exception {
        jdbc.sql("""
                        UPDATE integration_settings
                        SET credentials_ciphertext = NULL, credentials_hint = NULL, credentials_updated_at = NULL
                        WHERE marketplace = 'ROZETKA'
                        """).update();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                                "/api/integrations/rozetka/mode")
                        .with(user(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"LIVE\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CREDENTIALS_REQUIRED"));
    }
}

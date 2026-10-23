package com.triomio.crm.integrations;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
class IntegrationsTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Test
    void listAndRetryFailedOutbox() throws Exception {
        CurrentUser manager = new CurrentUser(1L, "i@test.local", "I", Role.MANAGER, false);
        jdbc.sql("""
                        UPDATE integration_settings SET paused_reason = 'тест' WHERE marketplace = 'EPICENTR'
                        """).update();

        mvc.perform(get("/api/integrations").with(user(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.marketplaces", hasSize(3)))
                .andExpect(jsonPath("$.marketplaces[?(@.id == 'epicentr')].errorBanner.title")
                        .exists());

        mvc.perform(post("/api/integrations/epicentr/retry").with(user(manager)).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("epicentr"))
                .andExpect(jsonPath("$.errorBanner").doesNotExist());
    }
}

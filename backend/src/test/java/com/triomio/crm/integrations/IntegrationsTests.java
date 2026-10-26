package com.triomio.crm.integrations;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.triomio.crm.TestcontainersConfiguration;
import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.auth.Role;
import com.triomio.crm.feeds.FeedsProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
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

    @Autowired
    FeedsProperties feeds;

    @Autowired
    FeedBuildService feedBuild;

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
                        .exists())
                .andExpect(jsonPath("$.marketplaces[0].connection.feedUrl").exists())
                .andExpect(jsonPath("$.marketplaces[0].connection.schedules", hasSize(2)))
                .andExpect(jsonPath("$.marketplaces[0].connection.mode").exists())
                .andExpect(jsonPath("$.marketplaces[0].connection.maxMode").exists());

        mvc.perform(post("/api/integrations/epicentr/retry").with(user(manager)).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("epicentr"))
                .andExpect(jsonPath("$.errorBanner").doesNotExist());
    }

    @Test
    void ownerCanUpdateSchedule() throws Exception {
        CurrentUser owner = new CurrentUser(1L, "owner@test.local", "O", Role.OWNER, false);
        mvc.perform(put("/api/integrations/prom/schedules/orders")
                        .with(user(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"kind":"INTERVAL","everySeconds":120,"enabled":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connection.schedules[?(@.flow == 'orders')].everySeconds")
                        .value(hasItem(120)))
                .andExpect(jsonPath("$.connection.schedules[?(@.flow == 'orders')].label")
                        .value(hasItem("кожні 2 хв")));
    }

    @Test
    void feedUrlServesBuiltXml() throws Exception {
        feedBuild.build("PROM");
        String token = feeds.token();
        mvc.perform(get("/feeds/" + token + "/prom.xml")).andExpect(status().isOk());
        mvc.perform(get("/feeds/wrong-token/prom.xml")).andExpect(status().isNotFound());
    }
}

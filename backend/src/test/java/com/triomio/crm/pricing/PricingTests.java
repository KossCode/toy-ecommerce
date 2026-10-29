package com.triomio.crm.pricing;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PricingTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JsonMapper json;

    @Test
    void createPreviewAndDeleteRule() throws Exception {
        CurrentUser owner = new CurrentUser(1L, "p@test.local", "P", Role.OWNER, false);
        MvcResult created = mvc.perform(
                        post("/api/prices")
                                .with(user(owner))
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"marketplace\":\"prom\",\"scope\":\"default\",\"kind\":\"percent\",\"value\":10,\"rounding\":\"none\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.marketplace").value("prom"))
                .andExpect(jsonPath("$.kind").value("percent"))
                .andReturn();
        String id = json.readTree(created.getResponse().getContentAsString())
                .get("id")
                .asString();

        mvc.perform(post("/api/prices/preview")
                        .with(user(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"marketplace\":\"prom\",\"scope\":\"default\",\"kind\":\"percent\",\"value\":5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").isNumber());

        mvc.perform(get("/api/prices").with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.meta.ruleCount").isNumber());

        mvc.perform(delete("/api/prices/" + id).with(user(owner)).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
    }

    @Test
    void managerCanReadButNotWritePrices() throws Exception {
        CurrentUser manager = new CurrentUser(2L, "mgr@test.local", "M", Role.MANAGER, false);
        mvc.perform(get("/api/prices").with(user(manager))).andExpect(status().isOk());

        mvc.perform(
                        post("/api/prices")
                                .with(user(manager))
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"marketplace\":\"prom\",\"scope\":\"default\",\"kind\":\"percent\",\"value\":10,\"rounding\":\"none\"}"))
                .andExpect(status().isForbidden());
    }
}

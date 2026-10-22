package com.triomio.crm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.quartz.Scheduler;
import org.quartz.SchedulerException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest(properties = "APP_VERSION=9.9.9-test")
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, PlatformTests.TestOnlyController.class})
class PlatformTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    Scheduler scheduler;

    @Test
    void flywayCreatesQuartzSchema() {
        Integer tables = jdbc.sql(
                        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'qrtz\\_%'")
                .query(Integer.class)
                .single();
        assertThat(tables).isEqualTo(11);

        Integer failed = jdbc.sql("SELECT count(*) FROM flyway_schema_history WHERE NOT success")
                .query(Integer.class)
                .single();
        assertThat(failed).isZero();
    }

    @Test
    void quartzUsesPersistentJobStore() throws SchedulerException {
        assertThat(scheduler.getMetaData().isJobStoreSupportsPersistence()).isTrue();
        assertThat(scheduler.getMetaData().isJobStoreClustered()).isFalse();
    }

    @Test
    void healthEndpointsAreUp() throws Exception {
        mvc.perform(get("/healthz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk());
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk());
    }

    @Test
    void infoExposesAppVersion() throws Exception {
        mvc.perform(get("/actuator/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.app.version").value("9.9.9-test"));
    }

    @Test
    void openApiSpecIsServed() throws Exception {
        mvc.perform(get("/api/docs/openapi.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openapi").exists());
    }

    @Test
    void apiRequiresSession() throws Exception {
        mvc.perform(get("/api/does-not-exist"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Потрібен вхід"))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void actuatorBeyondHealthAndInfoIsClosed() throws Exception {
        mvc.perform(get("/actuator/env").with(user("owner").roles("OWNER"))).andExpect(status().isForbidden());
    }

    @Test
    void unknownApiPathIsProblemJson() throws Exception {
        mvc.perform(get("/api/does-not-exist").with(user("manager").roles("MANAGER")))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.title").value("Не знайдено"))
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void validationErrorListsFields() throws Exception {
        mvc.perform(post("/api/_test/echo")
                        .with(user("manager").roles("MANAGER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"basePrice\":-1}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors.length()").value(2))
                .andExpect(jsonPath("$.errors[?(@.field == 'basePrice')]").exists());
    }

    @Test
    void unexpectedErrorHidesInternals() throws Exception {
        mvc.perform(get("/api/_test/boom").with(user("manager").roles("MANAGER")))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"))
                .andExpect(jsonPath("$.traceId").isNotEmpty())
                .andExpect(content().string(not(containsString("secret-internal-detail"))));
    }

    @RestController
    static class TestOnlyController {

        record EchoRequest(@NotBlank String name, @Positive BigDecimal basePrice) {}

        @PostMapping("/api/_test/echo")
        EchoRequest echo(@Valid @RequestBody EchoRequest request) {
            return request;
        }

        @GetMapping("/api/_test/boom")
        void boom() {
            throw new IllegalStateException("secret-internal-detail");
        }
    }
}

package com.triomio.crm.jobs;

import static org.assertj.core.api.Assertions.assertThat;
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
import org.quartz.JobKey;
import org.quartz.Scheduler;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class JobsTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    Scheduler scheduler;

    @Autowired
    JdbcClient jdbc;

    @Test
    void quartzRegistersCatalogJobs() throws Exception {
        assertThat(scheduler.checkExists(JobKey.jobKey(JobNames.ordersPoll("PROM"))))
                .isTrue();
        assertThat(scheduler.checkExists(JobKey.jobKey(JobNames.OUTBOX_DISPATCH)))
                .isTrue();
        assertThat(scheduler.checkExists(JobKey.jobKey(JobNames.HOUSEKEEPING))).isTrue();
    }

    @Test
    void ownerCanTriggerJobAndJobRunsAreWritten() throws Exception {
        CurrentUser owner = new CurrentUser(1L, "owner@test.local", "Owner", Role.OWNER, false);
        int before = jdbc.sql("SELECT count(*) FROM job_runs WHERE job_name = :n")
                .param("n", JobNames.OUTBOX_DISPATCH)
                .query(Integer.class)
                .single();

        mvc.perform(post("/api/jobs/OutboxDispatch/trigger").with(user(owner)).with(csrf()))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.ok").value("true"));

        // Give Quartz a moment to run the fire-and-forget trigger.
        for (int i = 0; i < 40; i++) {
            int after = jdbc.sql("SELECT count(*) FROM job_runs WHERE job_name = :n AND status = 'SUCCESS'")
                    .param("n", JobNames.OUTBOX_DISPATCH)
                    .query(Integer.class)
                    .single();
            if (after > before) {
                return;
            }
            Thread.sleep(100);
        }
        int success = jdbc.sql("SELECT count(*) FROM job_runs WHERE job_name = :n AND status = 'SUCCESS'")
                .param("n", JobNames.OUTBOX_DISPATCH)
                .query(Integer.class)
                .single();
        assertThat(success).isGreaterThan(before);
    }

    @Test
    void managerCannotTriggerJobs() throws Exception {
        CurrentUser manager = new CurrentUser(2L, "m@test.local", "M", Role.MANAGER, false);
        mvc.perform(post("/api/jobs/OutboxDispatch/trigger").with(user(manager)).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/jobs").with(user(manager))).andExpect(status().isForbidden());
    }
}

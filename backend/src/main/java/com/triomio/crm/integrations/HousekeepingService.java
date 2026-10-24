package com.triomio.crm.integrations;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Retention cleanup from docs/backend/07-jobs-quartz.md — 30 days for sync_log, job_runs, DONE outbox. */
@Service
public class HousekeepingService {

    private final JdbcClient jdbc;

    public HousekeepingService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public int cleanup() {
        int n = 0;
        n += jdbc.sql("DELETE FROM sync_log WHERE at < now() - interval '30 days'")
                .update();
        n += jdbc.sql("DELETE FROM job_runs WHERE started_at < now() - interval '30 days'")
                .update();
        n += jdbc.sql("""
                        DELETE FROM sync_outbox
                        WHERE status IN ('DONE', 'DRY_RUN') AND coalesce(processed_at, updated_at) < now() - interval '30 days'
                        """).update();
        n += jdbc.sql("DELETE FROM login_attempts WHERE at < now() - interval '30 days'")
                .update();
        return n;
    }
}

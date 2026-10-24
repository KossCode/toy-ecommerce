package com.triomio.crm.jobs;

import org.quartz.JobExecutionContext;
import org.quartz.JobExecutionException;
import org.quartz.JobListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Writes every Quartz execution into {@code job_runs} (docs/backend/07-jobs-quartz.md §2). */
@Component
public class JobRunListener implements JobListener {

    public static final String KEY_RUN_ID = "jobRunId";

    private final JdbcClient jdbc;

    public JobRunListener(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String getName() {
        return "jobRuns";
    }

    @Override
    public void jobToBeExecuted(JobExecutionContext context) {
        String name = context.getJobDetail().getKey().getName();
        long id = jdbc.sql("""
                        INSERT INTO job_runs (job_name, status) VALUES (:name, 'RUNNING') RETURNING id
                        """).param("name", name).query(Long.class).single();
        context.put(KEY_RUN_ID, id);
    }

    @Override
    public void jobExecutionVetoed(JobExecutionContext context) {
        Object id = context.get(KEY_RUN_ID);
        if (id instanceof Long runId) {
            jdbc.sql("""
                            UPDATE job_runs SET status = 'FAILED', finished_at = now(), error = 'vetoed'
                            WHERE id = :id
                            """).param("id", runId).update();
        }
    }

    @Override
    public void jobWasExecuted(JobExecutionContext context, JobExecutionException jobException) {
        Object id = context.get(KEY_RUN_ID);
        if (!(id instanceof Long runId)) {
            return;
        }
        if (jobException == null) {
            jdbc.sql("""
                            UPDATE job_runs SET status = 'SUCCESS', finished_at = now() WHERE id = :id
                            """).param("id", runId).update();
        } else {
            jdbc.sql("""
                            UPDATE job_runs SET status = 'FAILED', finished_at = now(), error = :err WHERE id = :id
                            """)
                    .param("id", runId)
                    .param("err", jobException.getMessage())
                    .update();
        }
    }
}

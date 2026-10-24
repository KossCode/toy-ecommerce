package com.triomio.crm.jobs;

import com.triomio.crm.integrations.SyncJobsFacade;
import org.quartz.DisallowConcurrentExecution;
import org.quartz.JobExecutionContext;
import org.springframework.scheduling.quartz.QuartzJobBean;
import org.springframework.stereotype.Component;

@Component
@DisallowConcurrentExecution
public class OutboxDispatchJob extends QuartzJobBean {

    private final SyncJobsFacade sync;

    public OutboxDispatchJob(SyncJobsFacade sync) {
        this.sync = sync;
    }

    @Override
    protected void executeInternal(JobExecutionContext context) {
        sync.dispatchOutbox();
    }
}

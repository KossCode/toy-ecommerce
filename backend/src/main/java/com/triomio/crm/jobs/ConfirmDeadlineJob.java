package com.triomio.crm.jobs;

import com.triomio.crm.integrations.SyncJobsFacade;
import org.quartz.DisallowConcurrentExecution;
import org.quartz.JobExecutionContext;
import org.springframework.scheduling.quartz.QuartzJobBean;
import org.springframework.stereotype.Component;

@Component
@DisallowConcurrentExecution
public class ConfirmDeadlineJob extends QuartzJobBean {

    private final SyncJobsFacade sync;

    public ConfirmDeadlineJob(SyncJobsFacade sync) {
        this.sync = sync;
    }

    @Override
    protected void executeInternal(JobExecutionContext context) {
        sync.scanConfirmDeadlines();
    }
}

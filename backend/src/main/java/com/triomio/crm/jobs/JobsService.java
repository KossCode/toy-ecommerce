package com.triomio.crm.jobs;

import com.triomio.crm.shared.ApiProblemException;
import java.util.Map;
import org.quartz.JobKey;
import org.quartz.Scheduler;
import org.quartz.SchedulerException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class JobsService {

    private final Scheduler scheduler;

    public JobsService(Scheduler scheduler) {
        this.scheduler = scheduler;
    }

    public void trigger(String logicalName) {
        String jobName = JobNames.triggersByName().get(logicalName);
        if (jobName == null) {
            throw new ApiProblemException(
                    HttpStatus.NOT_FOUND,
                    "JOB_NOT_FOUND",
                    "Невідома джоба. Доступні: "
                            + String.join(", ", JobNames.triggersByName().keySet()));
        }
        try {
            scheduler.triggerJob(JobKey.jobKey(jobName));
        } catch (SchedulerException e) {
            throw new ApiProblemException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "JOB_TRIGGER_FAILED", "Не вдалося запустити джобу");
        }
    }

    public Map<String, String> catalog() {
        return JobNames.triggersByName();
    }
}

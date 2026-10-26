package com.triomio.crm.integrations.schedule;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Applies {@code job_schedules} to Quartz after JobDetails are registered. */
@Component
class JobScheduleBootstrap {

    private static final Logger log = LoggerFactory.getLogger(JobScheduleBootstrap.class);

    private final JobScheduleService schedules;

    JobScheduleBootstrap(JobScheduleService schedules) {
        this.schedules = schedules;
    }

    @EventListener(ApplicationReadyEvent.class)
    void onReady() {
        schedules.applyAllFromDatabase();
        log.info("Applied owner-managed job schedules from database");
    }
}

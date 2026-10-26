package com.triomio.crm.jobs;

import org.quartz.CronScheduleBuilder;
import org.quartz.JobBuilder;
import org.quartz.JobDetail;
import org.quartz.SimpleScheduleBuilder;
import org.quartz.Trigger;
import org.quartz.TriggerBuilder;
import org.springframework.boot.quartz.autoconfigure.SchedulerFactoryBeanCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers durable JobDetails. System job triggers come from beans; owner-managed orders/feed triggers are applied
 * from {@code job_schedules} via integrations schedule bootstrap (not Trigger beans here).
 */
@Configuration(proxyBeanMethods = false)
class QuartzJobsConfig {

    private static final String KYIV = "Europe/Kyiv";

    @Bean
    SchedulerFactoryBeanCustomizer jobRunListenerCustomizer(JobRunListener listener) {
        return factory -> factory.setGlobalJobListeners(listener);
    }

    @Bean
    JobDetail promOrdersPollJobDetail() {
        return ordersPollDetail("PROM");
    }

    @Bean
    JobDetail rozetkaOrdersPollJobDetail() {
        return ordersPollDetail("ROZETKA");
    }

    @Bean
    JobDetail epicentrOrdersPollJobDetail() {
        return ordersPollDetail("EPICENTR");
    }

    @Bean
    JobDetail promFeedBuildJobDetail() {
        return feedBuildDetail("PROM");
    }

    @Bean
    JobDetail rozetkaFeedBuildJobDetail() {
        return feedBuildDetail("ROZETKA");
    }

    @Bean
    JobDetail epicentrFeedBuildJobDetail() {
        return feedBuildDetail("EPICENTR");
    }

    @Bean
    JobDetail outboxDispatchJobDetail() {
        return JobBuilder.newJob(OutboxDispatchJob.class)
                .withIdentity(JobNames.OUTBOX_DISPATCH)
                .storeDurably()
                .build();
    }

    @Bean
    Trigger outboxDispatchTrigger(JobDetail outboxDispatchJobDetail) {
        return simpleEverySeconds(outboxDispatchJobDetail, JobNames.OUTBOX_DISPATCH, 15);
    }

    @Bean
    JobDetail confirmDeadlineJobDetail() {
        return JobBuilder.newJob(ConfirmDeadlineJob.class)
                .withIdentity(JobNames.CONFIRM_DEADLINE)
                .storeDurably()
                .build();
    }

    @Bean
    Trigger confirmDeadlineTrigger(JobDetail confirmDeadlineJobDetail) {
        return simpleEverySeconds(confirmDeadlineJobDetail, JobNames.CONFIRM_DEADLINE, 60);
    }

    @Bean
    JobDetail reconcileJobDetail() {
        return JobBuilder.newJob(ReconcileJob.class)
                .withIdentity(JobNames.RECONCILE)
                .storeDurably()
                .build();
    }

    @Bean
    Trigger reconcileTrigger(JobDetail reconcileJobDetail) {
        return cron(reconcileJobDetail, JobNames.RECONCILE, "0 30 3 * * ?");
    }

    @Bean
    JobDetail dictionariesRefreshJobDetail() {
        return JobBuilder.newJob(DictionariesRefreshJob.class)
                .withIdentity(JobNames.DICTIONARIES_REFRESH)
                .storeDurably()
                .build();
    }

    @Bean
    Trigger dictionariesRefreshTrigger(JobDetail dictionariesRefreshJobDetail) {
        return cron(dictionariesRefreshJobDetail, JobNames.DICTIONARIES_REFRESH, "0 0 4 ? * SUN");
    }

    @Bean
    JobDetail housekeepingJobDetail() {
        return JobBuilder.newJob(HousekeepingJob.class)
                .withIdentity(JobNames.HOUSEKEEPING)
                .storeDurably()
                .build();
    }

    @Bean
    Trigger housekeepingTrigger(JobDetail housekeepingJobDetail) {
        return cron(housekeepingJobDetail, JobNames.HOUSEKEEPING, "0 30 4 * * ?");
    }

    private static JobDetail ordersPollDetail(String marketplace) {
        return JobBuilder.newJob(OrdersPollJob.class)
                .withIdentity(JobNames.ordersPoll(marketplace))
                .usingJobData("marketplace", marketplace)
                .storeDurably()
                .build();
    }

    private static JobDetail feedBuildDetail(String marketplace) {
        return JobBuilder.newJob(FeedBuildJob.class)
                .withIdentity(JobNames.feedBuild(marketplace))
                .usingJobData("marketplace", marketplace)
                .storeDurably()
                .build();
    }

    private static Trigger simpleEverySeconds(JobDetail job, String name, int seconds) {
        return TriggerBuilder.newTrigger()
                .forJob(job)
                .withIdentity(name + ".trigger")
                .withSchedule(SimpleScheduleBuilder.simpleSchedule()
                        .withIntervalInSeconds(seconds)
                        .repeatForever()
                        .withMisfireHandlingInstructionNextWithRemainingCount())
                .startNow()
                .build();
    }

    private static Trigger cron(JobDetail job, String name, String expression) {
        return TriggerBuilder.newTrigger()
                .forJob(job)
                .withIdentity(name + ".trigger")
                .withSchedule(CronScheduleBuilder.cronSchedule(expression)
                        .inTimeZone(java.util.TimeZone.getTimeZone(KYIV))
                        .withMisfireHandlingInstructionDoNothing())
                .build();
    }
}

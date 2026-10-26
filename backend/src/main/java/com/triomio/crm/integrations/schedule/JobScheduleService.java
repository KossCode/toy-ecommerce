package com.triomio.crm.integrations.schedule;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.shared.ApiProblemException;
import com.triomio.crm.shared.WireLabels;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.stream.Collectors;
import org.quartz.CronScheduleBuilder;
import org.quartz.JobKey;
import org.quartz.Scheduler;
import org.quartz.SchedulerException;
import org.quartz.SimpleScheduleBuilder;
import org.quartz.Trigger;
import org.quartz.TriggerBuilder;
import org.quartz.TriggerKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Owner-managed orders/feed schedules. Quartz JobDetails live in the {@code jobs} module; trigger
 * identities match {@code job_schedules.job_key + ".trigger"} and are applied from the DB only.
 */
@Service
public class JobScheduleService {

    private static final Logger log = LoggerFactory.getLogger(JobScheduleService.class);
    private static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");
    private static final int MIN_ORDERS_SECONDS = 90;
    private static final int MIN_FEED_SECONDS = 15 * 60;

    private final JdbcClient jdbc;
    private final Scheduler scheduler;
    private final JsonMapper json;

    public JobScheduleService(JdbcClient jdbc, Scheduler scheduler, JsonMapper json) {
        this.jdbc = jdbc;
        this.scheduler = scheduler;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> schedulesForMarketplace(String marketplace) {
        return jdbc.sql("""
                        SELECT job_key, flow, kind, payload::text AS payload, enabled
                        FROM job_schedules WHERE marketplace = :mp ORDER BY flow
                        """)
                .param("mp", marketplace)
                .query((rs, i) -> toView(
                        rs.getString("job_key"),
                        rs.getString("flow"),
                        rs.getString("kind"),
                        rs.getString("payload"),
                        rs.getBoolean("enabled")))
                .list();
    }

    @Transactional
    public Map<String, Object> update(
            CurrentUser actor, String marketplaceWire, String flow, Map<String, Object> body) {
        String marketplace = WireLabels.marketplaceCode(marketplaceWire);
        if (!Set.of("PROM", "ROZETKA", "EPICENTR").contains(marketplace)) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "INTEGRATION_NOT_FOUND", "Площадку не знайдено");
        }
        if (!Set.of("orders", "feed").contains(flow)) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "UNKNOWN_FLOW", "Невідомий потік розкладу");
        }
        String jobKey = jobKey(marketplace, flow);
        SchedulePayload payload = parseAndValidate(flow, body);
        boolean enabled = body.get("enabled") instanceof Boolean b ? b : true;
        String payloadJson = payload.kind() == ScheduleKind.INTERVAL
                ? json.writeValueAsString(Map.of("everySeconds", payload.everySeconds()))
                : json.writeValueAsString(Map.of(
                        "daysOfWeek", payload.daysOfWeek(),
                        "hour", payload.hour(),
                        "minute", payload.minute()));

        int updated = jdbc.sql("""
                        UPDATE job_schedules
                        SET kind = :kind, payload = :payload::jsonb, enabled = :enabled,
                            updated_at = now(), updated_by = :actor
                        WHERE job_key = :key
                        """)
                .param("kind", payload.kind().name())
                .param("payload", payloadJson)
                .param("enabled", enabled)
                .param("actor", actor.id())
                .param("key", jobKey)
                .update();
        if (updated == 0) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "SCHEDULE_NOT_FOUND", "Розклад не знайдено");
        }
        applyTrigger(jobKey, flow, payload, enabled);
        return toView(jobKey, flow, payload.kind().name(), payloadJson, enabled);
    }

    /** Apply every row in job_schedules to the running Quartz scheduler. */
    public void applyAllFromDatabase() {
        List<Map<String, Object>> rows = jdbc.sql("""
                        SELECT job_key, flow, kind, payload::text AS payload, enabled FROM job_schedules
                        """)
                .query((rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("jobKey", rs.getString("job_key"));
                    m.put("flow", rs.getString("flow"));
                    m.put("kind", rs.getString("kind"));
                    m.put("payload", rs.getString("payload"));
                    m.put("enabled", rs.getBoolean("enabled"));
                    return m;
                })
                .list();
        for (Map<String, Object> row : rows) {
            try {
                SchedulePayload payload =
                        fromStored((String) row.get("kind"), (String) row.get("payload"), (String) row.get("flow"));
                applyTrigger(
                        (String) row.get("jobKey"), (String) row.get("flow"), payload, (Boolean) row.get("enabled"));
            } catch (RuntimeException ex) {
                log.error("Failed to apply schedule {}: {}", row.get("jobKey"), ex.toString());
            }
        }
    }

    public String triggerNameForFlow(String marketplace, String flow) {
        return switch (flow) {
            case "orders" -> "OrdersPoll." + marketplace;
            case "feed" -> "FeedBuild." + marketplace;
            default -> throw new ApiProblemException(HttpStatus.BAD_REQUEST, "UNKNOWN_FLOW", "Невідомий потік");
        };
    }

    private void applyTrigger(String jobKey, String flow, SchedulePayload payload, boolean enabled) {
        TriggerKey triggerKey = TriggerKey.triggerKey(jobKey + ".trigger");
        JobKey jobQuartzKey = JobKey.jobKey(jobKey);
        try {
            if (!scheduler.checkExists(jobQuartzKey)) {
                throw new ApiProblemException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "JOB_MISSING", "Quartz job " + jobKey + " не зареєстровано");
            }
            if (!enabled) {
                if (scheduler.checkExists(triggerKey)) {
                    scheduler.unscheduleJob(triggerKey);
                }
                return;
            }
            Trigger trigger = buildTrigger(jobKey, flow, payload);
            if (scheduler.checkExists(triggerKey)) {
                scheduler.rescheduleJob(triggerKey, trigger);
            } else {
                scheduler.scheduleJob(trigger);
            }
        } catch (SchedulerException e) {
            throw new ApiProblemException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "SCHEDULE_APPLY_FAILED", "Не вдалося оновити розклад Quartz");
        }
    }

    private Trigger buildTrigger(String jobKey, String flow, SchedulePayload payload) {
        JobKey jobQuartzKey = JobKey.jobKey(jobKey);
        TriggerBuilder<Trigger> base = TriggerBuilder.newTrigger()
                .forJob(jobQuartzKey)
                .withIdentity(jobKey + ".trigger")
                .startNow();
        if (payload.kind() == ScheduleKind.INTERVAL) {
            int seconds = payload.everySeconds() == null ? minSeconds(flow) : payload.everySeconds();
            return base.withSchedule(SimpleScheduleBuilder.simpleSchedule()
                            .withIntervalInSeconds(seconds)
                            .repeatForever()
                            .withMisfireHandlingInstructionNextWithRemainingCount())
                    .build();
        }
        String cron = toCron(payload);
        return base.withSchedule(CronScheduleBuilder.cronSchedule(cron)
                        .inTimeZone(TimeZone.getTimeZone(KYIV))
                        .withMisfireHandlingInstructionDoNothing())
                .build();
    }

    private static String toCron(SchedulePayload payload) {
        int hour = payload.hour() == null ? 0 : payload.hour();
        int minute = payload.minute() == null ? 0 : payload.minute();
        List<Integer> days =
                payload.daysOfWeek() == null || payload.daysOfWeek().isEmpty()
                        ? List.of(1, 2, 3, 4, 5, 6, 7)
                        : payload.daysOfWeek();
        // Quartz: 1=Sun … 7=Sat. Our UI: 1=Mon … 7=Sun.
        String quartzDays =
                days.stream().map(d -> d == 7 ? "1" : String.valueOf(d + 1)).collect(Collectors.joining(","));
        return String.format(Locale.ROOT, "0 %d %d ? * %s", minute, hour, quartzDays);
    }

    private SchedulePayload parseAndValidate(String flow, Map<String, Object> body) {
        String kindRaw = String.valueOf(body.getOrDefault("kind", "INTERVAL")).toUpperCase(Locale.ROOT);
        ScheduleKind kind;
        try {
            kind = ScheduleKind.valueOf(kindRaw);
        } catch (IllegalArgumentException e) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "kind = INTERVAL або CALENDAR");
        }
        if (kind == ScheduleKind.INTERVAL) {
            int every = asInt(body.get("everySeconds"), minSeconds(flow));
            if (every < minSeconds(flow)) {
                throw new ApiProblemException(
                        HttpStatus.BAD_REQUEST,
                        "SCHEDULE_TOO_FREQUENT",
                        "Мінімальний інтервал для цього потоку — " + minSeconds(flow) + " с");
            }
            return SchedulePayload.interval(every);
        }
        List<Integer> days = asIntList(body.get("daysOfWeek"));
        if (days.isEmpty()) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "Оберіть хоча б один день");
        }
        for (Integer d : days) {
            if (d == null || d < 1 || d > 7) {
                throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "Дні тижня 1–7 (Пн–Нд)");
            }
        }
        int hour = asInt(body.get("hour"), 0);
        int minute = asInt(body.get("minute"), 0);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "Некоректний час");
        }
        return SchedulePayload.calendar(days, hour, minute);
    }

    private SchedulePayload fromStored(String kind, String payloadJson, String flow) {
        JsonNode node = json.readTree(payloadJson);
        if ("INTERVAL".equals(kind)) {
            int every = node.path("everySeconds").asInt(minSeconds(flow));
            return SchedulePayload.interval(Math.max(every, minSeconds(flow)));
        }
        List<Integer> days = new ArrayList<>();
        JsonNode arr = node.get("daysOfWeek");
        if (arr != null && arr.isArray()) {
            arr.forEach(n -> days.add(n.asInt()));
        }
        if (days.isEmpty()) {
            days.addAll(List.of(1, 2, 3, 4, 5, 6, 7));
        }
        return SchedulePayload.calendar(
                days, node.path("hour").asInt(0), node.path("minute").asInt(0));
    }

    private Map<String, Object> toView(String jobKey, String flow, String kind, String payloadJson, boolean enabled) {
        SchedulePayload payload = fromStored(kind, payloadJson, flow);
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("jobKey", jobKey);
        view.put("flow", flow);
        view.put("kind", payload.kind().name());
        view.put("enabled", enabled);
        view.put("label", humanLabel(flow, payload, enabled));
        view.put("triggerName", triggerNameForFlow(jobKey.split("\\.")[0], flow));
        if (payload.kind() == ScheduleKind.INTERVAL) {
            view.put("everySeconds", payload.everySeconds());
        } else {
            view.put("daysOfWeek", payload.daysOfWeek());
            view.put("hour", payload.hour());
            view.put("minute", payload.minute());
        }
        return view;
    }

    static String humanLabel(String flow, SchedulePayload payload, boolean enabled) {
        if (!enabled) {
            return "вимкнено";
        }
        if (payload.kind() == ScheduleKind.INTERVAL) {
            int s = payload.everySeconds() == null ? 0 : payload.everySeconds();
            if (s % 3600 == 0) {
                int h = s / 3600;
                return "кожні " + h + " год";
            }
            if (s % 60 == 0) {
                int m = s / 60;
                return "кожні " + m + " хв";
            }
            return "кожні " + s + " с";
        }
        String days = formatDays(payload.daysOfWeek());
        return days + " о " + String.format(Locale.ROOT, "%02d:%02d", payload.hour(), payload.minute());
    }

    private static String formatDays(List<Integer> days) {
        if (days == null || days.size() == 7) {
            return "щодня";
        }
        if (days.equals(List.of(1, 2, 3, 4, 5))) {
            return "Пн–Пт";
        }
        String[] names = {"Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"};
        return days.stream().map(d -> names[d - 1]).collect(Collectors.joining(", "));
    }

    private static String jobKey(String marketplace, String flow) {
        return "orders".equals(flow) ? marketplace + ".OrdersPoll" : marketplace + ".FeedBuild";
    }

    private static int minSeconds(String flow) {
        return "feed".equals(flow) ? MIN_FEED_SECONDS : MIN_ORDERS_SECONDS;
    }

    private static int asInt(Object v, int fallback) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        if (v == null) {
            return fallback;
        }
        return Integer.parseInt(String.valueOf(v));
    }

    private static List<Integer> asIntList(Object v) {
        if (!(v instanceof List<?> list)) {
            return List.of();
        }
        List<Integer> out = new ArrayList<>();
        for (Object o : list) {
            out.add(asInt(o, 0));
        }
        return out;
    }
}

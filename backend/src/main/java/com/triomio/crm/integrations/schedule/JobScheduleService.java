package com.triomio.crm.integrations.schedule;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.shared.ApiProblemException;
import com.triomio.crm.shared.WireLabels;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Calendar;
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
import org.quartz.impl.calendar.BaseCalendar;
import org.quartz.impl.calendar.DailyCalendar;
import org.quartz.impl.calendar.WeeklyCalendar;
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
    private static final TimeZone KYIV_TZ = TimeZone.getTimeZone(KYIV);
    private static final int MIN_ORDERS_SECONDS = 90;
    private static final int MIN_FEED_SECONDS = 15 * 60;
    private static final List<Integer> ALL_DAYS = List.of(1, 2, 3, 4, 5, 6, 7);

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
        String payloadJson = toPayloadJson(payload);

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
        String calName = jobKey + ".cal";
        try {
            if (!scheduler.checkExists(jobQuartzKey)) {
                throw new ApiProblemException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "JOB_MISSING", "Quartz job " + jobKey + " не зареєстровано");
            }
            if (!enabled) {
                if (scheduler.checkExists(triggerKey)) {
                    scheduler.unscheduleJob(triggerKey);
                }
                safeDeleteCalendar(calName);
                return;
            }
            Trigger trigger = buildTrigger(jobKey, flow, payload, calName);
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

    private Trigger buildTrigger(String jobKey, String flow, SchedulePayload payload, String calName)
            throws SchedulerException {
        JobKey jobQuartzKey = JobKey.jobKey(jobKey);
        TriggerBuilder<Trigger> base = TriggerBuilder.newTrigger()
                .forJob(jobQuartzKey)
                .withIdentity(jobKey + ".trigger")
                .startNow();

        org.quartz.Calendar restriction = buildRestrictionCalendar(payload);
        if (restriction != null) {
            scheduler.addCalendar(calName, restriction, true, true);
            base.modifiedByCalendar(calName);
        } else {
            safeDeleteCalendar(calName);
        }

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
                        .inTimeZone(KYIV_TZ)
                        .withMisfireHandlingInstructionDoNothing())
                .build();
    }

    /** Quartz calendar that excludes non-selected weekdays and/or hours outside the window. */
    private static org.quartz.Calendar buildRestrictionCalendar(SchedulePayload payload) {
        boolean days = payload.hasDayFilter();
        boolean window = payload.kind() == ScheduleKind.INTERVAL && payload.hasTimeWindow();
        if (!days && !window) {
            return null;
        }

        WeeklyCalendar weekly = null;
        if (days) {
            weekly = new WeeklyCalendar();
            weekly.setTimeZone(KYIV_TZ);
            Set<Integer> allowed = Set.copyOf(payload.daysOfWeek());
            for (int uiDay = 1; uiDay <= 7; uiDay++) {
                if (!allowed.contains(uiDay)) {
                    weekly.setDayExcluded(uiDayToJavaCalendar(uiDay), true);
                }
            }
        }

        DailyCalendar daily = null;
        if (window) {
            String start =
                    String.format(Locale.ROOT, "%02d:%02d:00", payload.windowStartHour(), payload.windowStartMinute());
            String end = String.format(Locale.ROOT, "%02d:%02d:00", payload.windowEndHour(), payload.windowEndMinute());
            daily = new DailyCalendar(start, end);
            daily.setInvertTimeRange(true); // fire only inside the range
            daily.setTimeZone(KYIV_TZ);
        }

        if (weekly != null && daily != null) {
            return new AndCalendar(weekly, daily);
        }
        return weekly != null ? weekly : daily;
    }

    /** Calendar that is included only when both bases include the time. */
    private static final class AndCalendar extends BaseCalendar {
        private final org.quartz.Calendar a;
        private final org.quartz.Calendar b;

        AndCalendar(org.quartz.Calendar a, org.quartz.Calendar b) {
            this.a = a;
            this.b = b;
            setTimeZone(KYIV_TZ);
        }

        @Override
        public boolean isTimeIncluded(long timeStamp) {
            return a.isTimeIncluded(timeStamp) && b.isTimeIncluded(timeStamp);
        }

        @Override
        public long getNextIncludedTime(long timeStamp) {
            long t = timeStamp;
            for (int i = 0; i < 10_000; i++) {
                long na = a.getNextIncludedTime(t);
                long nb = b.getNextIncludedTime(t);
                if (na == t && nb == t) {
                    return t;
                }
                if (na < 0 || nb < 0) {
                    return -1;
                }
                long next = Math.max(na, nb);
                if (a.isTimeIncluded(next) && b.isTimeIncluded(next)) {
                    return next;
                }
                t = next;
            }
            return -1;
        }
    }

    private void safeDeleteCalendar(String calName) {
        try {
            scheduler.deleteCalendar(calName);
        } catch (SchedulerException ignored) {
            // absent is fine
        }
    }

    /** UI 1=Mon … 7=Sun → {@link Calendar} constants. */
    private static int uiDayToJavaCalendar(int uiDay) {
        return switch (uiDay) {
            case 1 -> Calendar.MONDAY;
            case 2 -> Calendar.TUESDAY;
            case 3 -> Calendar.WEDNESDAY;
            case 4 -> Calendar.THURSDAY;
            case 5 -> Calendar.FRIDAY;
            case 6 -> Calendar.SATURDAY;
            case 7 -> Calendar.SUNDAY;
            default -> throw new IllegalArgumentException("day " + uiDay);
        };
    }

    private static String toCron(SchedulePayload payload) {
        int hour = payload.hour() == null ? 0 : payload.hour();
        int minute = payload.minute() == null ? 0 : payload.minute();
        List<Integer> days =
                payload.daysOfWeek() == null || payload.daysOfWeek().isEmpty() ? ALL_DAYS : payload.daysOfWeek();
        // Quartz: 1=Sun … 7=Sat. Our UI: 1=Mon … 7=Sun.
        String quartzDays =
                days.stream().map(d -> d == 7 ? "1" : String.valueOf(d + 1)).collect(Collectors.joining(","));
        return String.format(Locale.ROOT, "0 %d %d ? * %s", minute, hour, quartzDays);
    }

    private String toPayloadJson(SchedulePayload payload) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (payload.kind() == ScheduleKind.INTERVAL) {
            map.put("everySeconds", payload.everySeconds());
            map.put("daysOfWeek", payload.daysOfWeek());
            if (payload.hasTimeWindow()) {
                map.put(
                        "windowStart",
                        String.format(
                                Locale.ROOT, "%02d:%02d", payload.windowStartHour(), payload.windowStartMinute()));
                map.put(
                        "windowEnd",
                        String.format(Locale.ROOT, "%02d:%02d", payload.windowEndHour(), payload.windowEndMinute()));
            }
        } else {
            map.put("daysOfWeek", payload.daysOfWeek());
            map.put("hour", payload.hour());
            map.put("minute", payload.minute());
        }
        return json.writeValueAsString(map);
    }

    private SchedulePayload parseAndValidate(String flow, Map<String, Object> body) {
        String kindRaw = String.valueOf(body.getOrDefault("kind", "INTERVAL")).toUpperCase(Locale.ROOT);
        ScheduleKind kind;
        try {
            kind = ScheduleKind.valueOf(kindRaw);
        } catch (IllegalArgumentException e) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "kind = INTERVAL або CALENDAR");
        }
        List<Integer> days = normalizeDays(asIntList(body.get("daysOfWeek")));
        if (kind == ScheduleKind.INTERVAL) {
            int every = asInt(body.get("everySeconds"), minSeconds(flow));
            if (every < minSeconds(flow)) {
                throw new ApiProblemException(
                        HttpStatus.BAD_REQUEST,
                        "SCHEDULE_TOO_FREQUENT",
                        "Мінімальний інтервал для цього потоку — " + minSeconds(flow) + " с");
            }
            Integer[] window = parseWindow(body);
            return SchedulePayload.interval(every, days, window[0], window[1], window[2], window[3]);
        }
        int hour = asInt(body.get("hour"), 0);
        int minute = asInt(body.get("minute"), 0);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "Некоректний час");
        }
        return SchedulePayload.calendar(days, hour, minute);
    }

    private Integer[] parseWindow(Map<String, Object> body) {
        Object startRaw = body.get("windowStart");
        Object endRaw = body.get("windowEnd");
        if (startRaw == null && endRaw == null) {
            // also accept nested hour fields
            if (body.get("windowStartHour") == null) {
                return new Integer[] {null, null, null, null};
            }
            int sh = asInt(body.get("windowStartHour"), 0);
            int sm = asInt(body.get("windowStartMinute"), 0);
            int eh = asInt(body.get("windowEndHour"), 0);
            int em = asInt(body.get("windowEndMinute"), 0);
            validateWindow(sh, sm, eh, em);
            return new Integer[] {sh, sm, eh, em};
        }
        if (startRaw == null || endRaw == null) {
            throw new ApiProblemException(
                    HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "Вкажіть і початок, і кінець проміжку");
        }
        int[] start = parseHm(String.valueOf(startRaw));
        int[] end = parseHm(String.valueOf(endRaw));
        validateWindow(start[0], start[1], end[0], end[1]);
        return new Integer[] {start[0], start[1], end[0], end[1]};
    }

    private static void validateWindow(int sh, int sm, int eh, int em) {
        if (sh < 0 || sh > 23 || eh < 0 || eh > 23 || sm < 0 || sm > 59 || em < 0 || em > 59) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "Некоректний проміжок часу");
        }
        int start = sh * 60 + sm;
        int end = eh * 60 + em;
        if (end <= start) {
            throw new ApiProblemException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_SCHEDULE",
                    "Кінець проміжку має бути пізніше за початок (в межах однієї доби)");
        }
    }

    private static int[] parseHm(String raw) {
        String[] parts = raw.trim().split(":");
        if (parts.length < 2) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "Час у форматі HH:mm");
        }
        try {
            return new int[] {Integer.parseInt(parts[0]), Integer.parseInt(parts[1])};
        } catch (NumberFormatException e) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "Час у форматі HH:mm");
        }
    }

    private List<Integer> normalizeDays(List<Integer> days) {
        if (days.isEmpty()) {
            return ALL_DAYS;
        }
        for (Integer d : days) {
            if (d == null || d < 1 || d > 7) {
                throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE", "Дні тижня 1–7 (Пн–Нд)");
            }
        }
        return days.stream().distinct().sorted().toList();
    }

    private SchedulePayload fromStored(String kind, String payloadJson, String flow) {
        JsonNode node = json.readTree(payloadJson);
        List<Integer> days = readDays(node);
        if ("INTERVAL".equals(kind)) {
            int every = Math.max(node.path("everySeconds").asInt(minSeconds(flow)), minSeconds(flow));
            Integer[] window = readWindow(node);
            return SchedulePayload.interval(every, days, window[0], window[1], window[2], window[3]);
        }
        return SchedulePayload.calendar(
                days, node.path("hour").asInt(0), node.path("minute").asInt(0));
    }

    private static List<Integer> readDays(JsonNode node) {
        List<Integer> days = new ArrayList<>();
        JsonNode arr = node.get("daysOfWeek");
        if (arr != null && arr.isArray()) {
            arr.forEach(n -> days.add(n.asInt()));
        }
        if (days.isEmpty()) {
            return ALL_DAYS;
        }
        return days;
    }

    private static Integer[] readWindow(JsonNode node) {
        if (node.hasNonNull("windowStart") && node.hasNonNull("windowEnd")) {
            int[] start = parseHm(node.path("windowStart").asString());
            int[] end = parseHm(node.path("windowEnd").asString());
            return new Integer[] {start[0], start[1], end[0], end[1]};
        }
        if (node.has("windowStartHour")) {
            return new Integer[] {
                node.path("windowStartHour").asInt(),
                node.path("windowStartMinute").asInt(0),
                node.path("windowEndHour").asInt(),
                node.path("windowEndMinute").asInt(0)
            };
        }
        return new Integer[] {null, null, null, null};
    }

    private Map<String, Object> toView(String jobKey, String flow, String kind, String payloadJson, boolean enabled) {
        SchedulePayload payload = fromStored(kind, payloadJson, flow);
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("jobKey", jobKey);
        view.put("flow", flow);
        view.put("kind", payload.kind().name());
        view.put("enabled", enabled);
        view.put("label", humanLabel(payload, enabled));
        view.put("triggerName", triggerNameForFlow(jobKey.split("\\.")[0], flow));
        view.put("daysOfWeek", payload.daysOfWeek());
        if (payload.kind() == ScheduleKind.INTERVAL) {
            view.put("everySeconds", payload.everySeconds());
            if (payload.hasTimeWindow()) {
                view.put(
                        "windowStart",
                        String.format(
                                Locale.ROOT, "%02d:%02d", payload.windowStartHour(), payload.windowStartMinute()));
                view.put(
                        "windowEnd",
                        String.format(Locale.ROOT, "%02d:%02d", payload.windowEndHour(), payload.windowEndMinute()));
            }
        } else {
            view.put("hour", payload.hour());
            view.put("minute", payload.minute());
        }
        return view;
    }

    static String humanLabel(SchedulePayload payload, boolean enabled) {
        if (!enabled) {
            return "вимкнено";
        }
        String days = formatDays(payload.daysOfWeek());
        if (payload.kind() == ScheduleKind.INTERVAL) {
            int s = payload.everySeconds() == null ? 0 : payload.everySeconds();
            String every;
            if (s % 3600 == 0) {
                every = "кожні " + (s / 3600) + " год";
            } else if (s % 60 == 0) {
                every = "кожні " + (s / 60) + " хв";
            } else {
                every = "кожні " + s + " с";
            }
            StringBuilder sb = new StringBuilder(every);
            if (payload.hasDayFilter()) {
                sb.append(", ").append(days);
            }
            if (payload.hasTimeWindow()) {
                sb.append(", ")
                        .append(String.format(
                                Locale.ROOT,
                                "%02d:%02d–%02d:%02d",
                                payload.windowStartHour(),
                                payload.windowStartMinute(),
                                payload.windowEndHour(),
                                payload.windowEndMinute()));
            }
            return sb.toString();
        }
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

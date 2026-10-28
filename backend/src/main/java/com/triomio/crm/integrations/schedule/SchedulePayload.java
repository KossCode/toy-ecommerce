package com.triomio.crm.integrations.schedule;

import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Flexible schedule in {@code job_schedules.payload}.
 *
 * <ul>
 *   <li>{@code INTERVAL} — every N seconds; optional days + optional daily time window
 *   <li>{@code CALENDAR} — once per selected day at hour:minute
 * </ul>
 */
public record SchedulePayload(
        ScheduleKind kind,
        @Nullable Integer everySeconds,
        @Nullable List<Integer> daysOfWeek,
        @Nullable Integer hour,
        @Nullable Integer minute,
        @Nullable Integer windowStartHour,
        @Nullable Integer windowStartMinute,
        @Nullable Integer windowEndHour,
        @Nullable Integer windowEndMinute) {

    public static SchedulePayload interval(
            int everySeconds,
            List<Integer> daysOfWeek,
            @Nullable Integer windowStartHour,
            @Nullable Integer windowStartMinute,
            @Nullable Integer windowEndHour,
            @Nullable Integer windowEndMinute) {
        return new SchedulePayload(
                ScheduleKind.INTERVAL,
                everySeconds,
                List.copyOf(daysOfWeek),
                null,
                null,
                windowStartHour,
                windowStartMinute,
                windowEndHour,
                windowEndMinute);
    }

    public static SchedulePayload calendar(List<Integer> daysOfWeek, int hour, int minute) {
        return new SchedulePayload(
                ScheduleKind.CALENDAR, null, List.copyOf(daysOfWeek), hour, minute, null, null, null, null);
    }

    public boolean hasDayFilter() {
        return daysOfWeek != null && !daysOfWeek.isEmpty() && daysOfWeek.size() < 7;
    }

    public boolean hasTimeWindow() {
        return windowStartHour != null && windowStartMinute != null && windowEndHour != null && windowEndMinute != null;
    }
}

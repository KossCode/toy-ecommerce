package com.triomio.crm.integrations.schedule;

import java.util.List;
import org.jspecify.annotations.Nullable;

/** Structured schedule stored in {@code job_schedules.payload} (no raw cron in the admin UI). */
public record SchedulePayload(
        ScheduleKind kind,
        @Nullable Integer everySeconds,
        @Nullable List<Integer> daysOfWeek,
        @Nullable Integer hour,
        @Nullable Integer minute) {

    public static SchedulePayload interval(int everySeconds) {
        return new SchedulePayload(ScheduleKind.INTERVAL, everySeconds, null, null, null);
    }

    public static SchedulePayload calendar(List<Integer> daysOfWeek, int hour, int minute) {
        return new SchedulePayload(ScheduleKind.CALENDAR, null, List.copyOf(daysOfWeek), hour, minute);
    }
}

package com.triomio.crm.jobs;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** Stable Quartz identities. Marketplace jobs start with {@code PROM.} so LIKE PROM% still works in UI. */
public final class JobNames {

    public static final String OUTBOX_DISPATCH = "OutboxDispatch";
    public static final String CONFIRM_DEADLINE = "ConfirmDeadline";
    public static final String RECONCILE = "Reconcile";
    public static final String DICTIONARIES_REFRESH = "DictionariesRefresh";
    public static final String HOUSEKEEPING = "Housekeeping";

    private JobNames() {}

    public static String ordersPoll(String marketplace) {
        return marketplace + ".OrdersPoll";
    }

    public static String feedBuild(String marketplace) {
        return marketplace + ".FeedBuild";
    }

    public static Set<String> all() {
        return Map.copyOf(triggersByName()).keySet();
    }

    /** Logical name → Quartz job name (group DEFAULT). */
    public static Map<String, String> triggersByName() {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("OrdersPoll.PROM", ordersPoll("PROM"));
        map.put("OrdersPoll.ROZETKA", ordersPoll("ROZETKA"));
        map.put("OrdersPoll.EPICENTR", ordersPoll("EPICENTR"));
        map.put("FeedBuild.PROM", feedBuild("PROM"));
        map.put("FeedBuild.ROZETKA", feedBuild("ROZETKA"));
        map.put("FeedBuild.EPICENTR", feedBuild("EPICENTR"));
        map.put("OutboxDispatch", OUTBOX_DISPATCH);
        map.put("ConfirmDeadline", CONFIRM_DEADLINE);
        map.put("Reconcile", RECONCILE);
        map.put("DictionariesRefresh", DICTIONARIES_REFRESH);
        map.put("Housekeeping", HOUSEKEEPING);
        return map;
    }
}

package com.triomio.crm.integrations;

import com.triomio.crm.catalog.ProductChanged;
import com.triomio.crm.feeds.FeedsProperties;
import com.triomio.crm.integrations.mode.IntegrationModeService;
import com.triomio.crm.integrations.schedule.JobScheduleService;
import com.triomio.crm.shared.ApiProblemException;
import com.triomio.crm.shared.WireLabels;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class IntegrationsService {

    record Flow(
            String name,
            String status,
            String when,
            @Nullable String link) {}

    record Ready(int ready, int total, int notReady, List<Map<String, Object>> reasons) {}

    record ErrorBanner(String title, String nextTry) {}

    record ModerationError(String sku, String name, String error, String when) {}

    record Marketplace(
            String id,
            String name,
            String tabLabel,
            String tabTone,
            List<Flow> flows,
            Ready ready,
            Map<String, Object> connection,
            @Nullable ErrorBanner errorBanner,
            List<ModerationError> moderationErrors) {}

    record IntegrationsFile(List<Marketplace> marketplaces) {}

    record SyncProduct(
            String sku,
            String name,
            boolean enabled,
            String channelState,
            @Nullable String lastSyncedAt,
            @Nullable String lastError) {}

    record SyncProductsPayload(List<SyncProduct> products, List<SyncProduct> candidates) {}

    private final JdbcClient jdbc;
    private final FeedsProperties feeds;
    private final JobScheduleService schedules;
    private final IntegrationModeService modes;
    private final ApplicationEventPublisher events;
    private final FeedDirtyService dirty;

    IntegrationsService(
            JdbcClient jdbc,
            FeedsProperties feeds,
            JobScheduleService schedules,
            IntegrationModeService modes,
            ApplicationEventPublisher events,
            FeedDirtyService dirty) {
        this.jdbc = jdbc;
        this.feeds = feeds;
        this.schedules = schedules;
        this.modes = modes;
        this.events = events;
        this.dirty = dirty;
    }

    @Transactional(readOnly = true)
    IntegrationsFile list() {
        return new IntegrationsFile(List.of(build("PROM"), build("ROZETKA"), build("EPICENTR")));
    }

    @Transactional
    Marketplace retry(String id) {
        String mp = WireLabels.marketplaceCode(id);
        if (!List.of("PROM", "ROZETKA", "EPICENTR").contains(mp)) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "INTEGRATION_NOT_FOUND", "Площадку не знайдено");
        }
        jdbc.sql("""
                        UPDATE sync_outbox SET status = 'PENDING', next_attempt_at = now(), updated_at = now(),
                          attempts = 0, last_error = null
                        WHERE marketplace = :mp AND status = 'FAILED'
                        """).param("mp", mp).update();
        jdbc.sql("""
                        UPDATE integration_settings SET paused_reason = null, updated_at = now()
                        WHERE marketplace = :mp
                        """).param("mp", mp).update();
        return build(mp);
    }

    Marketplace getOne(String id) {
        String mp = WireLabels.marketplaceCode(id);
        if (!List.of("PROM", "ROZETKA", "EPICENTR").contains(mp)) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "INTEGRATION_NOT_FOUND", "Площадку не знайдено");
        }
        return build(mp);
    }

    @Transactional(readOnly = true)
    SyncProductsPayload listProducts(String id) {
        String mp = requireMarketplace(id);
        List<SyncProduct> synced = jdbc.sql("""
                        SELECT p.sku, coalesce(p.name_uk, p.sku) AS name, c.enabled,
                               c.moderation_status, c.last_error,
                               to_char(c.last_synced_at AT TIME ZONE 'Europe/Kyiv', 'DD.MM HH24:MI') AS synced
                        FROM product_channels c
                        JOIN products p ON p.id = c.product_id
                        WHERE c.marketplace = :mp AND c.enabled
                        ORDER BY p.sku
                        """)
                .param("mp", mp)
                .query((rs, i) -> toSyncProduct(
                        rs.getString("sku"),
                        rs.getString("name"),
                        rs.getBoolean("enabled"),
                        rs.getString("moderation_status"),
                        rs.getString("last_error"),
                        rs.getString("synced")))
                .list();
        List<SyncProduct> candidates = jdbc.sql("""
                        SELECT p.sku, coalesce(p.name_uk, p.sku) AS name, c.enabled,
                               c.moderation_status, c.last_error,
                               to_char(c.last_synced_at AT TIME ZONE 'Europe/Kyiv', 'DD.MM HH24:MI') AS synced
                        FROM products p
                        JOIN product_channels c ON c.product_id = p.id AND c.marketplace = :mp
                        WHERE p.status = 'ACTIVE' AND NOT c.enabled
                        ORDER BY p.sku
                        LIMIT 500
                        """)
                .param("mp", mp)
                .query((rs, i) -> toSyncProduct(
                        rs.getString("sku"),
                        rs.getString("name"),
                        rs.getBoolean("enabled"),
                        rs.getString("moderation_status"),
                        rs.getString("last_error"),
                        rs.getString("synced")))
                .list();
        return new SyncProductsPayload(synced, candidates);
    }

    @Transactional
    SyncProductsPayload patchProducts(String id, Map<String, Object> body) {
        String mp = requireMarketplace(id);
        Object raw = body.get("items");
        if (!(raw instanceof List<?> items) || items.isEmpty()) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_BODY", "Потрібен масив items");
        }
        for (Object item : items) {
            if (!(item instanceof Map<?, ?> row)) {
                continue;
            }
            String sku = String.valueOf(row.get("sku"));
            boolean enabled = Boolean.TRUE.equals(row.get("enabled"));
            Long productId = jdbc.sql("SELECT id FROM products WHERE sku = :sku")
                    .param("sku", sku)
                    .query(Long.class)
                    .optional()
                    .orElse(null);
            if (productId == null) {
                throw new ApiProblemException(
                        HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "Товар " + sku + " не знайдено");
            }
            int n = jdbc.sql("""
                            UPDATE product_channels SET enabled = :en
                            WHERE product_id = :id AND marketplace = :mp
                            """)
                    .param("en", enabled)
                    .param("id", productId)
                    .param("mp", mp)
                    .update();
            if (n == 0) {
                throw new ApiProblemException(
                        HttpStatus.NOT_FOUND, "CHANNEL_NOT_FOUND", "Канал " + sku + " / " + mp + " не знайдено");
            }
            if (enabled) {
                enqueueStock(productId, mp);
                events.publishEvent(new ProductChanged(productId, true, true));
            } else {
                dirty.mark(mp);
            }
        }
        return listProducts(id);
    }

    private void enqueueStock(long productId, String marketplace) {
        Integer available = jdbc.sql("""
                        SELECT s.available FROM stock s
                        JOIN products p ON p.id = s.product_id
                        WHERE p.id = :id AND p.status = 'ACTIVE' AND NOT p.is_demo
                        """)
                .param("id", productId)
                .query(Integer.class)
                .optional()
                .orElse(null);
        if (available == null) {
            return;
        }
        jdbc.sql("""
                        INSERT INTO sync_outbox (marketplace, kind, product_id, payload, dedupe_key)
                        VALUES (:mp, 'STOCK', :pid, jsonb_build_object('available', :available),
                                :mp || ':STOCK:' || :pid)
                        ON CONFLICT (dedupe_key) WHERE status = 'PENDING'
                        DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
                        """)
                .param("mp", marketplace)
                .param("pid", productId)
                .param("available", available)
                .update();
    }

    private static SyncProduct toSyncProduct(
            String sku,
            String name,
            boolean enabled,
            @Nullable String moderation,
            @Nullable String lastError,
            @Nullable String synced) {
        String state;
        if (lastError != null && !lastError.isBlank()) {
            state = "Помилка";
        } else if (!enabled) {
            state = "Пауза";
        } else if (moderation != null && !moderation.isBlank() && !"Активний".equals(moderation)) {
            state = moderation;
        } else {
            state = "Активний";
        }
        return new SyncProduct(sku, name, enabled, state, synced, lastError);
    }

    private static String requireMarketplace(String id) {
        String mp = WireLabels.marketplaceCode(id);
        if (!List.of("PROM", "ROZETKA", "EPICENTR").contains(mp)) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "INTEGRATION_NOT_FOUND", "Площадку не знайдено");
        }
        return mp;
    }

    private Marketplace build(String marketplace) {
        String id = WireLabels.marketplaceWire(marketplace);
        String name = switch (marketplace) {
            case "PROM" -> "Prom";
            case "ROZETKA" -> "Rozetka";
            default -> "Epicentr";
        };
        record Setting(
                String mode,
                @Nullable String pausedReason,
                @Nullable String credentialsHint) {}
        Setting setting = jdbc.sql(
                        "SELECT mode, paused_reason, credentials_hint FROM integration_settings WHERE marketplace = :mp")
                .param("mp", marketplace)
                .query(Setting.class)
                .optional()
                .orElse(new Setting("READ_ONLY", null, null));

        int failed = jdbc.sql("SELECT count(*) FROM sync_outbox WHERE marketplace = :mp AND status = 'FAILED'")
                .param("mp", marketplace)
                .query(Integer.class)
                .single();

        String lastOrders = lastJobSuccess(marketplace + ".OrdersPoll");
        String lastFeed = lastJobSuccess(marketplace + ".FeedBuild");
        String lastAny = lastJobSuccessPrefix(marketplace + "%");

        int total = jdbc.sql("SELECT count(*) FROM products WHERE status = 'ACTIVE'")
                .query(Integer.class)
                .single();
        int ready = jdbc.sql("""
                        SELECT count(DISTINCT p.id) FROM products p
                        JOIN product_channels c ON c.product_id = p.id AND c.marketplace = :mp AND c.enabled
                        WHERE p.status = 'ACTIVE'
                        """).param("mp", marketplace).query(Integer.class).single();
        int notReady = Math.max(0, total - ready);
        List<Map<String, Object>> reasons = new ArrayList<>();
        if (notReady > 0) {
            reasons.add(Map.of("text", "Не увімкнено на площадці", "count", notReady));
        }

        List<ModerationError> moderation = jdbc.sql("""
                        SELECT p.sku, coalesce(p.name_uk, p.sku) AS name, c.last_error AS error,
                               to_char(coalesce(c.last_synced_at, now()) AT TIME ZONE 'Europe/Kyiv', 'HH24:MI') AS at_label
                        FROM product_channels c JOIN products p ON p.id = c.product_id
                        WHERE c.marketplace = :mp AND c.last_error IS NOT NULL
                        LIMIT 20
                        """)
                .param("mp", marketplace)
                .query((rs, i) -> new ModerationError(
                        rs.getString("sku"), rs.getString("name"), rs.getString("error"), rs.getString("at_label")))
                .list();

        boolean hasError = failed > 0 || setting.pausedReason() != null;
        String tabTone = hasError ? (moderation.isEmpty() && failed == 0 ? "error" : "warn") : "ok";
        if (hasError && "EPICENTR".equals(marketplace)) {
            tabTone = "error";
        }
        String tabLabel = hasError
                ? (failed > 0 ? failed + " помилка" : "пауза")
                : (moderation.isEmpty() ? "працює" : moderation.size() + " помилка");

        List<Map<String, Object>> scheduleViews = schedules.schedulesForMarketplace(marketplace);
        String ordersLabel = scheduleLabel(scheduleViews, "orders");
        String feedLabel = scheduleLabel(scheduleViews, "feed");

        List<Flow> flows = List.of(
                new Flow(
                        "Замовлення",
                        hasError && setting.pausedReason() != null ? "Пауза" : "Працює",
                        lastOrders == null
                                ? "опитано ще не запускалось · CRM: " + ordersLabel
                                : "опитано о " + lastOrders,
                        null),
                new Flow(
                        "Ціни і наявність",
                        failed > 0 ? "Помилка" : "Працює",
                        failed > 0
                                ? "помилка outbox"
                                : (lastAny == null ? "надіслано ще не запускалось" : "надіслано о " + lastAny),
                        null),
                new Flow(
                        "Фід товарів",
                        "Працює",
                        lastFeed == null
                                ? "пересбор ще не запускався · CRM: " + feedLabel
                                : "пересобрано о " + lastFeed + " · CRM: " + feedLabel,
                        null),
                new Flow(
                        "Модерація",
                        moderation.isEmpty() ? "Працює" : moderation.size() + " помилка",
                        lastFeed == null ? "оновлено ще невідомо" : "оновлено о " + lastFeed,
                        null));

        ErrorBanner banner = null;
        if (setting.pausedReason() != null) {
            banner = new ErrorBanner(setting.pausedReason(), "автоповтор незабаром");
        } else if (failed > 0) {
            banner = new ErrorBanner("Є " + failed + " помилок відправки", "натисніть «Повторити»");
        }

        Map<String, Object> connection = new LinkedHashMap<>();
        connection.put("mode", setting.mode());
        connection.put("maxMode", modes.maxMode().name());
        connection.put("effectiveMode", modes.effectiveMode(marketplace).name());
        connection.put("feedUrl", feeds.feedUrl(id));
        if (setting.credentialsHint() != null) {
            connection.put("tokenMasked", setting.credentialsHint());
        }
        connection.put(
                "capabilities",
                List.of(
                        "Замовлення — опитування CRM",
                        "Ціни і наявність через API / outbox",
                        "Автооновлення фіду CRM: " + feedLabel));
        connection.put(
                "caption",
                switch (marketplace) {
                    case "EPICENTR" ->
                        "Частоту скачування фіду змінює менеджер Epicentr у кабінеті. Тут — коли CRM пересобирає файл.";
                    case "ROZETKA" ->
                        "Rozetka забирає фід за своїм розкладом (~раз на годину). Тут — пересбор CRM і опитування замовлень.";
                    default -> "Prom імпортує YML за розкладом у кабінеті. Тут — пересбор CRM і опитування замовлень.";
                });
        connection.put("schedules", scheduleViews);

        return new Marketplace(
                id,
                name,
                tabLabel,
                tabTone,
                flows,
                new Ready(ready, total, notReady, reasons),
                connection,
                banner,
                moderation);
    }

    private String lastJobSuccess(String jobName) {
        return jdbc.sql("""
                        SELECT to_char(finished_at AT TIME ZONE 'Europe/Kyiv', 'HH24:MI')
                        FROM job_runs WHERE job_name = :name AND status = 'SUCCESS' AND finished_at IS NOT NULL
                        ORDER BY finished_at DESC LIMIT 1
                        """)
                .param("name", jobName)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    private String lastJobSuccessPrefix(String prefix) {
        return jdbc.sql("""
                        SELECT to_char(finished_at AT TIME ZONE 'Europe/Kyiv', 'HH24:MI')
                        FROM job_runs WHERE job_name LIKE :prefix AND status = 'SUCCESS' AND finished_at IS NOT NULL
                        ORDER BY finished_at DESC LIMIT 1
                        """)
                .param("prefix", prefix)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    private static String scheduleLabel(List<Map<String, Object>> schedules, String flow) {
        return schedules.stream()
                .filter(s -> flow.equals(s.get("flow")))
                .map(s -> String.valueOf(s.get("label")))
                .findFirst()
                .orElse("—");
    }
}

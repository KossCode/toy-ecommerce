package com.triomio.crm.dashboard;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.dashboard.DashboardDtos.IntegrationCard;
import com.triomio.crm.dashboard.DashboardDtos.LowStockSample;
import com.triomio.crm.dashboard.DashboardDtos.MetaResponse;
import com.triomio.crm.dashboard.DashboardDtos.OverviewResponse;
import com.triomio.crm.dashboard.DashboardDtos.TodoItem;
import com.triomio.crm.dashboard.DashboardDtos.UserView;
import com.triomio.crm.shared.WireLabels;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class DashboardService {

    private final JdbcClient jdbc;
    private final Clock clock;

    DashboardService(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    MetaResponse meta(CurrentUser user) {
        ZonedDateTime now = ZonedDateTime.now(clock.withZone(WireLabels.KYIV));
        Map<String, Number> counts = counts();
        Map<String, Object> overview = overviewHints(counts);
        return new MetaResponse(
                new UserView(user.fullName(), WireLabels.role(user.role().name())),
                now.format(WireLabels.TODAY_LABEL),
                now.toLocalDate().toString(),
                counts,
                overview);
    }

    @Transactional(readOnly = true)
    OverviewResponse overview(CurrentUser user) {
        MetaResponse meta = meta(user);
        return new OverviewResponse(meta, todo(), integrationCards(), lowStockSample());
    }

    private Map<String, Number> counts() {
        record Row(long productsTotal, long ordersTotal, long lowStock, long drafts, long outOfStock) {}
        Row row = jdbc.sql("""
                        SELECT
                          (SELECT count(*) FROM products) AS products_total,
                          (SELECT count(*) FROM orders) AS orders_total,
                          (SELECT count(*) FROM stock s WHERE s.available > 0 AND s.available <= 5
                             AND NOT (s.awaiting AND s.available = 0)) AS low_stock,
                          (SELECT count(*) FROM products WHERE status = 'DRAFT') AS drafts,
                          (SELECT count(*) FROM stock s WHERE s.available = 0 AND NOT s.awaiting) AS out_of_stock
                        """).query(Row.class).single();

        long notOnMarketplaces = 0;
        long notReady = 0;
        for (ProductSync sync : productSyncRows()) {
            String status = WireLabels.productStatus(sync.status());
            String syncStatus = WireLabels.syncStatus(status, sync.channels());
            if ("—".equals(syncStatus)) {
                notOnMarketplaces++;
            } else if ("Є питання".equals(syncStatus) || "Помилка".equals(syncStatus)) {
                notReady++;
            }
        }

        Map<String, Number> counts = new LinkedHashMap<>();
        counts.put("productsTotal", row.productsTotal());
        counts.put("ordersTotal", row.ordersTotal());
        counts.put("lowStock", row.lowStock());
        counts.put("drafts", row.drafts());
        counts.put("notOnMarketplaces", notOnMarketplaces);
        counts.put("notReady", notReady);
        counts.put("outOfStock", row.outOfStock());
        return counts;
    }

    private Map<String, Object> overviewHints(Map<String, Number> counts) {
        record OrderCounts(long needConfirm, long awaitingShip, long ordersToday, double ordersTodaySum) {}
        LocalDate today = LocalDate.now(clock.withZone(WireLabels.KYIV));
        OrderCounts oc =
                jdbc.sql("""
                        SELECT
                          count(*) FILTER (WHERE status = 'NEW') AS need_confirm,
                          count(*) FILTER (WHERE status = 'CONFIRMED') AS awaiting_ship,
                          count(*) FILTER (WHERE (placed_at AT TIME ZONE 'Europe/Kyiv')::date = :today) AS orders_today,
                          coalesce(sum(total) FILTER (
                              WHERE (placed_at AT TIME ZONE 'Europe/Kyiv')::date = :today), 0) AS orders_today_sum
                        FROM orders
                        """).param("today", today).query(OrderCounts.class).single();

        Integer nearestMinutes = jdbc.sql("""
                        SELECT CASE WHEN confirm_deadline_at IS NULL THEN NULL
                               ELSE greatest(0, round(extract(epoch FROM (confirm_deadline_at - now())) / 60))::int
                               END
                        FROM orders WHERE status = 'NEW' AND confirm_deadline_at IS NOT NULL
                        ORDER BY confirm_deadline_at ASC LIMIT 1
                        """).query(Integer.class).optional().orElse(null);

        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("needConfirm", oc.needConfirm());
        overview.put(
                "needConfirmHint",
                nearestMinutes == null ? "немає дедлайнів" : "найближче — за " + formatShortDeadline(nearestMinutes));
        overview.put("awaitingShip", oc.awaitingShip());
        overview.put("awaitingShipHint", "потрібно зібрати");
        overview.put("ordersToday", oc.ordersToday());
        overview.put(
                "ordersTodayHint", oc.ordersToday() > 0 ? "на " + WireLabels.moneyUa(oc.ordersTodaySum()) : "немає");
        overview.put("lowStock", counts.get("lowStock"));
        overview.put("lowStockHint", "з " + counts.get("productsTotal") + " товарів");
        return overview;
    }

    private List<TodoItem> todo() {
        record Row(
                String number,
                String channel,
                String customerName,
                java.math.BigDecimal total,
                String status,
                OffsetDateTime confirmDeadlineAt) {}
        List<Row> rows = jdbc.sql("""
                        SELECT number, channel, customer_name, total, status, confirm_deadline_at
                        FROM orders
                        WHERE status IN ('NEW', 'CONFIRMED')
                        ORDER BY
                          CASE status WHEN 'NEW' THEN 0 ELSE 1 END,
                          confirm_deadline_at NULLS LAST
                        LIMIT 4
                        """).query(Row.class).list();
        List<TodoItem> items = new ArrayList<>();
        OffsetDateTime now = OffsetDateTime.now(clock);
        for (Row row : rows) {
            String statusUa = WireLabels.orderStatus(row.status());
            Integer minutes = null;
            if (row.confirmDeadlineAt() != null) {
                minutes = (int) Math.max(
                        0,
                        java.time.Duration.between(now, row.confirmDeadlineAt()).toMinutes());
            }
            boolean isNew = "NEW".equals(row.status());
            items.add(new TodoItem(
                    row.number(),
                    WireLabels.channel(row.channel()),
                    row.customerName(),
                    row.total(),
                    statusUa,
                    isNew
                            ? (WireLabels.formatDeadline(minutes) != null
                                    ? WireLabels.formatDeadline(minutes)
                                    : "Підтвердити")
                            : "Створити накладну",
                    isNew ? "confirm" : "ttn",
                    isNew && minutes != null && minutes < 120));
        }
        return items;
    }

    private List<IntegrationCard> integrationCards() {
        record Setting(String marketplace, String mode, String pausedReason) {}
        List<Setting> settings = jdbc.sql(
                        "SELECT marketplace, mode, paused_reason FROM integration_settings ORDER BY marketplace")
                .query(Setting.class)
                .list();
        List<IntegrationCard> cards = new ArrayList<>();
        for (Setting s : settings) {
            String id = WireLabels.marketplaceWire(s.marketplace());
            String name = switch (s.marketplace()) {
                case "PROM" -> "Prom";
                case "ROZETKA" -> "Rozetka";
                case "EPICENTR" -> "Epicentr";
                default -> s.marketplace();
            };
            int failed = jdbc.sql("SELECT count(*) FROM sync_outbox WHERE marketplace = :m AND status = 'FAILED'")
                    .param("m", s.marketplace())
                    .query(Integer.class)
                    .single();
            boolean hasRetry =
                    failed > 0 || (s.pausedReason() != null && !s.pausedReason().isBlank());
            String lastJob = jdbc.sql("""
                            SELECT to_char(finished_at AT TIME ZONE 'Europe/Kyiv', 'HH24:MI')
                            FROM job_runs
                            WHERE job_name LIKE :prefix AND status = 'SUCCESS' AND finished_at IS NOT NULL
                            ORDER BY finished_at DESC LIMIT 1
                            """)
                    .param("prefix", s.marketplace() + "%")
                    .query(String.class)
                    .optional()
                    .orElse(null);
            String tabTone = hasRetry ? (failed > 0 || s.pausedReason() != null ? "error" : "warn") : "ok";
            if (failed > 0 && "ROZETKA".equals(s.marketplace())) {
                tabTone = "warn";
            }
            String summary;
            if (hasRetry && "EPICENTR".equals(s.marketplace())) {
                summary = lastJob == null ? "Помилка синхронізації" : "Помилка о " + lastJob;
            } else if (failed > 0) {
                summary = (lastJob == null ? "Синхронізовано" : "Синхронізовано о " + lastJob) + " · " + failed
                        + " помилка";
            } else {
                summary = lastJob == null ? "Очікує першого запуску" : "Синхронізовано о " + lastJob;
            }
            cards.add(new IntegrationCard(id, name, tabTone, summary, hasRetry));
        }
        return cards;
    }

    private LowStockSample lowStockSample() {
        record Row(String sku, String nameUk, int available) {}
        return jdbc.sql("""
                        SELECT p.sku, coalesce(p.name_uk, p.sku) AS name_uk, s.available
                        FROM products p JOIN stock s ON s.product_id = p.id
                        WHERE s.available > 0 AND s.available <= 5
                        ORDER BY s.available ASC, p.sku LIMIT 1
                        """)
                .query(Row.class)
                .optional()
                .map(r -> new LowStockSample(r.sku(), r.nameUk(), r.available()))
                .orElse(null);
    }

    private record ProductSync(String status, Map<String, String> channels) {}

    private List<ProductSync> productSyncRows() {
        record ChannelRow(long productId, String status, String marketplace, Boolean enabled, String moderation) {}
        List<ChannelRow> rows = jdbc.sql("""
                        SELECT p.id AS product_id, p.status, c.marketplace, c.enabled, c.moderation_status AS moderation
                        FROM products p
                        LEFT JOIN product_channels c ON c.product_id = p.id
                        """).query(ChannelRow.class).list();
        Map<Long, ProductSync> byId = new LinkedHashMap<>();
        for (ChannelRow row : rows) {
            ProductSync existing =
                    byId.computeIfAbsent(row.productId(), id -> new ProductSync(row.status(), new HashMap<>()));
            if (row.marketplace() != null) {
                existing.channels()
                        .put(
                                WireLabels.marketplaceWire(row.marketplace()),
                                WireLabels.channelLabel(Boolean.TRUE.equals(row.enabled()), row.moderation()));
            }
        }
        return List.copyOf(byId.values());
    }

    private static String formatShortDeadline(int minutes) {
        int h = minutes / 60;
        int m = minutes % 60;
        if (h <= 0) {
            return m + " хв";
        }
        if (m == 0) {
            return h + " год";
        }
        return h + " год " + m + " хв";
    }
}

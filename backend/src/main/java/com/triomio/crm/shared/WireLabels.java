package com.triomio.crm.shared;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

/** Maps DB codes ↔ Ukrainian strings the admin SPA compares against. */
public final class WireLabels {

    public static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");
    public static final Locale UK = Locale.forLanguageTag("uk-UA");
    public static final DateTimeFormatter TODAY_LABEL = DateTimeFormatter.ofPattern("'Сьогодні,' d MMMM yyyy", UK);
    public static final DateTimeFormatter LOCAL_ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private static final Map<String, String> PRODUCT_STATUS = Map.of(
            "DRAFT", "Чернетка",
            "ACTIVE", "Активний",
            "ARCHIVE", "Архів");
    private static final Map<String, String> PRODUCT_STATUS_CODE = Map.of(
            "Чернетка", "DRAFT",
            "Активний", "ACTIVE",
            "Архів", "ARCHIVE");

    private static final Map<String, String> ORDER_STATUS = Map.of(
            "DRAFT", "Чернетка",
            "NEW", "Нове",
            "CONFIRMED", "Підтверджено",
            "SHIPPED", "Відправлено",
            "DELIVERED", "Доставлено",
            "CANCELLED", "Скасовано");
    private static final Map<String, String> ORDER_STATUS_CODE = Map.of(
            "Чернетка", "DRAFT",
            "Нове", "NEW",
            "Підтверджено", "CONFIRMED",
            "Відправлено", "SHIPPED",
            "Доставлено", "DELIVERED",
            "Скасовано", "CANCELLED");

    private static final Map<String, String> AUDIT_KIND = Map.of(
            "FIELDS", "Поля",
            "PRICE", "Ціна",
            "STOCK", "Наявність",
            "STATUS", "Статус",
            "INTEGRATION", "Інтеграція",
            "USERS", "Користувачі");

    private static final Map<String, String> MARKETPLACE = Map.of(
            "PROM", "prom",
            "ROZETKA", "rozetka",
            "EPICENTR", "epicentr");
    private static final Map<String, String> MARKETPLACE_CODE =
            Map.of("prom", "PROM", "rozetka", "ROZETKA", "epicentr", "EPICENTR");

    private static final Map<String, String> ROLE = Map.of("OWNER", "Власник", "MANAGER", "Менеджер");

    private static final Map<String, String> CHANNEL = Map.of(
            "PROM", "Prom",
            "ROZETKA", "Rozetka",
            "EPICENTR", "Epicentr",
            "INSTAGRAM", "Instagram",
            "MANUAL", "Вручну",
            "SITE", "Сайт");
    private static final Map<String, String> CHANNEL_CODE = Map.of(
            "Prom", "PROM",
            "Rozetka", "ROZETKA",
            "Epicentr", "EPICENTR",
            "Instagram", "INSTAGRAM",
            "Вручну", "MANUAL",
            "Сайт", "SITE");

    private WireLabels() {}

    public static String productStatus(String code) {
        return PRODUCT_STATUS.getOrDefault(code, code);
    }

    public static String productStatusCode(String label) {
        return PRODUCT_STATUS_CODE.getOrDefault(label, label);
    }

    public static String orderStatus(String code) {
        return ORDER_STATUS.getOrDefault(code, code);
    }

    public static String orderStatusCode(String label) {
        return ORDER_STATUS_CODE.getOrDefault(label, label);
    }

    public static String auditKind(String code) {
        return AUDIT_KIND.getOrDefault(code, code);
    }

    public static String marketplaceWire(String code) {
        return MARKETPLACE.getOrDefault(code, code == null ? null : code.toLowerCase(Locale.ROOT));
    }

    public static String marketplaceCode(String wire) {
        return MARKETPLACE_CODE.getOrDefault(wire == null ? "" : wire.toLowerCase(Locale.ROOT), wire);
    }

    public static String role(String code) {
        return ROLE.getOrDefault(code, code);
    }

    public static String channel(String code) {
        return CHANNEL.getOrDefault(code, code);
    }

    public static String channelCode(String label) {
        if (label == null) {
            return "INSTAGRAM";
        }
        return CHANNEL_CODE.getOrDefault(label, label.toUpperCase(Locale.ROOT));
    }

    public static String stockLabel(int available, boolean awaiting) {
        if (awaiting && available == 0) {
            return "Очікується";
        }
        if (available == 0) {
            return "Немає в наявності";
        }
        if (available <= 5) {
            return "Закінчується";
        }
        return "В наявності";
    }

    /**
     * Channel cell for the product grid: enabled+null moderation → Активний; disabled with moderation keeps the
     * stored label (Вимкнено / Не готовий / …); never configured → —.
     */
    public static String channelLabel(boolean enabled, String moderationStatus) {
        if (moderationStatus == null || moderationStatus.isBlank()) {
            return enabled ? "Активний" : "—";
        }
        if (!enabled && moderationStatus.equals("Активний")) {
            return "Вимкнено";
        }
        return moderationStatus;
    }

    /**
     * Same vocabulary as the browser mock: Активна / Є питання / Помилка / —. Partial channel coverage is «Є
     * питання» so the products tab «Не готові» and overview notReady counts stay aligned.
     */
    public static String syncStatus(String productStatusUa, Map<String, String> channels) {
        if ("Чернетка".equals(productStatusUa)) {
            return "—";
        }
        int enabled = 0;
        int active = 0;
        for (String v : channels.values()) {
            if (v == null || "—".equals(v) || "Вимкнено".equals(v)) {
                continue;
            }
            enabled++;
            if ("Активний".equals(v)) {
                active++;
            }
        }
        if (enabled == 0) {
            return "—";
        }
        int problem = enabled - active;
        if (problem == 0) {
            return "Активна";
        }
        if (active == 0) {
            return "Помилка";
        }
        return "Є питання";
    }

    public static String formatDeadline(Integer minutes) {
        if (minutes == null) {
            return null;
        }
        int h = minutes / 60;
        int m = minutes % 60;
        if (h <= 0) {
            return "підтвердити за " + m + " хв";
        }
        return "підтвердити за " + h + " год " + m + " хв";
    }

    public static String moneyUa(Number amount) {
        return String.format(UK, "%,.0f", amount.doubleValue()).replace('\u00a0', ' ') + " грн";
    }
}

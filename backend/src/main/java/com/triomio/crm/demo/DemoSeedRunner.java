package com.triomio.crm.demo;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Loads data/*.json into an empty local database. Every product is marked is_demo, so it can never reach a feed or the
 * outbox. The bean does not exist outside the local profile.
 */
@Component
@Profile("local & !prod")
class DemoSeedRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoSeedRunner.class);
    private static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");
    private static final List<String> MARKETPLACES = List.of("PROM", "ROZETKA", "EPICENTR");
    private static final Map<String, String> PRODUCT_STATUS =
            Map.of("Чернетка", "DRAFT", "Активний", "ACTIVE", "Архів", "ARCHIVE");
    private static final Map<String, String> ORDER_STATUS = Map.of(
            "Чернетка", "DRAFT",
            "Нове", "NEW",
            "Підтверджено", "CONFIRMED",
            "Відправлено", "SHIPPED",
            "Доставлено", "DELIVERED",
            "Скасовано", "CANCELLED");
    private static final Map<String, String> AUDIT_KIND =
            Map.of("Поля", "FIELDS", "Ціна", "PRICE", "Наявність", "STOCK", "Статус", "STATUS");

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final TransactionTemplate tx;
    private final PasswordEncoder encoder;
    private final Path dataDir;
    private final String userPassword;

    DemoSeedRunner(
            JdbcClient jdbc,
            JsonMapper json,
            TransactionTemplate tx,
            PasswordEncoder encoder,
            @Value("${app.demo.data-dir:../data}") String dataDir,
            @Value("${app.demo.user-password:}") String userPassword) {
        this.jdbc = jdbc;
        this.json = json;
        this.tx = tx;
        this.encoder = encoder;
        this.dataDir = Path.of(dataDir);
        this.userPassword = userPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        seedUsers();
        if (!Files.isRegularFile(dataDir.resolve("products.json"))) {
            log.warn("Demo seed skipped: {} has no products.json", dataDir.toAbsolutePath());
            return;
        }
        int existing =
                jdbc.sql("SELECT count(*) FROM products").query(Integer.class).single();
        if (existing > 0) {
            log.info("Demo seed skipped: database already has {} products", existing);
            return;
        }
        tx.executeWithoutResult(status -> seed());
    }

    /**
     * owner@demo.local and manager@demo.local, both with app.demo.user-password from backend/.env.local. The password is
     * never committed, so without it there are no demo users.
     */
    void seedUsers() {
        if (userPassword.length() < 12) {
            log.warn("Demo users skipped: set app.demo.user-password (12+ characters) in backend/.env.local");
            return;
        }
        String hash = encoder.encode(userPassword);
        int created = 0;
        for (String[] user : new String[][] {
            {"owner@demo.local", "Демо Власник", "OWNER"}, {"manager@demo.local", "Демо Менеджер", "MANAGER"}
        }) {
            created += jdbc.sql("""
                            INSERT INTO users (email, password_hash, full_name, role, must_change_password, password_changed_at)
                            VALUES (:email, :hash, :name, :role, false, now())
                            ON CONFLICT (email) DO NOTHING
                            """)
                    .param("email", user[0])
                    .param("hash", hash)
                    .param("name", user[1])
                    .param("role", user[2])
                    .update();
        }
        if (created > 0) {
            log.info("Demo users created: owner@demo.local, manager@demo.local");
        }
    }

    void seed() {
        Map<String, Long> categoryIds = seedCategories(read("categories.json", new TypeReference<>() {}));
        List<DemoData.Product> products = read("products.json", new TypeReference<>() {});
        Map<String, Long> brandIds = seedBrands(products);
        Map<String, Long> productIds = seedProducts(products, categoryIds, brandIds);
        seedPriceRules(read("prices.json", new TypeReference<>() {}), categoryIds, brandIds, productIds);
        List<DemoData.Order> orders = read("orders.json", new TypeReference<>() {});
        seedOrders(orders, productIds);
        List<DemoData.ProductHistory> history = read("product-history.json", new TypeReference<>() {});
        seedProductHistory(history, productIds);
        log.info(
                "Demo seed loaded: {} products, {} orders, {} categories (all products is_demo = true)",
                productIds.size(),
                orders.size(),
                categoryIds.values().stream().distinct().count());
    }

    private Map<String, Long> seedCategories(DemoData.Categories data) {
        Map<String, String> attributeSets = new HashMap<>();
        data.marketplaceLeaves().forEach((marketplace, leaves) -> {
            for (DemoData.Leaf leaf : leaves) {
                String code = marketplace.toUpperCase(Locale.ROOT);
                upsertMarketplaceCategory(code, leaf.id(), leaf.name(), leaf.attributeSet());
                if (leaf.attributeSet() != null) {
                    attributeSets.put(code + ":" + leaf.id(), leaf.attributeSet());
                }
            }
        });

        Map<String, Long> ids = new HashMap<>();
        List<DemoData.Category> ordered = data.categories().stream()
                .sorted((a, b) -> Boolean.compare(a.parentId() != null, b.parentId() != null))
                .toList();
        for (DemoData.Category category : ordered) {
            long id = jdbc.sql(
                            "INSERT INTO categories (parent_id, name, sort_order) VALUES (:parent, :name, :sort) RETURNING id")
                    .param("parent", category.parentId() == null ? null : ids.get(category.parentId()))
                    .param("name", category.name())
                    .param("sort", category.sortOrder() == null ? 0 : category.sortOrder())
                    .query(Long.class)
                    .single();
            ids.put(category.id(), id);
            ids.putIfAbsent("name:" + category.name(), id);
            if (category.mappings() == null) {
                continue;
            }
            category.mappings().forEach((marketplace, mapping) -> {
                if (mapping == null || mapping.leafId() == null) {
                    return;
                }
                String code = marketplace.toUpperCase(Locale.ROOT);
                String attributeSet = attributeSets.get(code + ":" + mapping.leafId());
                upsertMarketplaceCategory(code, mapping.leafId(), mapping.name(), attributeSet);
                jdbc.sql("""
                                INSERT INTO category_mappings (category_id, marketplace, external_category_id, attribute_set_code)
                                VALUES (:category, :marketplace, :external, :attributeSet)
                                """)
                        .param("category", id)
                        .param("marketplace", code)
                        .param("external", mapping.leafId())
                        .param("attributeSet", attributeSet)
                        .update();
            });
        }
        return ids;
    }

    private void upsertMarketplaceCategory(String marketplace, String externalId, String name, String attributeSet) {
        jdbc.sql("""
                        INSERT INTO marketplace_categories (marketplace, external_id, name, attribute_set_code)
                        VALUES (:marketplace, :external, :name, :attributeSet)
                        ON CONFLICT (marketplace, external_id) DO NOTHING
                        """)
                .param("marketplace", marketplace)
                .param("external", externalId)
                .param("name", name)
                .param("attributeSet", attributeSet)
                .update();
    }

    private Map<String, Long> seedBrands(List<DemoData.Product> products) {
        Map<String, Long> ids = new HashMap<>();
        products.stream()
                .map(DemoData.Product::brand)
                .filter(name -> name != null && !name.isBlank())
                .distinct()
                .forEach(name -> ids.put(
                        name,
                        jdbc.sql("INSERT INTO brands (name) VALUES (:name) RETURNING id")
                                .param("name", name)
                                .query(Long.class)
                                .single()));
        return ids;
    }

    private Map<String, Long> seedProducts(
            List<DemoData.Product> products, Map<String, Long> categoryIds, Map<String, Long> brandIds) {
        Map<String, Long> ids = new HashMap<>();
        for (DemoData.Product p : products) {
            BigDecimal[] dims = dimensions(p.dimensionsCm());
            long id = jdbc.sql("""
                            INSERT INTO products (
                                sku, status, is_demo, brand_id, category_id, name_uk, name_ru, description_uk, description_ru,
                                model, barcode, country_uk, country_ru, weight_kg, length_cm, width_cm, height_cm,
                                color_uk, color_ru, age_group_uk, age_group_ru, material_uk, material_ru, type_uk, type_ru,
                                parts_count, series_uk, series_ru, condition_uk, condition_ru, base_price, old_price)
                            VALUES (
                                :sku, :status, true, :brand, :category, :nameUk, :nameRu, :descriptionUk, :descriptionRu,
                                :model, :barcode, :countryUk, :countryRu, :weight, :length, :width, :height,
                                :colorUk, :colorRu, :ageUk, :ageRu, :materialUk, :materialRu, :typeUk, :typeRu,
                                :parts, :seriesUk, :seriesRu, :conditionUk, :conditionRu, :price, :oldPrice)
                            RETURNING id
                            """)
                    .param("sku", p.sku())
                    .param("status", PRODUCT_STATUS.getOrDefault(p.status(), "DRAFT"))
                    .param("brand", brandIds.get(p.brand()))
                    .param("category", categoryIds.get("name:" + p.category()))
                    .param("nameUk", blankToNull(p.name()))
                    .param("nameRu", blankToNull(p.nameRu()))
                    .param("descriptionUk", blankToNull(p.description()))
                    .param("descriptionRu", blankToNull(p.descriptionRu()))
                    .param("model", blankToNull(p.model()))
                    .param("barcode", blankToNull(p.barcode()))
                    .param("countryUk", blankToNull(p.country()))
                    .param("countryRu", blankToNull(p.countryRu()))
                    .param("weight", positiveOrNull(p.weightKg()))
                    .param("length", dims[0])
                    .param("width", dims[1])
                    .param("height", dims[2])
                    .param("colorUk", blankToNull(p.color()))
                    .param("colorRu", blankToNull(p.colorRu()))
                    .param("ageUk", blankToNull(p.ageGroup()))
                    .param("ageRu", blankToNull(p.ageGroupRu()))
                    .param("materialUk", blankToNull(p.material()))
                    .param("materialRu", blankToNull(p.materialRu()))
                    .param("typeUk", blankToNull(p.type()))
                    .param("typeRu", blankToNull(p.typeRu()))
                    .param("parts", p.partsCount() != null && p.partsCount() > 0 ? p.partsCount() : null)
                    .param("seriesUk", blankToNull(p.series()))
                    .param("seriesRu", blankToNull(p.seriesRu()))
                    .param("conditionUk", blankToNull(p.condition()))
                    .param("conditionRu", blankToNull(p.conditionRu()))
                    .param("price", positiveOrNull(p.price()))
                    .param("oldPrice", positiveOrNull(p.oldPrice()))
                    .query(Long.class)
                    .single();
            ids.put(p.sku(), id);

            jdbc.sql(
                            "INSERT INTO stock (product_id, total, reserve, awaiting) VALUES (:id, :total, :reserve, :awaiting)")
                    .param("id", id)
                    .param("total", p.total() == null ? 0 : p.total())
                    .param("reserve", p.reserve() == null ? 0 : p.reserve())
                    .param("awaiting", Boolean.TRUE.equals(p.awaiting()))
                    .update();

            for (String marketplace : MARKETPLACES) {
                String label = p.channels() == null ? null : p.channels().get(marketplace.toLowerCase(Locale.ROOT));
                boolean configured = label != null && !label.equals("—");
                jdbc.sql("""
                                INSERT INTO product_channels (product_id, marketplace, enabled, external_id, name_override, moderation_status)
                                VALUES (:id, :marketplace, :enabled, :external, :nameOverride, :moderation)
                                """)
                        .param("id", id)
                        .param("marketplace", marketplace)
                        .param("enabled", configured && !label.equals("Вимкнено"))
                        .param(
                                "external",
                                marketplace.equals("PROM") ? p.sku() : p.sku().replace("-", ""))
                        .param("nameOverride", marketplace.equals("EPICENTR") ? blankToNull(p.epicentrName()) : null)
                        .param("moderation", configured ? label : null)
                        .update();
            }
        }
        for (DemoData.Product p : products) {
            if (p.duplicateOf() != null && ids.containsKey(p.duplicateOf())) {
                jdbc.sql("UPDATE products SET duplicate_of = :original WHERE id = :id")
                        .param("original", ids.get(p.duplicateOf()))
                        .param("id", ids.get(p.sku()))
                        .update();
            }
        }
        return ids;
    }

    private void seedPriceRules(
            DemoData.Prices prices,
            Map<String, Long> categoryIds,
            Map<String, Long> brandIds,
            Map<String, Long> productIds) {
        for (DemoData.PriceRule rule : prices.rules()) {
            String scope = rule.scope().toUpperCase(Locale.ROOT);
            Long ref = switch (scope) {
                case "CATEGORY" -> categoryIds.get("name:" + rule.scopeValue());
                case "BRAND" -> brandIds.get(rule.scopeValue());
                case "PRODUCT" -> productIds.get(rule.scopeValue());
                default -> null;
            };
            if (!scope.equals("DEFAULT") && ref == null) {
                log.warn("Demo seed: price rule {} {} skipped, unknown target", scope, rule.scopeValue());
                continue;
            }
            String kind = rule.kind().toUpperCase(Locale.ROOT);
            jdbc.sql("""
                            INSERT INTO price_rules (marketplace, scope, scope_ref_id, kind, value, rounding)
                            VALUES (:marketplace, :scope, :ref, :kind, :value, :rounding)
                            """)
                    .param("marketplace", rule.marketplace().toUpperCase(Locale.ROOT))
                    .param("scope", scope)
                    .param("ref", ref)
                    .param("kind", kind)
                    .param("value", kind.equals("BASE") ? null : rule.value())
                    .param(
                            "rounding",
                            rule.rounding() == null ? "NONE" : rule.rounding().toUpperCase(Locale.ROOT))
                    .update();
        }
    }

    private void seedOrders(List<DemoData.Order> orders, Map<String, Long> productIds) {
        for (DemoData.Order o : orders) {
            String status = ORDER_STATUS.getOrDefault(o.status(), "NEW");
            long id = jdbc.sql("""
                            INSERT INTO orders (
                                number, channel, external_id, status, placed_at, confirm_deadline_at, customer_name,
                                customer_phone, city, delivery_method, delivery_address, payment_method, ttn, ttn_status,
                                comment, cancel_reason, total)
                            VALUES (
                                :number, :channel, :external, :status, :placedAt, :deadline, :customerName,
                                :customerPhone, :city, :delivery, :address, :payment, :ttn, :ttnStatus,
                                :comment, :cancelReason, :total)
                            RETURNING id
                            """)
                    .param("number", o.id())
                    .param("channel", o.channel().toUpperCase(Locale.ROOT))
                    .param("external", o.externalId())
                    .param("status", status)
                    .param("placedAt", kyiv(o.createdAt()))
                    .param(
                            "deadline",
                            o.confirmDeadlineMinutes() == null
                                    ? null
                                    : OffsetDateTime.now().plusMinutes(o.confirmDeadlineMinutes()))
                    .param("customerName", o.customerName())
                    .param("customerPhone", o.customerPhone())
                    .param("city", o.city())
                    .param("delivery", o.delivery())
                    .param("address", o.deliveryAddress())
                    .param("payment", o.payment())
                    .param("ttn", o.ttn())
                    .param("ttnStatus", o.ttnStatus())
                    .param("comment", o.comment())
                    .param("cancelReason", o.cancelReason())
                    .param("total", o.total())
                    .query(Long.class)
                    .single();
            for (DemoData.OrderItem item : o.items()) {
                jdbc.sql("""
                                INSERT INTO order_items (order_id, product_id, sku, name, qty, price, old_price)
                                VALUES (:order, :product, :sku, :name, :qty, :price, :oldPrice)
                                """)
                        .param("order", id)
                        .param("product", productIds.get(item.sku()))
                        .param("sku", item.sku())
                        .param("name", item.name())
                        .param("qty", item.qty() == null ? 1 : item.qty())
                        .param("price", item.price())
                        .param("oldPrice", positiveOrNull(item.oldPrice()))
                        .update();
            }
            if (o.history() == null) {
                continue;
            }
            for (DemoData.HistoryEntry entry : o.history()) {
                jdbc.sql("""
                                INSERT INTO order_status_history (order_id, to_status, at, source, note)
                                VALUES (:order, :status, :at, :source, :note)
                                """)
                        .param("order", id)
                        .param("status", status)
                        .param("at", kyiv(entry.at()))
                        .param("source", "Система".equals(entry.who()) ? "SYSTEM" : "USER")
                        .param("note", entry.text())
                        .update();
            }
        }
    }

    private void seedProductHistory(List<DemoData.ProductHistory> history, Map<String, Long> productIds) {
        for (DemoData.ProductHistory entry : history) {
            jdbc.sql("""
                            INSERT INTO audit_log (at, entity_type, entity_id, sku, kind, message)
                            VALUES (:at, 'PRODUCT', :product, :sku, :kind, :message)
                            """)
                    .param("at", kyiv(entry.at()))
                    .param("product", productIds.get(entry.sku()))
                    .param("sku", entry.sku())
                    .param("kind", AUDIT_KIND.getOrDefault(entry.kind(), "FIELDS"))
                    .param("message", entry.text())
                    .update();
        }
    }

    private <T> T read(String file, TypeReference<T> type) {
        return json.readValue(dataDir.resolve(file).toFile(), type);
    }

    private static OffsetDateTime kyiv(String localDateTime) {
        return LocalDateTime.parse(localDateTime).atZone(KYIV).toOffsetDateTime();
    }

    /** "48 × 38 × 9" → length, width, height. */
    private static BigDecimal[] dimensions(String value) {
        BigDecimal[] result = new BigDecimal[3];
        if (value == null) {
            return result;
        }
        String[] parts = value.split("[×xX]");
        for (int i = 0; i < Math.min(parts.length, 3); i++) {
            try {
                result[i] = positiveOrNull(new BigDecimal(parts[i].trim().replace(',', '.')));
            } catch (NumberFormatException e) {
                result[i] = null;
            }
        }
        return result;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static BigDecimal positiveOrNull(BigDecimal value) {
        return value != null && value.signum() > 0 ? value : null;
    }
}

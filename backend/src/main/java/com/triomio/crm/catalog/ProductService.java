package com.triomio.crm.catalog;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.catalog.ProductDtos.HistoryItem;
import com.triomio.crm.catalog.ProductDtos.ProductView;
import com.triomio.crm.inventory.InventoryService;
import com.triomio.crm.pricing.PriceCalculator;
import com.triomio.crm.shared.ApiProblemException;
import com.triomio.crm.shared.WireLabels;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ProductService {

    private static final Pattern TM_SKU = Pattern.compile("^TM-(\\d+)$");

    private final JdbcClient jdbc;
    private final InventoryService inventory;
    private final PriceCalculator prices;
    private final Clock clock;

    ProductService(JdbcClient jdbc, InventoryService inventory, PriceCalculator prices, Clock clock) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.prices = prices;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    List<ProductView> list() {
        return loadAll(false);
    }

    @Transactional(readOnly = true)
    ProductView get(String sku) {
        return loadOne(sku, true);
    }

    @Transactional
    ProductView create(CurrentUser actor) {
        int next = jdbc.sql("SELECT sku FROM products WHERE sku LIKE 'TM-%'").query(String.class).list().stream()
                        .map(TM_SKU::matcher)
                        .filter(Matcher::matches)
                        .mapToInt(m -> Integer.parseInt(m.group(1)))
                        .max()
                        .orElse(10000)
                + 1;
        String sku = "TM-" + next;
        long id = jdbc.sql("""
                        INSERT INTO products (sku, status, name_uk, condition_uk, condition_ru, updated_by)
                        VALUES (:sku, 'DRAFT', '', 'Новий', 'Новый', :actor)
                        RETURNING id
                        """)
                .param("sku", sku)
                .param("actor", actor.id())
                .query(Long.class)
                .single();
        jdbc.sql("INSERT INTO stock (product_id, total, reserve) VALUES (:id, 0, 0)")
                .param("id", id)
                .update();
        for (String mp : List.of("ROZETKA", "EPICENTR", "PROM")) {
            jdbc.sql("""
                            INSERT INTO product_channels (product_id, marketplace, enabled, external_id)
                            VALUES (:id, :mp, false, :ext)
                            """)
                    .param("id", id)
                    .param("mp", mp)
                    .param("ext", sku.replace("-", "") + "-" + mp.charAt(0))
                    .update();
        }
        writeAudit(actor.id(), id, sku, "STATUS", "Створено чернетку товару");
        return loadOne(sku, true);
    }

    @Transactional
    ProductView patch(CurrentUser actor, String sku, Map<String, Object> body) {
        Row row = findRow(sku);
        if (body.containsKey("total")) {
            int total = ((Number) body.get("total")).intValue();
            if (total < row.reserve()) {
                throw new ApiProblemException(
                        HttpStatus.BAD_REQUEST, "INVALID_STOCK", "Всього не може бути менше резерву");
            }
            inventory.setTotal(row.id(), total, "ручна правка");
        }
        if (body.containsKey("awaiting")) {
            jdbc.sql("UPDATE stock SET awaiting = :a, updated_at = now() WHERE product_id = :id")
                    .param("a", Boolean.TRUE.equals(body.get("awaiting")))
                    .param("id", row.id())
                    .update();
        }

        Long brandId = row.brandId();
        if (body.containsKey("brand")) {
            String brand = stringOrEmpty(body.get("brand"));
            brandId = brand.isBlank() ? null : upsertBrand(brand);
        }
        Long categoryId = row.categoryId();
        if (body.containsKey("category")) {
            String category = stringOrEmpty(body.get("category"));
            categoryId = category.isBlank() ? null : findCategoryByName(category);
        }
        String status = row.status();
        if (body.containsKey("status")) {
            status = WireLabels.productStatusCode(stringOrEmpty(body.get("status")));
        }

        BigDecimal[] dims = parseDims(
                body.containsKey("dimensionsCm") ? stringOrEmpty(body.get("dimensionsCm")) : row.dimensionsCm());

        jdbc.sql("""
                        UPDATE products SET
                          name_uk = coalesce(:nameUk, name_uk),
                          name_ru = coalesce(:nameRu, name_ru),
                          description_uk = coalesce(:descUk, description_uk),
                          description_ru = coalesce(:descRu, description_ru),
                          brand_id = :brandId,
                          category_id = :categoryId,
                          status = :status,
                          model = coalesce(:model, model),
                          barcode = coalesce(:barcode, barcode),
                          country_uk = coalesce(:countryUk, country_uk),
                          country_ru = coalesce(:countryRu, country_ru),
                          weight_kg = coalesce(:weight, weight_kg),
                          length_cm = :length, width_cm = :width, height_cm = :height,
                          base_price = coalesce(:price, base_price),
                          old_price = :oldPrice,
                          condition_uk = coalesce(:condUk, condition_uk),
                          condition_ru = coalesce(:condRu, condition_ru),
                          color_uk = coalesce(:colorUk, color_uk),
                          color_ru = coalesce(:colorRu, color_ru),
                          age_group_uk = coalesce(:ageUk, age_group_uk),
                          age_group_ru = coalesce(:ageRu, age_group_ru),
                          material_uk = coalesce(:matUk, material_uk),
                          material_ru = coalesce(:matRu, material_ru),
                          type_uk = coalesce(:typeUk, type_uk),
                          type_ru = coalesce(:typeRu, type_ru),
                          parts_count = coalesce(:parts, parts_count),
                          series_uk = coalesce(:seriesUk, series_uk),
                          series_ru = coalesce(:seriesRu, series_ru),
                          updated_at = now(), updated_by = :actor
                        WHERE id = :id
                        """)
                .param("id", row.id())
                .param("actor", actor.id())
                .param("brandId", brandId)
                .param("categoryId", categoryId)
                .param("status", status)
                .param("nameUk", optString(body, "name"))
                .param("nameRu", optString(body, "nameRu"))
                .param("descUk", optString(body, "description"))
                .param("descRu", optString(body, "descriptionRu"))
                .param("model", optString(body, "model"))
                .param("barcode", optString(body, "barcode"))
                .param("countryUk", optString(body, "country"))
                .param("countryRu", optString(body, "countryRu"))
                .param("weight", optNumber(body, "weightKg"))
                .param("length", dims[0])
                .param("width", dims[1])
                .param("height", dims[2])
                .param("price", optNumber(body, "price"))
                .param(
                        "oldPrice",
                        body.containsKey("oldPrice")
                                ? (body.get("oldPrice") == null ? null : number(body.get("oldPrice")))
                                : row.oldPrice())
                .param("condUk", optString(body, "condition"))
                .param("condRu", optString(body, "conditionRu"))
                .param("colorUk", optString(body, "color"))
                .param("colorRu", optString(body, "colorRu"))
                .param("ageUk", optString(body, "ageGroup"))
                .param("ageRu", optString(body, "ageGroupRu"))
                .param("matUk", optString(body, "material"))
                .param("matRu", optString(body, "materialRu"))
                .param("typeUk", optString(body, "type"))
                .param("typeRu", optString(body, "typeRu"))
                .param("parts", body.containsKey("partsCount") ? (Integer) body.get("partsCount") : null)
                .param("seriesUk", optString(body, "series"))
                .param("seriesRu", optString(body, "seriesRu"))
                .update();

        if (body.get("channels") instanceof Map<?, ?> channels) {
            for (var e : channels.entrySet()) {
                String mp = WireLabels.marketplaceCode(String.valueOf(e.getKey()));
                String label = String.valueOf(e.getValue());
                boolean enabled = "Активний".equals(label);
                String moderation = "—".equals(label) ? null : label;
                jdbc.sql("""
                                UPDATE product_channels SET enabled = :en, moderation_status = :mod
                                WHERE product_id = :id AND marketplace = :mp
                                """)
                        .param("id", row.id())
                        .param("mp", mp)
                        .param("en", enabled)
                        .param("mod", moderation)
                        .update();
            }
        }
        return loadOne(sku, true);
    }

    @Transactional(readOnly = true)
    List<HistoryItem> history(String sku) {
        findRow(sku);
        record R(
                OffsetDateTime at,
                String sku,
                String message,
                String kind,
                @Nullable String who) {}
        return jdbc.sql("""
                        SELECT a.at, a.sku, a.message, a.kind, u.full_name AS who
                        FROM audit_log a
                        LEFT JOIN users u ON u.id = a.actor_user_id
                        WHERE a.entity_type = 'PRODUCT' AND a.sku = :sku
                        ORDER BY a.at DESC
                        """).param("sku", sku).query(R.class).list().stream()
                .map(r -> new HistoryItem(
                        r.at().atZoneSameInstant(WireLabels.KYIV)
                                .toLocalDateTime()
                                .format(WireLabels.LOCAL_ISO),
                        r.sku(),
                        r.message(),
                        r.who() == null ? "Система" : r.who(),
                        WireLabels.auditKind(r.kind())))
                .toList();
    }

    private List<ProductView> loadAll(boolean withPrices) {
        return jdbc.sql("SELECT sku FROM products ORDER BY updated_at DESC").query(String.class).list().stream()
                .map(sku -> loadOne(sku, withPrices))
                .toList();
    }

    private ProductView loadOne(String sku, boolean withPrices) {
        Row row = findRow(sku);
        Map<String, String> channels = new LinkedHashMap<>();
        channels.put("rozetka", "—");
        channels.put("epicentr", "—");
        channels.put("prom", "—");
        jdbc.sql("""
                        SELECT marketplace, enabled, moderation_status FROM product_channels WHERE product_id = :id
                        """)
                .param("id", row.id())
                .query((rs, i) -> {
                    channels.put(
                            WireLabels.marketplaceWire(rs.getString("marketplace")),
                            WireLabels.channelLabel(rs.getBoolean("enabled"), rs.getString("moderation_status")));
                    return null;
                })
                .list();
        String statusUa = WireLabels.productStatus(row.status());
        String sync = WireLabels.syncStatus(statusUa, channels);
        Map<String, com.triomio.crm.pricing.PriceCalculator.MarketplacePrice> mp =
                withPrices ? prices.forProduct(row.basePrice(), row.oldPrice(), row.categoryId(), row.sku()) : null;
        return new ProductView(
                row.sku(),
                empty(row.nameUk()),
                empty(row.brandName()),
                empty(row.categoryName()),
                statusUa,
                row.basePrice() == null ? 0 : row.basePrice(),
                row.oldPrice(),
                row.total(),
                row.reserve(),
                row.available(),
                WireLabels.stockLabel(row.available(), row.awaiting()),
                channels,
                sync,
                null,
                empty(row.model()),
                empty(row.barcode()),
                row.weightKg(),
                empty(row.dimensionsCm()),
                empty(row.countryUk()),
                empty(row.descriptionUk()),
                empty(row.nameRu()),
                empty(row.descriptionRu()),
                empty(row.countryRu()),
                row.brandName() == null || row.brandName().isBlank(),
                row.duplicateSku(),
                row.updatedAt()
                        .atZoneSameInstant(WireLabels.KYIV)
                        .toLocalDateTime()
                        .format(WireLabels.LOCAL_ISO),
                empty(row.updatedByName()),
                row.conditionUk(),
                row.conditionRu(),
                row.colorUk(),
                row.colorRu(),
                row.ageGroupUk(),
                row.ageGroupRu(),
                row.materialUk(),
                row.materialRu(),
                row.typeUk(),
                row.typeRu(),
                row.partsCount(),
                row.seriesUk(),
                row.seriesRu(),
                row.awaiting(),
                mp);
    }

    private record Row(
            long id,
            String sku,
            String status,
            @Nullable String nameUk,
            @Nullable String nameRu,
            @Nullable String descriptionUk,
            @Nullable String descriptionRu,
            @Nullable Long brandId,
            @Nullable String brandName,
            @Nullable Long categoryId,
            @Nullable String categoryName,
            @Nullable String model,
            @Nullable String barcode,
            @Nullable String countryUk,
            @Nullable String countryRu,
            @Nullable BigDecimal weightKg,
            @Nullable String dimensionsCm,
            @Nullable BigDecimal basePrice,
            @Nullable BigDecimal oldPrice,
            int total,
            int reserve,
            int available,
            boolean awaiting,
            @Nullable String conditionUk,
            @Nullable String conditionRu,
            @Nullable String colorUk,
            @Nullable String colorRu,
            @Nullable String ageGroupUk,
            @Nullable String ageGroupRu,
            @Nullable String materialUk,
            @Nullable String materialRu,
            @Nullable String typeUk,
            @Nullable String typeRu,
            @Nullable Integer partsCount,
            @Nullable String seriesUk,
            @Nullable String seriesRu,
            @Nullable String duplicateSku,
            OffsetDateTime updatedAt,
            @Nullable String updatedByName) {}

    private Row findRow(String sku) {
        return jdbc.sql("""
                        SELECT p.id, p.sku, p.status, p.name_uk, p.name_ru, p.description_uk, p.description_ru,
                               p.brand_id, b.name AS brand_name, p.category_id, c.name AS category_name,
                               p.model, p.barcode, p.country_uk, p.country_ru, p.weight_kg,
                               CASE WHEN p.length_cm IS NULL THEN NULL
                                    ELSE trim(to_char(p.length_cm, 'FM999999990.0')) || ' × '
                                         || trim(to_char(p.width_cm, 'FM999999990.0')) || ' × '
                                         || trim(to_char(p.height_cm, 'FM999999990.0')) END AS dimensions_cm,
                               p.base_price, p.old_price, s.total, s.reserve, s.available, s.awaiting,
                               p.condition_uk, p.condition_ru, p.color_uk, p.color_ru,
                               p.age_group_uk, p.age_group_ru, p.material_uk, p.material_ru,
                               p.type_uk, p.type_ru, p.parts_count, p.series_uk, p.series_ru,
                               d.sku AS duplicate_sku, p.updated_at, u.full_name AS updated_by_name
                        FROM products p
                        JOIN stock s ON s.product_id = p.id
                        LEFT JOIN brands b ON b.id = p.brand_id
                        LEFT JOIN categories c ON c.id = p.category_id
                        LEFT JOIN products d ON d.id = p.duplicate_of
                        LEFT JOIN users u ON u.id = p.updated_by
                        WHERE p.sku = :sku
                        """)
                .param("sku", sku)
                .query(Row.class)
                .optional()
                .orElseThrow(
                        () -> new ApiProblemException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "Товар не знайдено"));
    }

    private long upsertBrand(String name) {
        return jdbc.sql("""
                        INSERT INTO brands (name) VALUES (:name)
                        ON CONFLICT ((lower(name))) DO UPDATE SET name = excluded.name
                        RETURNING id
                        """)
                .param("name", name.strip())
                .query(Long.class)
                .optional()
                .orElseGet(() -> jdbc.sql("SELECT id FROM brands WHERE lower(name) = lower(:name)")
                        .param("name", name.strip())
                        .query(Long.class)
                        .single());
    }

    private @Nullable Long findCategoryByName(String name) {
        return jdbc.sql("SELECT id FROM categories WHERE name = :name LIMIT 1")
                .param("name", name.strip())
                .query(Long.class)
                .optional()
                .orElse(null);
    }

    private void writeAudit(@Nullable Long actor, long productId, String sku, String kind, String message) {
        jdbc.sql("""
                        INSERT INTO audit_log (actor_user_id, entity_type, entity_id, sku, kind, message)
                        VALUES (:actor, 'PRODUCT', :id, :sku, :kind, :message)
                        """)
                .param("actor", actor)
                .param("id", productId)
                .param("sku", sku)
                .param("kind", kind)
                .param("message", message)
                .update();
    }

    private static String empty(@Nullable String v) {
        return v == null ? "" : v;
    }

    private static String stringOrEmpty(@Nullable Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    private static @Nullable String optString(Map<String, Object> body, String key) {
        return body.containsKey(key) ? stringOrEmpty(body.get(key)) : null;
    }

    private static @Nullable BigDecimal optNumber(Map<String, Object> body, String key) {
        return body.containsKey(key) ? number(body.get(key)) : null;
    }

    private static @Nullable BigDecimal number(@Nullable Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        return new BigDecimal(String.valueOf(v));
    }

    private static BigDecimal[] parseDims(@Nullable String value) {
        BigDecimal[] result = new BigDecimal[3];
        if (value == null || value.isBlank()) {
            return result;
        }
        String[] parts = value.split("[×xX]");
        for (int i = 0; i < Math.min(parts.length, 3); i++) {
            try {
                result[i] = new BigDecimal(parts[i].trim().replace(',', '.'));
            } catch (NumberFormatException ignored) {
                result[i] = null;
            }
        }
        return result;
    }
}

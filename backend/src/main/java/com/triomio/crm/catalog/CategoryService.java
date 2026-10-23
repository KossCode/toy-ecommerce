package com.triomio.crm.catalog;

import com.triomio.crm.catalog.ProductDtos.CategoriesFile;
import com.triomio.crm.catalog.ProductDtos.CategoriesMeta;
import com.triomio.crm.catalog.ProductDtos.CategoryMapping;
import com.triomio.crm.catalog.ProductDtos.CategoryView;
import com.triomio.crm.catalog.ProductDtos.MarketplaceLeaf;
import com.triomio.crm.shared.ApiProblemException;
import com.triomio.crm.shared.WireLabels;
import java.time.Clock;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
class CategoryService {

    private static final DateTimeFormatter DICT_AT = DateTimeFormatter.ofPattern("d MMMM yyyy, HH:mm", WireLabels.UK);

    private final JdbcClient jdbc;
    private final Clock clock;
    private final JsonMapper json;

    CategoryService(JdbcClient jdbc, Clock clock, JsonMapper json) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.json = json;
    }

    @Transactional(readOnly = true)
    CategoriesFile get() {
        return build();
    }

    @Transactional
    CategoryView create(String name, @Nullable String parentId) {
        if (name == null || name.isBlank()) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Назва категорії обов'язкова");
        }
        Long parent = parentId == null || parentId.isBlank() ? null : Long.parseLong(parentId);
        long id = jdbc.sql("""
                        INSERT INTO categories (parent_id, name, sort_order)
                        VALUES (:parent, :name, coalesce((SELECT max(sort_order)+1 FROM categories), 0))
                        RETURNING id
                        """)
                .param("parent", parent)
                .param("name", name.strip())
                .query(Long.class)
                .single();
        return build().categories().stream()
                .filter(c -> c.id().equals(String.valueOf(id)))
                .findFirst()
                .orElseThrow();
    }

    @Transactional
    CategoryView update(
            String id, @Nullable String name, @Nullable String parentId, @Nullable Map<String, Object> mappings) {
        long categoryId = Long.parseLong(id);
        if (jdbc.sql("SELECT count(*) FROM categories WHERE id = :id")
                        .param("id", categoryId)
                        .query(Integer.class)
                        .single()
                == 0) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "CATEGORY_NOT_FOUND", "Категорію не знайдено");
        }
        if (name != null && !name.isBlank()) {
            jdbc.sql("UPDATE categories SET name = :name, updated_at = now() WHERE id = :id")
                    .param("name", name.strip())
                    .param("id", categoryId)
                    .update();
        }
        if (parentId != null) {
            Long parent = parentId.isBlank() ? null : Long.parseLong(parentId);
            if (parent != null && parent == categoryId) {
                throw new ApiProblemException(
                        HttpStatus.BAD_REQUEST, "INVALID_PARENT", "Категорія не може бути собі батьком");
            }
            jdbc.sql("UPDATE categories SET parent_id = :parent, updated_at = now() WHERE id = :id")
                    .param("parent", parent)
                    .param("id", categoryId)
                    .update();
        }
        if (mappings != null) {
            for (var e : mappings.entrySet()) {
                String mp = WireLabels.marketplaceCode(e.getKey());
                if (!(e.getValue() instanceof Map<?, ?> m)) {
                    continue;
                }
                Object leaf = m.get("leafId");
                if (leaf == null || String.valueOf(leaf).isBlank()) {
                    jdbc.sql("DELETE FROM category_mappings WHERE category_id = :id AND marketplace = :mp")
                            .param("id", categoryId)
                            .param("mp", mp)
                            .update();
                    continue;
                }
                String leafId = String.valueOf(leaf);
                String attr = jdbc.sql("""
                                SELECT attribute_set_code FROM marketplace_categories
                                WHERE marketplace = :mp AND external_id = :ext
                                """)
                        .param("mp", mp)
                        .param("ext", leafId)
                        .query(String.class)
                        .optional()
                        .orElse(null);
                jdbc.sql("""
                                INSERT INTO category_mappings (category_id, marketplace, external_category_id, attribute_set_code)
                                VALUES (:id, :mp, :ext, :attr)
                                ON CONFLICT (category_id, marketplace) DO UPDATE
                                  SET external_category_id = excluded.external_category_id,
                                      attribute_set_code = excluded.attribute_set_code
                                """)
                        .param("id", categoryId)
                        .param("mp", mp)
                        .param("ext", leafId)
                        .param("attr", attr)
                        .update();
            }
        }
        return build().categories().stream()
                .filter(c -> c.id().equals(id))
                .findFirst()
                .orElseThrow();
    }

    @Transactional
    CategoriesFile refreshDictionaries() {
        String stamp = ZonedDateTime.now(clock.withZone(WireLabels.KYIV)).format(DICT_AT);
        String value = json.writeValueAsString(stamp);
        jdbc.sql("""
                        INSERT INTO settings (key, value, updated_at) VALUES ('dictionaries.updated_at', :value::jsonb, now())
                        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()
                        """).param("value", value).update();
        return build();
    }

    private CategoriesFile build() {
        int productTotal =
                jdbc.sql("SELECT count(*) FROM products").query(Integer.class).single();
        int topLevel = jdbc.sql("SELECT count(*) FROM categories WHERE parent_id IS NULL")
                .query(Integer.class)
                .single();
        String dictAt = jdbc.sql("SELECT value #>> '{}' FROM settings WHERE key = 'dictionaries.updated_at'")
                .query(String.class)
                .optional()
                .orElse("—");

        Map<String, List<MarketplaceLeaf>> leaves = new LinkedHashMap<>();
        for (String mp : List.of("ROZETKA", "EPICENTR", "PROM")) {
            List<MarketplaceLeaf> list =
                    jdbc.sql("""
                            SELECT external_id AS id, name, attribute_set_code AS attribute_set
                            FROM marketplace_categories WHERE marketplace = :mp AND is_leaf
                            ORDER BY name
                            """).param("mp", mp).query(MarketplaceLeaf.class).list();
            leaves.put(WireLabels.marketplaceWire(mp), list);
        }

        record Cat(long id, String name, @Nullable Long parentId, int sortOrder, int productCount) {}
        List<Cat> cats = jdbc.sql("""
                        SELECT c.id, c.name, c.parent_id, c.sort_order,
                               (SELECT count(*) FROM products p WHERE p.category_id = c.id) AS product_count
                        FROM categories c ORDER BY c.sort_order, c.name
                        """).query(Cat.class).list();

        List<CategoryView> views = new ArrayList<>();
        for (Cat cat : cats) {
            Map<String, CategoryMapping> mappings = new LinkedHashMap<>();
            for (String wire : List.of("rozetka", "epicentr", "prom")) {
                mappings.put(wire, new CategoryMapping(null, null, null));
            }
            jdbc.sql("""
                            SELECT m.marketplace, m.external_category_id, mc.name, m.attribute_set_code
                            FROM category_mappings m
                            LEFT JOIN marketplace_categories mc
                              ON mc.marketplace = m.marketplace AND mc.external_id = m.external_category_id
                            WHERE m.category_id = :id
                            """)
                    .param("id", cat.id())
                    .query((rs, i) -> {
                        mappings.put(
                                WireLabels.marketplaceWire(rs.getString("marketplace")),
                                new CategoryMapping(
                                        rs.getString("external_category_id"),
                                        rs.getString("name"),
                                        rs.getString("attribute_set_code")));
                        return null;
                    })
                    .list();
            views.add(new CategoryView(
                    String.valueOf(cat.id()),
                    cat.name(),
                    cat.parentId() == null ? null : String.valueOf(cat.parentId()),
                    cat.productCount(),
                    cat.sortOrder(),
                    mappings));
        }
        return new CategoriesFile(new CategoriesMeta(topLevel, productTotal, dictAt), leaves, views);
    }
}

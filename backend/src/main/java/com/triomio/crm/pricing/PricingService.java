package com.triomio.crm.pricing;

import com.triomio.crm.shared.ApiProblemException;
import com.triomio.crm.shared.WireLabels;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PricingService {

    public record PriceRuleView(
            String id,
            String marketplace,
            String marketplaceLabel,
            String scope,
            String scopeLabel,
            String scopeLevel,
            @Nullable String scopeValue,
            String kind,
            @Nullable Number value,
            String ruleLabel,
            String rounding,
            String roundingLabel,
            int productCount) {}

    public record PricesFile(Map<String, Object> meta, List<PriceRuleView> rules) {}

    public record PreviewExample(String sku, String name, Number base, Number before, Number after) {}

    public record PricePreview(int count, int jumps, List<PreviewExample> examples) {}

    private final JdbcClient jdbc;

    PricingService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public PricesFile list() {
        List<PriceRuleView> rules = loadRules();
        return new PricesFile(
                Map.of("ruleCount", rules.size(), "rozetkaThresholdNote", "Rozetka: зміна >50% потребує підтвердження"),
                rules);
    }

    @Transactional(readOnly = true)
    public PricePreview preview(Map<String, Object> body) {
        Draft draft = draftFrom(body);
        List<PriceCalculator.Rule> existing = calculatorRules().stream()
                .filter(r -> {
                    if (body.get("excludeId") != null
                            && String.valueOf(body.get("excludeId")).equals(String.valueOf(r.id()))) {
                        return false;
                    }
                    return !(r.marketplace().equals(draft.marketplaceCode())
                            && r.scope().equals(draft.scopeCode())
                            && sameRef(r.scopeRefId(), draft.scopeRefId()));
                })
                .toList();
        PriceCalculator.Rule temp = new PriceCalculator.Rule(
                -1L,
                draft.marketplaceCode(),
                draft.scopeCode(),
                draft.scopeRefId(),
                draft.kindCode(),
                draft.value(),
                draft.roundingCode(),
                draft.scopeValue());
        List<PriceCalculator.Rule> withDraft = new ArrayList<>(existing);
        withDraft.add(temp);

        record Product(
                String sku,
                String name,
                @Nullable BigDecimal base,
                @Nullable Long categoryId) {}
        List<Product> products = jdbc.sql("""
                        SELECT sku, coalesce(name_uk, sku) AS name, base_price AS base, category_id
                        FROM products WHERE status <> 'ARCHIVE'
                        """).query(Product.class).list();
        List<PreviewExample> examples = new ArrayList<>();
        int jumps = 0;
        int count = 0;
        for (Product p : products) {
            PriceCalculator.Rule picked =
                    PriceCalculator.pick(withDraft, draft.marketplaceCode(), p.categoryId(), p.sku());
            if (picked == null || picked.id() != -1L) {
                continue;
            }
            count++;
            BigDecimal base = p.base() == null ? BigDecimal.ZERO : p.base();
            BigDecimal before = PriceCalculator.apply(
                            base, PriceCalculator.pick(existing, draft.marketplaceCode(), p.categoryId(), p.sku()))
                    .price();
            BigDecimal after = PriceCalculator.apply(base, temp).price();
            if (examples.size() < 8) {
                examples.add(new PreviewExample(p.sku(), p.name(), base, before, after));
            }
            if ("ROZETKA".equals(draft.marketplaceCode())
                    && (after.compareTo(before.multiply(BigDecimal.valueOf(1.5))) > 0
                            || after.compareTo(before.divide(BigDecimal.valueOf(2), 8, java.math.RoundingMode.HALF_UP))
                                    < 0)) {
                jumps++;
            }
        }
        return new PricePreview(count, jumps, examples);
    }

    @Transactional
    public PriceRuleView create(Map<String, Object> body) {
        Draft draft = draftFrom(body);
        deleteSameScope(draft.marketplaceCode(), draft.scopeCode(), draft.scopeRefId(), null);
        long id = jdbc.sql("""
                        INSERT INTO price_rules (marketplace, scope, scope_ref_id, kind, value, rounding)
                        VALUES (:mp, :scope, :ref, :kind, :value, :rounding) RETURNING id
                        """)
                .param("mp", draft.marketplaceCode())
                .param("scope", draft.scopeCode())
                .param("ref", draft.scopeRefId())
                .param("kind", draft.kindCode())
                .param("value", draft.value())
                .param("rounding", draft.roundingCode())
                .query(Long.class)
                .single();
        return loadRules().stream()
                .filter(r -> r.id().equals(String.valueOf(id)))
                .findFirst()
                .orElseThrow();
    }

    @Transactional
    public PriceRuleView update(String id, Map<String, Object> body) {
        long ruleId = Long.parseLong(id);
        if (jdbc.sql("SELECT count(*) FROM price_rules WHERE id = :id")
                        .param("id", ruleId)
                        .query(Integer.class)
                        .single()
                == 0) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "PRICE_RULE_NOT_FOUND", "Правило не знайдено");
        }
        Draft draft = draftFrom(body);
        deleteSameScope(draft.marketplaceCode(), draft.scopeCode(), draft.scopeRefId(), ruleId);
        jdbc.sql("""
                        UPDATE price_rules SET marketplace = :mp, scope = :scope, scope_ref_id = :ref,
                          kind = :kind, value = :value, rounding = :rounding, updated_at = now()
                        WHERE id = :id
                        """)
                .param("id", ruleId)
                .param("mp", draft.marketplaceCode())
                .param("scope", draft.scopeCode())
                .param("ref", draft.scopeRefId())
                .param("kind", draft.kindCode())
                .param("value", draft.value())
                .param("rounding", draft.roundingCode())
                .update();
        return loadRules().stream().filter(r -> r.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional
    public void delete(String id) {
        int n = jdbc.sql("DELETE FROM price_rules WHERE id = :id")
                .param("id", Long.parseLong(id))
                .update();
        if (n == 0) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "PRICE_RULE_NOT_FOUND", "Правило не знайдено");
        }
    }

    private List<PriceRuleView> loadRules() {
        record Row(
                long id,
                String marketplace,
                String scope,
                @Nullable Long scopeRefId,
                String kind,
                @Nullable BigDecimal value,
                String rounding,
                @Nullable String scopeName) {}
        List<Row> rows = jdbc.sql("""
                        SELECT r.id, r.marketplace, r.scope, r.scope_ref_id, r.kind, r.value, r.rounding,
                               CASE r.scope
                                 WHEN 'PRODUCT' THEN (SELECT sku FROM products WHERE id = r.scope_ref_id)
                                 WHEN 'CATEGORY' THEN (SELECT name FROM categories WHERE id = r.scope_ref_id)
                                 WHEN 'BRAND' THEN (SELECT name FROM brands WHERE id = r.scope_ref_id)
                                 ELSE NULL END AS scope_name
                        FROM price_rules r ORDER BY r.id
                        """).query(Row.class).list();
        List<PriceCalculator.Rule> calc = rows.stream()
                .map(r -> new PriceCalculator.Rule(
                        r.id(),
                        r.marketplace(),
                        r.scope(),
                        r.scopeRefId(),
                        r.kind(),
                        r.value(),
                        r.rounding(),
                        r.scopeName()))
                .toList();
        record Product(String sku, @Nullable Long categoryId) {}
        List<Product> products = jdbc.sql("SELECT sku, category_id FROM products")
                .query(Product.class)
                .list();
        List<PriceRuleView> views = new ArrayList<>();
        for (Row r : rows) {
            int count = 0;
            for (Product p : products) {
                PriceCalculator.Rule picked = PriceCalculator.pick(calc, r.marketplace(), p.categoryId(), p.sku());
                if (picked != null && picked.id() == r.id()) {
                    count++;
                }
            }
            String mpWire = WireLabels.marketplaceWire(r.marketplace());
            String scopeWire = r.scope().toLowerCase();
            String kindWire = r.kind().toLowerCase();
            String roundingWire = switch (r.rounding()) {
                case "UP_10" -> "up_10";
                case "DOWN_10" -> "down_10";
                case "UP_100" -> "up_100";
                case "DOWN_100" -> "down_100";
                case "TO_99" -> "to_99";
                default -> "none";
            };
            views.add(new PriceRuleView(
                    String.valueOf(r.id()),
                    mpWire,
                    marketplaceLabel(r.marketplace()),
                    scopeWire.equals("default") ? "default" : scopeWire,
                    scopeLabel(r.scope(), r.scopeName()),
                    scopeLevel(r.scope()),
                    "DEFAULT".equals(r.scope()) ? null : r.scopeName(),
                    kindWire,
                    r.value(),
                    PriceCalculator.ruleLabel(new PriceCalculator.Rule(
                            r.id(),
                            r.marketplace(),
                            r.scope(),
                            r.scopeRefId(),
                            r.kind(),
                            r.value(),
                            r.rounding(),
                            r.scopeName())),
                    roundingWire,
                    roundingLabel(roundingWire),
                    count));
        }
        return views;
    }

    private List<PriceCalculator.Rule> calculatorRules() {
        return jdbc.sql("""
                        SELECT r.id, r.marketplace, r.scope, r.scope_ref_id, r.kind, r.value, r.rounding,
                               CASE r.scope
                                 WHEN 'PRODUCT' THEN (SELECT sku FROM products WHERE id = r.scope_ref_id)
                                 WHEN 'CATEGORY' THEN (SELECT name FROM categories WHERE id = r.scope_ref_id)
                                 ELSE NULL END AS scope_name
                        FROM price_rules r
                        """).query(PriceCalculator.Rule.class).list();
    }

    private record Draft(
            String marketplaceCode,
            String scopeCode,
            @Nullable Long scopeRefId,
            @Nullable String scopeValue,
            String kindCode,
            @Nullable BigDecimal value,
            String roundingCode) {}

    private Draft draftFrom(Map<String, Object> body) {
        if (body.get("marketplace") == null || body.get("scope") == null || body.get("kind") == null) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Неповні дані правила");
        }
        String mp = WireLabels.marketplaceCode(String.valueOf(body.get("marketplace")));
        String scope = String.valueOf(body.get("scope")).toUpperCase();
        String kind = String.valueOf(body.get("kind")).toUpperCase();
        String rounding = roundingCode(body.get("rounding") == null ? "none" : String.valueOf(body.get("rounding")));
        BigDecimal rawValue = body.get("value") instanceof Number n ? BigDecimal.valueOf(n.doubleValue()) : null;
        BigDecimal value = "BASE".equals(kind) ? null : rawValue;
        Long ref = null;
        String requestedScope = body.get("scopeValue") == null ? null : String.valueOf(body.get("scopeValue"));
        if ("PRODUCT".equals(scope) && requestedScope != null) {
            ref = jdbc.sql("SELECT id FROM products WHERE sku = :sku")
                    .param("sku", requestedScope)
                    .query(Long.class)
                    .optional()
                    .orElseThrow(() -> new ApiProblemException(
                            HttpStatus.BAD_REQUEST, "PRODUCT_NOT_FOUND", "Немає товару " + requestedScope));
        } else if ("CATEGORY".equals(scope) && requestedScope != null) {
            ref = jdbc.sql("SELECT id FROM categories WHERE name = :name LIMIT 1")
                    .param("name", requestedScope)
                    .query(Long.class)
                    .optional()
                    .orElseThrow(() -> new ApiProblemException(
                            HttpStatus.BAD_REQUEST, "CATEGORY_NOT_FOUND", "Немає категорії " + requestedScope));
        }
        String scopeValue = "DEFAULT".equals(scope) ? null : requestedScope;
        return new Draft(mp, scope, ref, scopeValue, kind, value, rounding);
    }

    private void deleteSameScope(String mp, String scope, @Nullable Long ref, @Nullable Long keepId) {
        if (keepId == null) {
            jdbc.sql("""
                            DELETE FROM price_rules WHERE marketplace = :mp AND scope = :scope
                              AND coalesce(scope_ref_id, 0) = coalesce(:ref, 0)
                            """)
                    .param("mp", mp)
                    .param("scope", scope)
                    .param("ref", ref == null ? 0L : ref)
                    .update();
        } else {
            jdbc.sql("""
                            DELETE FROM price_rules WHERE marketplace = :mp AND scope = :scope
                              AND coalesce(scope_ref_id, 0) = coalesce(:ref, 0) AND id <> :keep
                            """)
                    .param("mp", mp)
                    .param("scope", scope)
                    .param("ref", ref == null ? 0L : ref)
                    .param("keep", keepId)
                    .update();
        }
    }

    private static boolean sameRef(@Nullable Long a, @Nullable Long b) {
        return java.util.Objects.equals(a, b);
    }

    private static String marketplaceLabel(String code) {
        return switch (code) {
            case "ROZETKA" -> "Rozetka";
            case "EPICENTR" -> "Epicentr";
            default -> "Prom";
        };
    }

    private static String scopeLabel(String scope, @Nullable String name) {
        return switch (scope) {
            case "DEFAULT" -> "За замовчуванням";
            default -> name == null ? "—" : name;
        };
    }

    private static String scopeLevel(String scope) {
        return switch (scope) {
            case "DEFAULT" -> "Маркетплейс";
            case "CATEGORY" -> "Категорія";
            case "PRODUCT" -> "Товар";
            case "BRAND" -> "Бренд";
            default -> scope;
        };
    }

    private static String roundingCode(String wire) {
        return switch (wire) {
            case "up_10" -> "UP_10";
            case "down_10" -> "DOWN_10";
            case "up_100" -> "UP_100";
            case "down_100" -> "DOWN_100";
            case "to_99" -> "TO_99";
            default -> "NONE";
        };
    }

    private static String roundingLabel(String wire) {
        return switch (wire) {
            case "up_10" -> "вгору до 10 грн";
            case "down_10" -> "вниз до 10 грн";
            case "up_100" -> "вгору до 100 грн";
            case "down_100" -> "вниз до 100 грн";
            case "to_99" -> "до *.99";
            default -> "—";
        };
    }
}

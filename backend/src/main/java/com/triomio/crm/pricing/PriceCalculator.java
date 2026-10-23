package com.triomio.crm.pricing;

import com.triomio.crm.shared.WireLabels;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Resolves marketplace prices from price_rules (product → category → default). */
@Component
public class PriceCalculator {

    public record MarketplacePrice(Number price, @Nullable Number oldPrice, String rule) {}

    public record Rule(
            long id,
            String marketplace,
            String scope,
            @Nullable Long scopeRefId,
            String kind,
            @Nullable BigDecimal value,
            String rounding,
            @Nullable String scopeName) {}

    private final JdbcClient jdbc;

    PriceCalculator(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, MarketplacePrice> forProduct(
            @Nullable BigDecimal base, @Nullable BigDecimal old, @Nullable Long categoryId, @Nullable String sku) {
        List<Rule> rules = jdbc.sql("""
                        SELECT r.id, r.marketplace, r.scope, r.scope_ref_id, r.kind, r.value, r.rounding,
                               CASE r.scope
                                 WHEN 'PRODUCT' THEN (SELECT sku FROM products WHERE id = r.scope_ref_id)
                                 WHEN 'CATEGORY' THEN (SELECT name FROM categories WHERE id = r.scope_ref_id)
                                 ELSE NULL END AS scope_name
                        FROM price_rules r
                        """).query(Rule.class).list();
        Map<String, MarketplacePrice> out = new HashMap<>();
        BigDecimal baseOrZero = base == null ? BigDecimal.ZERO : base;
        for (String mp : List.of("ROZETKA", "EPICENTR", "PROM")) {
            Rule rule = pick(rules, mp, categoryId, sku);
            Applied applied = apply(baseOrZero, rule);
            Number oldPrice = null;
            if (old != null) {
                if ("PROM".equals(mp)) {
                    oldPrice = old;
                } else if ("EPICENTR".equals(mp) && rule != null && "EXACT".equals(rule.kind())) {
                    oldPrice = old;
                } else {
                    oldPrice = apply(old, rule).price();
                }
            }
            out.put(WireLabels.marketplaceWire(mp), new MarketplacePrice(applied.price(), oldPrice, applied.label()));
        }
        return out;
    }

    public static @Nullable Rule pick(
            List<Rule> rules, String marketplace, @Nullable Long categoryId, @Nullable String sku) {
        Rule product = null;
        Rule category = null;
        Rule defaults = null;
        for (Rule r : rules) {
            if (!marketplace.equals(r.marketplace())) {
                continue;
            }
            switch (r.scope()) {
                case "PRODUCT" -> {
                    if (sku != null && sku.equals(r.scopeName())) {
                        product = r;
                    }
                }
                case "CATEGORY" -> {
                    if (categoryId != null && categoryId.equals(r.scopeRefId())) {
                        category = r;
                    }
                }
                case "DEFAULT" -> defaults = r;
                default -> {}
            }
        }
        if (product != null) {
            return product;
        }
        if (category != null) {
            return category;
        }
        return defaults;
    }

    public record Applied(BigDecimal price, String label) {}

    public static Applied apply(BigDecimal base, @Nullable Rule rule) {
        if (rule == null || "BASE".equals(rule.kind())) {
            return new Applied(scale(base), rule == null ? "Як базова ціна" : ruleLabel(rule));
        }
        if ("EXACT".equals(rule.kind())) {
            return new Applied(scale(rule.value() == null ? base : rule.value()), ruleLabel(rule));
        }
        BigDecimal next = base;
        if ("PERCENT".equals(rule.kind()) && rule.value() != null) {
            next = base.multiply(
                    BigDecimal.ONE.add(rule.value().divide(BigDecimal.valueOf(100), 8, RoundingMode.HALF_UP)));
        } else if ("AMOUNT".equals(rule.kind()) && rule.value() != null) {
            next = base.add(rule.value());
        }
        return new Applied(round(next, rule.rounding()), ruleLabel(rule));
    }

    public static String ruleLabel(Rule rule) {
        return switch (rule.kind()) {
            case "BASE" -> "Як базова ціна";
            case "EXACT" -> "Фіксована " + rule.value();
            case "PERCENT" -> (rule.value() != null && rule.value().signum() >= 0 ? "+" : "") + rule.value() + "%";
            case "AMOUNT" -> (rule.value() != null && rule.value().signum() >= 0 ? "+" : "") + rule.value() + " грн";
            default -> rule.kind();
        };
    }

    static BigDecimal round(BigDecimal n, String rounding) {
        return switch (rounding) {
            case "UP_10" -> n.divide(BigDecimal.TEN, 0, RoundingMode.CEILING).multiply(BigDecimal.TEN);
            case "DOWN_10" -> n.divide(BigDecimal.TEN, 0, RoundingMode.FLOOR).multiply(BigDecimal.TEN);
            case "UP_100" ->
                n.divide(BigDecimal.valueOf(100), 0, RoundingMode.CEILING).multiply(BigDecimal.valueOf(100));
            case "DOWN_100" ->
                n.divide(BigDecimal.valueOf(100), 0, RoundingMode.FLOOR).multiply(BigDecimal.valueOf(100));
            case "TO_99" -> BigDecimal.valueOf(Math.max(0.99, Math.ceil(n.doubleValue()) - 0.01));
            default -> scale(n);
        };
    }

    private static BigDecimal scale(BigDecimal n) {
        return n.setScale(2, RoundingMode.HALF_UP);
    }
}

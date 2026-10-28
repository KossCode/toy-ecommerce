package com.triomio.crm.feeds;

import com.triomio.crm.pricing.PriceCalculator;
import com.triomio.crm.shared.WireLabels;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Minimal YML/XML catalog for marketplace pull (full param mapping is stage 9.5 polish). */
@Component
public class FeedXmlBuilder {

    private final JdbcClient jdbc;
    private final PriceCalculator prices;
    private final FeedsProperties feeds;

    public FeedXmlBuilder(JdbcClient jdbc, PriceCalculator prices, FeedsProperties feeds) {
        this.jdbc = jdbc;
        this.prices = prices;
        this.feeds = feeds;
    }

    public int write(String marketplace, OutputStream out) throws IOException {
        record Row(
                String sku,
                String nameUk,
                @Nullable String nameRu,
                @Nullable BigDecimal basePrice,
                @Nullable BigDecimal oldPrice,
                @Nullable Long categoryId,
                int available) {}
        String sql = """
                SELECT p.sku, coalesce(p.name_uk, p.sku) AS name_uk, coalesce(p.name_ru, p.name_uk, p.sku) AS name_ru,
                       p.base_price AS base_price, p.old_price AS old_price, p.category_id AS category_id, s.available
                FROM products p
                JOIN product_channels c ON c.product_id = p.id AND c.marketplace = :mp AND c.enabled
                JOIN stock s ON s.product_id = p.id
                WHERE p.status = 'ACTIVE'
                """ + (feeds.includeDemo() ? "" : " AND NOT p.is_demo") + " ORDER BY p.sku";
        List<Row> rows = jdbc.sql(sql).param("mp", marketplace).query(Row.class).list();

        String wire = WireLabels.marketplaceWire(marketplace);
        Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        w.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        w.write("<yml_catalog date=\"");
        w.write(java.time.OffsetDateTime.now().toString());
        w.write("\">\n");
        w.write("  <shop>\n");
        w.write("    <name>Trio Mio</name>\n");
        w.write("    <offers>\n");
        for (Row row : rows) {
            Map<String, PriceCalculator.MarketplacePrice> mpPrices =
                    prices.forProduct(row.basePrice(), row.oldPrice(), row.categoryId(), row.sku());
            PriceCalculator.MarketplacePrice priced = mpPrices.get(wire);
            BigDecimal price = priced != null && priced.price() != null
                    ? new BigDecimal(priced.price().toString())
                    : row.basePrice();
            Number old = priced != null ? priced.oldPrice() : row.oldPrice();

            w.write("      <offer id=\"");
            w.write(escape(row.sku()));
            w.write("\" available=\"");
            w.write(row.available() > 0 ? "true" : "false");
            w.write("\">\n");
            w.write("        <name>");
            w.write(escape(row.nameUk()));
            w.write("</name>\n");
            if (row.nameRu() != null && !row.nameRu().isBlank()) {
                w.write("        <name_ru>");
                w.write(escape(row.nameRu()));
                w.write("</name_ru>\n");
            }
            if (price != null) {
                w.write("        <price>");
                w.write(price.toPlainString());
                w.write("</price>\n");
            }
            if (old != null) {
                w.write("        <oldprice>");
                w.write(new BigDecimal(old.toString()).toPlainString());
                w.write("</oldprice>\n");
            }
            w.write("        <currencyId>UAH</currencyId>\n");
            w.write("        <vendorCode>");
            w.write(escape(row.sku()));
            w.write("</vendorCode>\n");
            w.write("      </offer>\n");
        }
        w.write("    </offers>\n");
        w.write("  </shop>\n");
        w.write("</yml_catalog>\n");
        w.flush();
        return rows.size();
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}

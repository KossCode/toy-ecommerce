package com.triomio.crm.feeds;

import com.triomio.crm.media.MediaStorage;
import com.triomio.crm.pricing.PriceCalculator;
import com.triomio.crm.shared.WireLabels;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** YML/XML catalog for marketplace pull (params/attributes — later polish). */
@Component
public class FeedXmlBuilder {

    private final JdbcClient jdbc;
    private final PriceCalculator prices;
    private final FeedsProperties feeds;
    private final MediaStorage media;

    public FeedXmlBuilder(JdbcClient jdbc, PriceCalculator prices, FeedsProperties feeds, MediaStorage media) {
        this.jdbc = jdbc;
        this.prices = prices;
        this.feeds = feeds;
        this.media = media;
    }

    public int write(String marketplace, OutputStream out) throws IOException {
        record Row(
                long id,
                String sku,
                String nameUk,
                @Nullable String nameRu,
                @Nullable String descriptionUk,
                @Nullable String descriptionRu,
                @Nullable String brandName,
                @Nullable String barcode,
                @Nullable Long categoryId,
                @Nullable String categoryName,
                @Nullable String portalCategoryId,
                @Nullable BigDecimal basePrice,
                @Nullable BigDecimal oldPrice,
                int available) {}
        String sql = """
                SELECT p.id, p.sku, coalesce(p.name_uk, p.sku) AS name_uk, coalesce(p.name_ru, p.name_uk, p.sku) AS name_ru,
                       p.description_uk AS description_uk, p.description_ru AS description_ru,
                       b.name AS brand_name, p.barcode, p.category_id AS category_id, c.name AS category_name,
                       cm.external_category_id AS portal_category_id,
                       p.base_price AS base_price, p.old_price AS old_price, s.available
                FROM products p
                JOIN product_channels ch ON ch.product_id = p.id AND ch.marketplace = :mp AND ch.enabled
                JOIN stock s ON s.product_id = p.id
                LEFT JOIN brands b ON b.id = p.brand_id
                LEFT JOIN categories c ON c.id = p.category_id
                LEFT JOIN category_mappings cm ON cm.category_id = p.category_id AND cm.marketplace = :mp
                WHERE p.status = 'ACTIVE'
                """ + (feeds.includeDemo() ? "" : " AND NOT p.is_demo") + " ORDER BY p.sku";
        List<Row> rows = jdbc.sql(sql).param("mp", marketplace).query(Row.class).list();

        Map<Long, List<String>> picturesByProduct =
                loadPictures(rows.stream().map(Row::id).toList());

        String wire = WireLabels.marketplaceWire(marketplace);
        Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        w.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        w.write("<yml_catalog date=\"");
        w.write(java.time.OffsetDateTime.now().toString());
        w.write("\">\n");
        w.write("  <shop>\n");
        w.write("    <name>Trio Mio</name>\n");

        Set<Long> categoryIds = new LinkedHashSet<>();
        Map<Long, String> categoryNames = new LinkedHashMap<>();
        for (Row row : rows) {
            if (row.categoryId() != null) {
                categoryIds.add(row.categoryId());
                if (row.categoryName() != null) {
                    categoryNames.put(row.categoryId(), row.categoryName());
                }
            }
        }
        if (!categoryIds.isEmpty()) {
            w.write("    <categories>\n");
            for (Long cid : categoryIds) {
                w.write("      <category id=\"");
                w.write(Long.toString(cid));
                w.write("\">");
                w.write(escape(categoryNames.getOrDefault(cid, "cat-" + cid)));
                w.write("</category>\n");
            }
            w.write("    </categories>\n");
        }

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
            if (row.descriptionUk() != null && !row.descriptionUk().isBlank()) {
                w.write("        <description><![CDATA[");
                w.write(cdata(row.descriptionUk()));
                w.write("]]></description>\n");
                w.write("        <description_ua><![CDATA[");
                w.write(cdata(row.descriptionUk()));
                w.write("]]></description_ua>\n");
            }
            if (row.descriptionRu() != null && !row.descriptionRu().isBlank()) {
                w.write("        <description_ru><![CDATA[");
                w.write(cdata(row.descriptionRu()));
                w.write("]]></description_ru>\n");
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
            if (row.categoryId() != null) {
                w.write("        <categoryId>");
                w.write(Long.toString(row.categoryId()));
                w.write("</categoryId>\n");
            }
            if (row.portalCategoryId() != null && !row.portalCategoryId().isBlank()) {
                w.write("        <portal_category_id>");
                w.write(escape(row.portalCategoryId()));
                w.write("</portal_category_id>\n");
            }
            List<String> pics = picturesByProduct.getOrDefault(row.id(), List.of());
            for (String url : pics) {
                w.write("        <picture>");
                w.write(escape(url));
                w.write("</picture>\n");
            }
            if (row.brandName() != null && !row.brandName().isBlank()) {
                w.write("        <vendor>");
                w.write(escape(row.brandName()));
                w.write("</vendor>\n");
            }
            w.write("        <vendorCode>");
            w.write(escape(row.sku()));
            w.write("</vendorCode>\n");
            if (row.barcode() != null && !row.barcode().isBlank()) {
                w.write("        <barcode>");
                w.write(escape(row.barcode()));
                w.write("</barcode>\n");
            }
            w.write("        <quantity_in_stock>");
            w.write(Integer.toString(row.available()));
            w.write("</quantity_in_stock>\n");
            w.write("      </offer>\n");
        }
        w.write("    </offers>\n");
        w.write("  </shop>\n");
        w.write("</yml_catalog>\n");
        w.flush();
        return rows.size();
    }

    private Map<Long, List<String>> loadPictures(List<Long> productIds) {
        Map<Long, List<String>> map = new LinkedHashMap<>();
        if (productIds.isEmpty()) {
            return map;
        }
        for (Long id : productIds) {
            List<String> urls = jdbc.sql("""
                            SELECT storage_key FROM product_images WHERE product_id = :id ORDER BY position LIMIT 10
                            """).param("id", id).query(String.class).list().stream()
                    .map(key -> media.publicUrl(key).toString())
                    .toList();
            if (!urls.isEmpty()) {
                map.put(id, urls);
            }
        }
        return map;
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String cdata(String s) {
        return s.replace("]]>", "]]]]><![CDATA[>");
    }
}

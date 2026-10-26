package com.triomio.crm.feeds;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Minimal YML/XML catalog for marketplace pull (full param mapping is stage 9.5 polish). */
@Component
public class FeedXmlBuilder {

    private final JdbcClient jdbc;

    public FeedXmlBuilder(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public int write(String marketplace, OutputStream out) throws IOException {
        record Row(String sku, String nameUk, String nameRu, java.math.BigDecimal price, int available) {}
        List<Row> rows = jdbc.sql("""
                        SELECT p.sku, coalesce(p.name_uk, p.sku) AS name_uk, coalesce(p.name_ru, p.name_uk, p.sku) AS name_ru,
                               p.base_price AS price, s.available
                        FROM products p
                        JOIN product_channels c ON c.product_id = p.id AND c.marketplace = :mp AND c.enabled
                        JOIN stock s ON s.product_id = p.id
                        WHERE p.status = 'ACTIVE' AND NOT p.is_demo
                        ORDER BY p.sku
                        """).param("mp", marketplace).query(Row.class).list();

        Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        w.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        w.write("<yml_catalog date=\"");
        w.write(java.time.OffsetDateTime.now().toString());
        w.write("\">\n");
        w.write("  <shop>\n");
        w.write("    <name>Trio Mio</name>\n");
        w.write("    <offers>\n");
        for (Row row : rows) {
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
            if (row.price() != null) {
                w.write("        <price>");
                w.write(row.price().toPlainString());
                w.write("</price>\n");
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

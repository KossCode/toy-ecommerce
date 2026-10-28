package com.triomio.crm.integrations;

import com.triomio.crm.feeds.FeedXmlBuilder;
import com.triomio.crm.feeds.FeedsProperties;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Builds marketplace XML into {@link FeedsProperties#dir()} and records {@code feed_builds}. */
@Service
public class FeedBuildService {

    private final JdbcClient jdbc;
    private final FeedXmlBuilder builder;
    private final FeedsProperties feeds;

    public FeedBuildService(JdbcClient jdbc, FeedXmlBuilder builder, FeedsProperties feeds) {
        this.jdbc = jdbc;
        this.builder = builder;
        this.feeds = feeds;
    }

    @Transactional
    public void buildAll() {
        for (String mp : new String[] {"PROM", "ROZETKA", "EPICENTR"}) {
            build(mp);
        }
    }

    @Transactional
    public void build(String marketplace) {
        long id = jdbc.sql("""
                        INSERT INTO feed_builds (marketplace, status) VALUES (:mp, 'RUNNING')
                        RETURNING id
                        """).param("mp", marketplace).query(Long.class).single();
        try {
            Path dir = feeds.dir();
            Files.createDirectories(dir);
            Path target = feeds.fileFor(marketplace);
            Path tmp = dir.resolve(marketplace.toLowerCase() + ".xml.tmp");
            int items;
            try (OutputStream out = Files.newOutputStream(tmp)) {
                items = builder.write(marketplace, out);
            }
            Files.move(tmp, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            jdbc.sql("""
                            UPDATE feed_builds SET status = 'SUCCESS', finished_at = now(), items_count = :n
                            WHERE id = :id
                            """).param("n", items).param("id", id).update();
            jdbc.sql("DELETE FROM settings WHERE key = :key")
                    .param("key", "feeds.dirty." + marketplace)
                    .update();
        } catch (IOException | RuntimeException ex) {
            jdbc.sql("""
                            UPDATE feed_builds SET status = 'FAILED', finished_at = now(),
                              errors = jsonb_build_object('message', :err)
                            WHERE id = :id
                            """)
                    .param("err", ex.getMessage() == null ? ex.toString() : ex.getMessage())
                    .param("id", id)
                    .update();
            throw new IllegalStateException("Feed build failed for " + marketplace, ex);
        }
    }
}

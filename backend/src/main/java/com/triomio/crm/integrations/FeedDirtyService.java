package com.triomio.crm.integrations;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Marks marketplace feeds dirty on catalog changes and rebuilds after a debounce so owners do not wait for the
 * nightly safety cron.
 */
@Service
public class FeedDirtyService {

    private static final Logger log = LoggerFactory.getLogger(FeedDirtyService.class);
    private static final String KEY_PREFIX = "feeds.dirty.";
    private static final long DEBOUNCE_SECONDS = 60;
    private static final Set<String> MPS = Set.of("PROM", "ROZETKA", "EPICENTR");

    private final JdbcClient jdbc;
    private final FeedBuildService builds;

    public FeedDirtyService(JdbcClient jdbc, FeedBuildService builds) {
        this.jdbc = jdbc;
        this.builds = builds;
    }

    @Transactional
    public void mark(String marketplace) {
        if (!MPS.contains(marketplace)) {
            return;
        }
        String key = KEY_PREFIX + marketplace;
        String json = "\"" + Instant.now() + "\"";
        jdbc.sql("""
                        INSERT INTO settings (key, value, updated_at)
                        VALUES (:key, :value::jsonb, now())
                        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
                        """).param("key", key).param("value", json).update();
    }

    @Transactional
    public void markAll() {
        for (String mp : MPS) {
            mark(mp);
        }
    }

    @Transactional
    public void markForProduct(long productId) {
        List<String> mps =
                jdbc.sql("""
                        SELECT marketplace FROM product_channels
                        WHERE product_id = :id AND enabled
                        """).param("id", productId).query(String.class).list();
        for (String mp : mps) {
            mark(mp);
        }
    }

    @Transactional
    public void clear(String marketplace) {
        jdbc.sql("DELETE FROM settings WHERE key = :key")
                .param("key", KEY_PREFIX + marketplace)
                .update();
    }

    @Scheduled(fixedDelayString = "${app.feeds.dirty-poll-ms:15000}")
    public void processDue() {
        Instant cutoff = Instant.now().minusSeconds(DEBOUNCE_SECONDS);
        List<String> due = jdbc.sql("""
                        SELECT replace(key, 'feeds.dirty.', '') AS mp
                        FROM settings
                        WHERE key LIKE 'feeds.dirty.%'
                          AND (value #>> '{}')::timestamptz <= :cutoff::timestamptz
                        """)
                .param("cutoff", cutoff.toString())
                .query(String.class)
                .list();
        for (String mp : due) {
            try {
                builds.build(mp);
                clear(mp);
                log.info("Rebuilt dirty feed for {}", mp);
            } catch (RuntimeException ex) {
                log.warn("Dirty feed rebuild failed for {}: {}", mp, ex.toString());
            }
        }
    }
}

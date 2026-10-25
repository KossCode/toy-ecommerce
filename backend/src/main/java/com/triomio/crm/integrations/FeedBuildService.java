package com.triomio.crm.integrations;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Counts sellable non-demo SKUs per marketplace; real XML/YML files land with stage 9.5. */
@Service
public class FeedBuildService {

    private final JdbcClient jdbc;

    public FeedBuildService(JdbcClient jdbc) {
        this.jdbc = jdbc;
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
        int items = jdbc.sql("""
                        SELECT count(*) FROM products p
                        JOIN product_channels c ON c.product_id = p.id AND c.marketplace = :mp AND c.enabled
                        WHERE p.status = 'ACTIVE' AND NOT p.is_demo
                        """).param("mp", marketplace).query(Integer.class).single();
        jdbc.sql("""
                        UPDATE feed_builds SET status = 'SUCCESS', finished_at = now(), items_count = :n
                        WHERE id = :id
                        """).param("n", items).param("id", id).update();
    }
}

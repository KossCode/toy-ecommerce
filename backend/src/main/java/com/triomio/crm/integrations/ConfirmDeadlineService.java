package com.triomio.crm.integrations;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Finds NEW orders whose confirm deadline is within 30 minutes. Real alerts wait on open question Q4
 * (docs/backend/README.md §9.6).
 */
@Service
public class ConfirmDeadlineService {

    private static final Logger log = LoggerFactory.getLogger(ConfirmDeadlineService.class);

    private final JdbcClient jdbc;

    public ConfirmDeadlineService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public int scan() {
        int due = jdbc.sql("""
                        SELECT count(*) FROM orders
                        WHERE status = 'NEW' AND confirm_deadline_at IS NOT NULL
                          AND confirm_deadline_at <= now() + interval '30 minutes'
                          AND confirm_deadline_at > now()
                        """).query(Integer.class).single();
        if (due > 0) {
            log.info("ConfirmDeadline: {} order(s) need attention within 30 minutes", due);
        }
        return due;
    }
}

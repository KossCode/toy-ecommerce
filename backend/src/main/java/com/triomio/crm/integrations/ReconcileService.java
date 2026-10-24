package com.triomio.crm.integrations;

import com.triomio.crm.integrations.mode.IntegrationModeService;
import com.triomio.crm.integrations.mode.WriteMode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Daily read-only compare stub — logs a sync_log row; never auto-fixes (docs/backend/07-jobs-quartz.md). */
@Service
public class ReconcileService {

    private static final Logger log = LoggerFactory.getLogger(ReconcileService.class);

    private final JdbcClient jdbc;
    private final IntegrationModeService modes;

    public ReconcileService(JdbcClient jdbc, IntegrationModeService modes) {
        this.jdbc = jdbc;
        this.modes = modes;
    }

    @Transactional
    public void reconcileAll() {
        for (String mp : new String[] {"PROM", "ROZETKA", "EPICENTR"}) {
            WriteMode mode = modes.effectiveMode(mp);
            if (!mode.allowsRead()) {
                continue;
            }
            jdbc.sql("""
                            INSERT INTO sync_log (marketplace, operation, http_method, path, http_status, duration_ms,
                                                  response_excerpt)
                            VALUES (:mp, 'RECONCILE', 'GET', '/mock/reconcile', 200, 0, '{\"diffs\":0}')
                            """).param("mp", mp).update();
            log.info("Reconcile {}: 0 diffs (mock)", mp);
        }
    }
}

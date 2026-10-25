package com.triomio.crm.integrations;

import com.triomio.crm.integrations.mode.IntegrationModeService;
import com.triomio.crm.integrations.mode.WriteMode;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Stamps dictionaries.updated_at in settings; real marketplace fetches come with live clients. */
@Service
public class DictionariesRefreshService {

    private final JdbcClient jdbc;
    private final IntegrationModeService modes;

    public DictionariesRefreshService(JdbcClient jdbc, IntegrationModeService modes) {
        this.jdbc = jdbc;
        this.modes = modes;
    }

    @Transactional
    public void refresh() {
        for (String mp : new String[] {"ROZETKA", "EPICENTR", "PROM"}) {
            if (modes.effectiveMode(mp) == WriteMode.OFF) {
                continue;
            }
            jdbc.sql("""
                            INSERT INTO sync_log (marketplace, operation, http_method, path, http_status, duration_ms)
                            VALUES (:mp, 'DICTIONARIES', 'GET', '/mock/dictionaries', 200, 0)
                            """).param("mp", mp).update();
        }
        jdbc.sql("""
                        INSERT INTO settings (key, value, updated_at)
                        VALUES ('dictionaries.updated_at', to_jsonb(now()::text), now())
                        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
                        """).update();
    }
}

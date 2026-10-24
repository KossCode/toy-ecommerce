package com.triomio.crm.integrations;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Local profile: marketplaces stay OFF so mock jobs never look like live sync
 * (docs/backend/08-marketplace-sync.md §2, docs/backend/03-local-development.md).
 */
@Component
@Profile("local & !prod")
@Order(50)
class LocalIntegrationsBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LocalIntegrationsBootstrap.class);

    private final JdbcClient jdbc;

    LocalIntegrationsBootstrap(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        int updated = jdbc.sql("""
                        UPDATE integration_settings
                        SET mode = 'OFF', updated_at = now()
                        WHERE mode <> 'OFF' AND credentials_ciphertext IS NULL
                        """).update();
        if (updated > 0) {
            log.info("Local bootstrap: set {} marketplace(s) to OFF (no credentials)", updated);
        }
    }
}

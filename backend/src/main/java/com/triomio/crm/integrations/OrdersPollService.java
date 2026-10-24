package com.triomio.crm.integrations;

import com.triomio.crm.integrations.marketplace.MarketplaceClient;
import com.triomio.crm.integrations.mode.IntegrationModeService;
import com.triomio.crm.integrations.mode.WriteMode;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Thin poll loop used by OrdersPollJob — mock client returns no new orders until live clients exist. */
@Service
public class OrdersPollService {

    private final JdbcClient jdbc;
    private final IntegrationModeService modes;
    private final MarketplaceClient marketplaces;

    public OrdersPollService(JdbcClient jdbc, IntegrationModeService modes, MarketplaceClient marketplaces) {
        this.jdbc = jdbc;
        this.modes = modes;
        this.marketplaces = marketplaces;
    }

    @Transactional
    public void poll(String marketplace) {
        WriteMode mode = modes.effectiveMode(marketplace);
        if (!mode.allowsRead()) {
            return;
        }
        String cursor = jdbc.sql("SELECT orders_cursor FROM integration_settings WHERE marketplace = :mp")
                .param("mp", marketplace)
                .query(String.class)
                .optional()
                .orElse(null);
        String next = marketplaces.pollOrders(marketplace, cursor);
        jdbc.sql("""
                        UPDATE integration_settings SET orders_cursor = :cursor, updated_at = now()
                        WHERE marketplace = :mp
                        """).param("cursor", next).param("mp", marketplace).update();
    }
}

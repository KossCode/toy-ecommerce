package com.triomio.crm.integrations.marketplace;

import tools.jackson.databind.JsonNode;

/**
 * HTTP boundary to a marketplace. Local and test use {@link MockMarketplaceClient}; live clients come in stage 10.
 */
public interface MarketplaceClient {

    /** Poll orders changed after cursor; returns the cursor to persist. Never writes to the marketplace. */
    String pollOrders(String marketplace, String cursorOrNull);

    /** Push absolute stock. Called only when effective mode is LIVE. */
    void pushStock(String marketplace, long productId, JsonNode payload);

    /** Push absolute price. Called only when effective mode is LIVE. */
    void pushPrice(String marketplace, long productId, JsonNode payload);
}

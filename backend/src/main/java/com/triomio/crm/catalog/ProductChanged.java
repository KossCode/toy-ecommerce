package com.triomio.crm.catalog;

/**
 * Fired after a product patch commits field updates. Listeners in integrations enqueue outbox / mark feeds dirty.
 */
public record ProductChanged(long productId, boolean priceAffecting, boolean catalogAffecting) {}

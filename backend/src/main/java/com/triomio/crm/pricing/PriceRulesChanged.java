package com.triomio.crm.pricing;

/** Fired when a price rule is created, updated or deleted for a marketplace. */
public record PriceRulesChanged(String marketplace) {}

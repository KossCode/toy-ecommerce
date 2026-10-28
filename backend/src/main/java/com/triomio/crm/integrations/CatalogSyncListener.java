package com.triomio.crm.integrations;

import com.triomio.crm.catalog.ProductChanged;
import com.triomio.crm.inventory.StockChanged;
import com.triomio.crm.media.ProductImagesChanged;
import com.triomio.crm.pricing.PriceRulesChanged;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Marks marketplace feeds dirty when catalog, stock or price rules change. */
@Component
class CatalogSyncListener {

    private final FeedDirtyService dirty;

    CatalogSyncListener(FeedDirtyService dirty) {
        this.dirty = dirty;
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    void onStock(StockChanged event) {
        if (event.availableBefore() == event.after().available()) {
            return;
        }
        dirty.markForProduct(event.productId());
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    void onProduct(ProductChanged event) {
        if (event.priceAffecting() || event.catalogAffecting()) {
            dirty.markForProduct(event.productId());
        }
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    void onImages(ProductImagesChanged event) {
        dirty.markForProduct(event.productId());
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    void onRules(PriceRulesChanged event) {
        dirty.mark(event.marketplace());
    }
}

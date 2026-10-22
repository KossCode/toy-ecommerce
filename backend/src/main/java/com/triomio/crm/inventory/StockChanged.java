package com.triomio.crm.inventory;

/**
 * Published synchronously inside the transaction that changed the stock, so listeners (outbox, audit) commit or roll
 * back together with the change.
 */
public record StockChanged(Operation operation, int qty, int availableBefore, StockLevel after, String reason) {

    public enum Operation {
        RESERVE,
        RELEASE,
        SHIP,
        SET_TOTAL
    }

    public long productId() {
        return after.productId();
    }
}

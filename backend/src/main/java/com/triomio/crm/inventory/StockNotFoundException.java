package com.triomio.crm.inventory;

public class StockNotFoundException extends RuntimeException {

    public StockNotFoundException(long productId) {
        super("No stock row for product " + productId);
    }
}

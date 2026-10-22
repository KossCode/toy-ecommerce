package com.triomio.crm.inventory;

/** {@code awaiting} is the "Очікується" flag: a restock is expected, so an empty item is not shown as sold out. */
public record StockLevel(long productId, int total, int reserve, int available, boolean awaiting) {}

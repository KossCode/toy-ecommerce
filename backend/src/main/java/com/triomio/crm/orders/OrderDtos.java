package com.triomio.crm.orders;

import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

final class OrderDtos {

    private OrderDtos() {}

    record OrderItem(
            String sku,
            String name,
            int qty,
            Number price,
            @Nullable Number oldPrice) {}

    record HistoryEntry(String at, String text, String who) {}

    record StockHint(String sku, int available) {}

    record OrderView(
            String id,
            String channel,
            @Nullable String externalId,
            String createdAt,
            @Nullable String customerName,
            @Nullable String customerPhone,
            @Nullable String city,
            String status,
            @Nullable Integer confirmDeadlineMinutes,
            @Nullable String warehouse,
            String delivery,
            @Nullable String deliveryAddress,
            String payment,
            @Nullable String ttn,
            @Nullable String ttnStatus,
            @Nullable String comment,
            @Nullable String cancelReason,
            List<OrderItem> items,
            Number total,
            List<HistoryEntry> history,
            @Nullable String confirmLabel,
            @Nullable String itemsLabel,
            @Nullable List<StockHint> stock) {}

    record CreateOrderRequest(
            @Nullable String channel,
            String customerName,
            @Nullable String customerPhone,
            @Nullable String city,
            @Nullable String warehouse,
            @Nullable String delivery,
            @Nullable String deliveryAddress,
            @Nullable String deliveryType,
            @Nullable String deliveryPayer,
            @Nullable String payment,
            @Nullable String status,
            @Nullable String comment,
            List<Map<String, Object>> items) {}

    record CancelRequest(@Nullable String reason) {}
}

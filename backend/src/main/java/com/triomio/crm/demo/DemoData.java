package com.triomio.crm.demo;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** Shapes of the mock JSON files in data/ (the same files the Express mock and the Pages demo use). */
final class DemoData {

    private DemoData() {}

    record Product(
            String sku,
            String status,
            String name,
            String nameRu,
            String description,
            String descriptionRu,
            String brand,
            String category,
            BigDecimal price,
            BigDecimal oldPrice,
            Integer total,
            Integer reserve,
            Boolean awaiting,
            Map<String, String> channels,
            String model,
            String barcode,
            BigDecimal weightKg,
            String dimensionsCm,
            String country,
            String countryRu,
            String epicentrName,
            String color,
            String colorRu,
            String ageGroup,
            String ageGroupRu,
            String material,
            String materialRu,
            String type,
            String typeRu,
            Integer partsCount,
            String series,
            String seriesRu,
            String condition,
            String conditionRu,
            String duplicateOf) {}

    record Categories(Map<String, List<Leaf>> marketplaceLeaves, List<Category> categories) {}

    record Leaf(String id, String name, String attributeSet) {}

    record Category(String id, String parentId, String name, Integer sortOrder, Map<String, Mapping> mappings) {}

    record Mapping(String leafId, String name) {}

    record Prices(List<PriceRule> rules) {}

    record PriceRule(
            String marketplace, String scope, String scopeValue, String kind, BigDecimal value, String rounding) {}

    record Order(
            String id,
            String channel,
            String externalId,
            String createdAt,
            String customerName,
            String customerPhone,
            String city,
            String status,
            Integer confirmDeadlineMinutes,
            String delivery,
            String deliveryAddress,
            String payment,
            String ttn,
            String ttnStatus,
            String comment,
            String cancelReason,
            List<OrderItem> items,
            BigDecimal total,
            List<HistoryEntry> history) {}

    record OrderItem(String sku, String name, Integer qty, BigDecimal price, BigDecimal oldPrice) {}

    record HistoryEntry(String at, String text, String who) {}

    record ProductHistory(String at, String sku, String text, String who, String kind) {}
}

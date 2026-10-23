package com.triomio.crm.catalog;

import com.triomio.crm.pricing.PriceCalculator.MarketplacePrice;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

final class ProductDtos {

    private ProductDtos() {}

    record ProductView(
            String sku,
            String name,
            String brand,
            String category,
            String status,
            Number price,
            @Nullable Number oldPrice,
            int total,
            int reserve,
            int available,
            String stockLabel,
            Map<String, String> channels,
            String syncStatus,
            @Nullable String syncHint,
            String model,
            String barcode,
            @Nullable Number weightKg,
            String dimensionsCm,
            String country,
            String description,
            String nameRu,
            String descriptionRu,
            String countryRu,
            boolean brandMissing,
            @Nullable String duplicateOf,
            String updatedAt,
            String updatedBy,
            @Nullable String condition,
            @Nullable String conditionRu,
            @Nullable String color,
            @Nullable String colorRu,
            @Nullable String ageGroup,
            @Nullable String ageGroupRu,
            @Nullable String material,
            @Nullable String materialRu,
            @Nullable String type,
            @Nullable String typeRu,
            @Nullable Integer partsCount,
            @Nullable String series,
            @Nullable String seriesRu,
            boolean awaiting,
            @Nullable Map<String, MarketplacePrice> marketplacePrices) {}

    record HistoryItem(String at, String sku, String text, String who, String kind) {}

    record CategoryMapping(
            @Nullable String leafId,
            @Nullable String name,
            @Nullable String secondary) {}

    record CategoryView(
            String id,
            String name,
            @Nullable String parentId,
            int productCount,
            int sortOrder,
            Map<String, CategoryMapping> mappings) {}

    record MarketplaceLeaf(String id, String name, @Nullable String attributeSet) {}

    record CategoriesMeta(int topLevelCount, int productTotal, String dictionariesUpdatedAt) {}

    record CategoriesFile(
            CategoriesMeta meta, Map<String, List<MarketplaceLeaf>> marketplaceLeaves, List<CategoryView> categories) {}
}

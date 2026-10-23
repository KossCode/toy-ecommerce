package com.triomio.crm.dashboard;

import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

final class DashboardDtos {

    private DashboardDtos() {}

    record UserView(String name, String role) {}

    record MetaResponse(
            UserView user,
            String todayLabel,
            String todayIso,
            Map<String, Number> counts,
            Map<String, Object> overview) {}

    record TodoItem(
            String id,
            String channel,
            String customerName,
            Number total,
            String status,
            String action,
            String actionKind,
            boolean urgent) {}

    record IntegrationCard(String id, String name, String tabTone, String summary, boolean hasRetry) {}

    record LowStockSample(String sku, String name, int available) {}

    record OverviewResponse(
            MetaResponse meta,
            List<TodoItem> todo,
            List<IntegrationCard> integrations,
            @Nullable LowStockSample lowStockSample) {}
}

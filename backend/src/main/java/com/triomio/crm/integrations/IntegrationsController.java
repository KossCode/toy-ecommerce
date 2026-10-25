package com.triomio.crm.integrations;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.integrations.IntegrationsService.IntegrationsFile;
import com.triomio.crm.integrations.IntegrationsService.Marketplace;
import com.triomio.crm.integrations.mode.IntegrationModeService;
import com.triomio.crm.integrations.mode.WriteMode;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/integrations")
class IntegrationsController {

    private final IntegrationsService integrations;
    private final IntegrationModeService modes;

    IntegrationsController(IntegrationsService integrations, IntegrationModeService modes) {
        this.integrations = integrations;
        this.modes = modes;
    }

    @GetMapping
    IntegrationsFile list() {
        return integrations.list();
    }

    @PostMapping("/{id}/retry")
    Marketplace retry(@PathVariable String id) {
        return integrations.retry(id);
    }

    @PatchMapping("/{id}/mode")
    @PreAuthorize("hasRole('OWNER')")
    Map<String, Object> setMode(
            @AuthenticationPrincipal CurrentUser user, @PathVariable String id, @RequestBody Map<String, String> body) {
        WriteMode mode = modes.setMode(user, id, body.getOrDefault("mode", ""));
        return Map.of(
                "id",
                id,
                "mode",
                mode.name(),
                "effectiveMode",
                modes.effectiveMode(com.triomio.crm.shared.WireLabels.marketplaceCode(id))
                        .name(),
                "maxMode",
                modes.maxMode().name());
    }
}

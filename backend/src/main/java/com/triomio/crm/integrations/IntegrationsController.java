package com.triomio.crm.integrations;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.integrations.IntegrationsService.IntegrationsFile;
import com.triomio.crm.integrations.IntegrationsService.Marketplace;
import com.triomio.crm.integrations.credentials.CredentialsService;
import com.triomio.crm.integrations.mode.IntegrationModeService;
import com.triomio.crm.integrations.mode.WriteMode;
import com.triomio.crm.integrations.schedule.JobScheduleService;
import com.triomio.crm.shared.WireLabels;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/integrations")
class IntegrationsController {

    private final IntegrationsService integrations;
    private final IntegrationModeService modes;
    private final JobScheduleService schedules;
    private final CredentialsService credentials;
    private final OutboxQueryService outbox;

    IntegrationsController(
            IntegrationsService integrations,
            IntegrationModeService modes,
            JobScheduleService schedules,
            CredentialsService credentials,
            OutboxQueryService outbox) {
        this.integrations = integrations;
        this.modes = modes;
        this.schedules = schedules;
        this.credentials = credentials;
        this.outbox = outbox;
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
                modes.effectiveMode(WireLabels.marketplaceCode(id)).name(),
                "maxMode",
                modes.maxMode().name());
    }

    @PutMapping("/{id}/credentials")
    @PreAuthorize("hasRole('OWNER')")
    Map<String, Object> putCredentials(
            @AuthenticationPrincipal CurrentUser user, @PathVariable String id, @RequestBody Map<String, Object> body) {
        return credentials.save(user, id, body);
    }

    @PutMapping("/{id}/schedules/{flow}")
    @PreAuthorize("hasRole('OWNER')")
    Marketplace putSchedule(
            @AuthenticationPrincipal CurrentUser user,
            @PathVariable String id,
            @PathVariable String flow,
            @RequestBody Map<String, Object> body) {
        schedules.update(user, id, flow, body);
        return integrations.getOne(id);
    }

    @GetMapping("/{id}/products")
    IntegrationsService.SyncProductsPayload listProducts(@PathVariable String id) {
        return integrations.listProducts(id);
    }

    @GetMapping("/{id}/outbox")
    @PreAuthorize("hasAnyRole('OWNER', 'MANAGER')")
    OutboxQueryService.OutboxPayload listOutbox(@PathVariable String id) {
        return outbox.list(id);
    }

    @PatchMapping("/{id}/products")
    @PreAuthorize("hasAnyRole('OWNER', 'MANAGER')")
    IntegrationsService.SyncProductsPayload patchProducts(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        return integrations.patchProducts(id, body);
    }
}

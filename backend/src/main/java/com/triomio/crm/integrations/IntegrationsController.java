package com.triomio.crm.integrations;

import com.triomio.crm.integrations.IntegrationsService.IntegrationsFile;
import com.triomio.crm.integrations.IntegrationsService.Marketplace;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/integrations")
class IntegrationsController {

    private final IntegrationsService integrations;

    IntegrationsController(IntegrationsService integrations) {
        this.integrations = integrations;
    }

    @GetMapping
    IntegrationsFile list() {
        return integrations.list();
    }

    @PostMapping("/{id}/retry")
    Marketplace retry(@PathVariable String id) {
        return integrations.retry(id);
    }
}

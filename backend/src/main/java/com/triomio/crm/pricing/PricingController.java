package com.triomio.crm.pricing;

import com.triomio.crm.pricing.PricingService.PricePreview;
import com.triomio.crm.pricing.PricingService.PriceRuleView;
import com.triomio.crm.pricing.PricingService.PricesFile;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/prices")
class PricingController {

    private final PricingService pricing;

    PricingController(PricingService pricing) {
        this.pricing = pricing;
    }

    @GetMapping
    PricesFile list() {
        return pricing.list();
    }

    @PostMapping("/preview")
    PricePreview preview(@RequestBody Map<String, Object> body) {
        return pricing.preview(body);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('OWNER')")
    PriceRuleView create(@RequestBody Map<String, Object> body) {
        return pricing.create(body);
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasRole('OWNER')")
    PriceRuleView update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return pricing.update(id, body);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('OWNER')")
    Map<String, Boolean> delete(@PathVariable String id) {
        pricing.delete(id);
        return Map.of("ok", true);
    }
}

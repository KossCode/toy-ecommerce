package com.triomio.crm.jobs;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/jobs")
class JobsController {

    private final JobsService jobs;

    JobsController(JobsService jobs) {
        this.jobs = jobs;
    }

    @GetMapping
    @PreAuthorize("hasRole('OWNER')")
    Map<String, String> catalog() {
        return jobs.catalog();
    }

    @PostMapping("/{name}/trigger")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @PreAuthorize("hasRole('OWNER')")
    Map<String, String> trigger(@PathVariable String name) {
        jobs.trigger(name);
        return Map.of("ok", "true", "name", name);
    }
}

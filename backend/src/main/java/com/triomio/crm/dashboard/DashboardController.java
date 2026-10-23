package com.triomio.crm.dashboard;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.dashboard.DashboardDtos.MetaResponse;
import com.triomio.crm.dashboard.DashboardDtos.OverviewResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class DashboardController {

    private final DashboardService dashboard;

    DashboardController(DashboardService dashboard) {
        this.dashboard = dashboard;
    }

    @GetMapping("/meta")
    MetaResponse meta(@AuthenticationPrincipal CurrentUser user) {
        return dashboard.meta(user);
    }

    @GetMapping("/overview")
    OverviewResponse overview(@AuthenticationPrincipal CurrentUser user) {
        return dashboard.overview(user);
    }
}

package com.triomio.crm.orders;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.orders.OrderDtos.CancelRequest;
import com.triomio.crm.orders.OrderDtos.CreateOrderRequest;
import com.triomio.crm.orders.OrderDtos.OrderView;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
class OrdersController {

    private final OrderService orders;

    OrdersController(OrderService orders) {
        this.orders = orders;
    }

    @GetMapping
    List<OrderView> list() {
        return orders.list();
    }

    @GetMapping("/{id}")
    OrderView get(@PathVariable String id) {
        return orders.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    OrderView create(@AuthenticationPrincipal CurrentUser user, @RequestBody CreateOrderRequest body) {
        return orders.create(user, body);
    }

    @PostMapping("/{id}/confirm")
    OrderView confirm(@AuthenticationPrincipal CurrentUser user, @PathVariable String id) {
        return orders.confirm(user, id);
    }

    @PostMapping("/{id}/ttn")
    OrderView ttn(@AuthenticationPrincipal CurrentUser user, @PathVariable String id) {
        return orders.ttn(user, id);
    }

    @PostMapping("/{id}/cancel")
    OrderView cancel(
            @AuthenticationPrincipal CurrentUser user, @PathVariable String id, @RequestBody CancelRequest body) {
        return orders.cancel(user, id, body.reason());
    }
}

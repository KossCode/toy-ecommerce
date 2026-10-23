package com.triomio.crm.orders;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.inventory.InventoryService;
import com.triomio.crm.orders.OrderDtos.CreateOrderRequest;
import com.triomio.crm.orders.OrderDtos.HistoryEntry;
import com.triomio.crm.orders.OrderDtos.OrderItem;
import com.triomio.crm.orders.OrderDtos.OrderView;
import com.triomio.crm.orders.OrderDtos.StockHint;
import com.triomio.crm.shared.ApiProblemException;
import com.triomio.crm.shared.WireLabels;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class OrderService {

    private final JdbcClient jdbc;
    private final InventoryService inventory;
    private final Clock clock;

    OrderService(JdbcClient jdbc, InventoryService inventory, Clock clock) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    List<OrderView> list() {
        return jdbc.sql("SELECT number FROM orders ORDER BY placed_at DESC").query(String.class).list().stream()
                .map(n -> load(n, false))
                .toList();
    }

    @Transactional(readOnly = true)
    OrderView get(String number) {
        return load(number, true);
    }

    @Transactional
    OrderView create(CurrentUser actor, CreateOrderRequest body) {
        if (body.customerName() == null
                || body.customerName().isBlank()
                || body.items() == null
                || body.items().isEmpty()) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Потрібні клієнт і склад");
        }
        String delivery = body.delivery() == null ? "Нова Пошта" : body.delivery();
        if (!List.of("Нова Пошта", "Міст Експрес").contains(delivery)) {
            throw new ApiProblemException(
                    HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Оберіть Нову Пошту або Міст Експрес");
        }
        String statusUa = body.status() == null ? "Підтверджено" : body.status();
        if (!List.of("Чернетка", "Нове", "Підтверджено").contains(statusUa)) {
            statusUa = "Підтверджено";
        }
        String status = WireLabels.orderStatusCode(statusUa);
        boolean reserve = "NEW".equals(status) || "CONFIRMED".equals(status);
        String channel = WireLabels.channelCode(body.channel() == null ? "Instagram" : body.channel());
        String warehouse = body.warehouse() == null ? "Основний" : body.warehouse();
        String payment = body.payment() == null ? "Під час отримання" : body.payment();

        List<PreparedItem> items = prepareItems(body.items());
        if (reserve) {
            for (PreparedItem item : items) {
                inventory.reserve(item.productId(), item.qty(), "замовлення");
            }
        }

        BigDecimal total = items.stream()
                .map(i -> i.price().multiply(BigDecimal.valueOf(i.qty())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        String number = nextNumber();
        OffsetDateTime now = OffsetDateTime.now(clock);
        OffsetDateTime deadline = "NEW".equals(status) ? now.plusHours(24) : null;
        List<String> addressParts = new ArrayList<>();
        if (body.deliveryType() != null && !body.deliveryType().isBlank()) {
            addressParts.add(body.deliveryType());
        }
        if (body.deliveryAddress() != null && !body.deliveryAddress().isBlank()) {
            addressParts.add(body.deliveryAddress().strip());
        }
        String payer = body.deliveryPayer() == null ? "Отримувач" : body.deliveryPayer();
        addressParts.add("платник: " + payer);

        long id = jdbc.sql("""
                        INSERT INTO orders (
                          number, channel, status, placed_at, confirm_deadline_at, customer_name, customer_phone,
                          city, delivery_method, delivery_address, warehouse, payment_method, comment, total)
                        VALUES (
                          :number, :channel, :status, :placed, :deadline, :name, :phone,
                          :city, :delivery, :address, :warehouse, :payment, :comment, :total)
                        RETURNING id
                        """)
                .param("number", number)
                .param("channel", channel)
                .param("status", status)
                .param("placed", now)
                .param("deadline", deadline)
                .param("name", body.customerName().strip())
                .param("phone", blankToNull(body.customerPhone()))
                .param("city", blankToNull(body.city()))
                .param("delivery", delivery)
                .param("address", addressParts.isEmpty() ? null : String.join(" · ", addressParts))
                .param("warehouse", warehouse)
                .param("payment", payment)
                .param("comment", blankToNull(body.comment()))
                .param("total", total)
                .query(Long.class)
                .single();

        for (PreparedItem item : items) {
            jdbc.sql("""
                            INSERT INTO order_items (order_id, product_id, sku, name, qty, price, old_price)
                            VALUES (:order, :product, :sku, :name, :qty, :price, :old)
                            """)
                    .param("order", id)
                    .param("product", item.productId())
                    .param("sku", item.sku())
                    .param("name", item.name())
                    .param("qty", item.qty())
                    .param("price", item.price())
                    .param("old", item.oldPrice())
                    .update();
        }

        addHistory(
                id,
                null,
                status,
                actor.id(),
                "USER",
                "Створено вручну (" + WireLabels.channel(channel) + ") · " + statusUa + " · склад «" + warehouse
                        + "» · " + delivery + " · " + payment);
        if (reserve) {
            for (PreparedItem item : items) {
                addHistory(id, null, status, null, "SYSTEM", "Зарезервовано " + item.qty() + " шт. " + item.sku());
            }
        } else {
            addHistory(id, null, status, null, "SYSTEM", "Чернетка: залишок не резервовано");
        }
        return load(number, false);
    }

    @Transactional
    OrderView confirm(CurrentUser actor, String number) {
        Head head = head(number);
        if (!List.of("NEW", "DRAFT").contains(head.status())) {
            throw new ApiProblemException(
                    HttpStatus.BAD_REQUEST, "INVALID_STATUS", "Можна підтвердити лише нове або чернетку");
        }
        if ("DRAFT".equals(head.status())) {
            for (ItemRow item : items(head.id())) {
                if (item.productId() == null) {
                    throw new ApiProblemException(
                            HttpStatus.BAD_REQUEST, "PRODUCT_NOT_FOUND", "Немає товару " + item.sku());
                }
                int available = inventory.find(item.productId()).orElseThrow().available();
                if (available < item.qty()) {
                    throw new ApiProblemException(
                            HttpStatus.BAD_REQUEST,
                            "INSUFFICIENT_STOCK",
                            "Недостатньо " + item.sku() + ": доступно " + available + ", потрібно " + item.qty());
                }
                inventory.reserve(item.productId(), item.qty(), "підтвердження чернетки");
            }
            addHistory(
                    head.id(),
                    "DRAFT",
                    "CONFIRMED",
                    null,
                    "SYSTEM",
                    "Зарезервовано залишок при підтвердженні чернетки");
        }
        jdbc.sql("""
                        UPDATE orders SET status = 'CONFIRMED', confirm_deadline_at = null, updated_at = now()
                        WHERE id = :id
                        """).param("id", head.id()).update();
        addHistory(head.id(), head.status(), "CONFIRMED", actor.id(), "USER", "Підтверджено");
        return load(number, false);
    }

    @Transactional
    OrderView ttn(CurrentUser actor, String number) {
        Head head = head(number);
        if (!"CONFIRMED".equals(head.status())) {
            throw new ApiProblemException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_STATUS",
                    "Накладну можна створити лише для підтвердженого замовлення");
        }
        if (head.ttn() != null && !head.ttn().isBlank()) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "TTN_EXISTS", "ТТН вже створено");
        }
        String carrier = head.delivery() != null && head.delivery().contains("Міст") ? "ME" : "NP";
        String digits = number.replaceAll("\\D", "");
        long serialBase = digits.isEmpty() ? System.currentTimeMillis() % 10_000_000 : Long.parseLong(digits);
        String ttn = carrier + (2_040_000_000L + serialBase);
        jdbc.sql("""
                        UPDATE orders SET ttn = :ttn, ttn_status = 'Створено (мок)', updated_at = now() WHERE id = :id
                        """).param("ttn", ttn).param("id", head.id()).update();
        String cod = "Накладений платіж".equals(head.payment()) ? " · COD " + head.total() + " грн" : "";
        addHistory(
                head.id(),
                head.status(),
                head.status(),
                actor.id(),
                "USER",
                "Створено ТТН " + ttn + " · " + head.delivery() + cod);
        return load(number, false);
    }

    @Transactional
    OrderView cancel(CurrentUser actor, String number, @Nullable String reason) {
        if (reason == null || reason.isBlank()) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Вкажіть причину скасування");
        }
        Head head = head(number);
        if (List.of("CANCELLED", "DELIVERED").contains(head.status())) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "INVALID_STATUS", "Неможливо скасувати");
        }
        if (List.of("NEW", "CONFIRMED").contains(head.status())) {
            for (ItemRow item : items(head.id())) {
                if (item.productId() != null) {
                    inventory.release(item.productId(), item.qty(), "скасування замовлення");
                }
            }
        }
        jdbc.sql("""
                        UPDATE orders SET status = 'CANCELLED', cancel_reason = :reason,
                          confirm_deadline_at = null, updated_at = now() WHERE id = :id
                        """).param("reason", reason.strip()).param("id", head.id()).update();
        addHistory(head.id(), head.status(), "CANCELLED", actor.id(), "USER", "Скасовано: " + reason.strip());
        return load(number, false);
    }

    private OrderView load(String number, boolean withStock) {
        Head head = head(number);
        List<ItemRow> itemRows = items(head.id());
        List<OrderItem> items = itemRows.stream()
                .map(i -> new OrderItem(i.sku(), i.name(), i.qty(), i.price(), i.oldPrice()))
                .toList();
        List<HistoryEntry> history = jdbc.sql("""
                        SELECT h.at, h.note, u.full_name, h.source
                        FROM order_status_history h
                        LEFT JOIN users u ON u.id = h.actor_user_id
                        WHERE h.order_id = :id ORDER BY h.at
                        """)
                .param("id", head.id())
                .query((rs, i) -> new HistoryEntry(
                        rs.getObject("at", OffsetDateTime.class)
                                .atZoneSameInstant(WireLabels.KYIV)
                                .toLocalDateTime()
                                .format(WireLabels.LOCAL_ISO),
                        rs.getString("note") == null ? "" : rs.getString("note"),
                        "SYSTEM".equals(rs.getString("source"))
                                ? "Система"
                                : (rs.getString("full_name") == null ? "Користувач" : rs.getString("full_name"))))
                .list();
        Integer minutes = null;
        if (head.confirmDeadlineAt() != null) {
            minutes = (int) Math.max(
                    0,
                    Duration.between(OffsetDateTime.now(clock), head.confirmDeadlineAt())
                            .toMinutes());
        }
        String itemsLabel = items.size() == 1
                ? items.getFirst().sku() + " × " + items.getFirst().qty()
                : items.size() + " товари";
        List<StockHint> stock = null;
        if (withStock) {
            stock = itemRows.stream()
                    .map(i -> new StockHint(
                            i.sku(),
                            i.productId() == null
                                    ? 0
                                    : inventory
                                            .find(i.productId())
                                            .map(s -> s.available())
                                            .orElse(0)))
                    .toList();
        }
        return new OrderView(
                head.number(),
                WireLabels.channel(head.channel()),
                head.externalId(),
                head.placedAt()
                        .atZoneSameInstant(WireLabels.KYIV)
                        .toLocalDateTime()
                        .format(WireLabels.LOCAL_ISO),
                head.customerName(),
                head.customerPhone(),
                head.city(),
                WireLabels.orderStatus(head.status()),
                minutes,
                head.warehouse(),
                head.delivery() == null ? "" : head.delivery(),
                head.deliveryAddress(),
                head.payment() == null ? "" : head.payment(),
                head.ttn(),
                head.ttnStatus(),
                head.comment(),
                head.cancelReason(),
                items,
                head.total(),
                history,
                WireLabels.formatDeadline(minutes),
                itemsLabel,
                stock);
    }

    private record Head(
            long id,
            String number,
            String channel,
            @Nullable String externalId,
            String status,
            OffsetDateTime placedAt,
            @Nullable OffsetDateTime confirmDeadlineAt,
            @Nullable String customerName,
            @Nullable String customerPhone,
            @Nullable String city,
            @Nullable String warehouse,
            @Nullable String delivery,
            @Nullable String deliveryAddress,
            @Nullable String payment,
            @Nullable String ttn,
            @Nullable String ttnStatus,
            @Nullable String comment,
            @Nullable String cancelReason,
            BigDecimal total) {}

    private Head head(String number) {
        return jdbc.sql("""
                        SELECT id, number, channel, external_id, status, placed_at, confirm_deadline_at,
                               customer_name, customer_phone, city, warehouse, delivery_method AS delivery,
                               delivery_address, payment_method AS payment, ttn, ttn_status, comment,
                               cancel_reason, total
                        FROM orders WHERE number = :number
                        """)
                .param("number", number)
                .query(Head.class)
                .optional()
                .orElseThrow(() ->
                        new ApiProblemException(HttpStatus.NOT_FOUND, "ORDER_NOT_FOUND", "Замовлення не знайдено"));
    }

    private record ItemRow(
            @Nullable Long productId,
            String sku,
            String name,
            int qty,
            BigDecimal price,
            @Nullable BigDecimal oldPrice) {}

    private List<ItemRow> items(long orderId) {
        return jdbc.sql("""
                        SELECT product_id, sku, name, qty, price, old_price FROM order_items WHERE order_id = :id
                        """).param("id", orderId).query(ItemRow.class).list();
    }

    private record PreparedItem(
            long productId,
            String sku,
            String name,
            int qty,
            BigDecimal price,
            @Nullable BigDecimal oldPrice) {}

    private List<PreparedItem> prepareItems(List<Map<String, Object>> raw) {
        List<PreparedItem> out = new ArrayList<>();
        for (Map<String, Object> row : raw) {
            String sku = String.valueOf(row.get("sku"));
            record P(
                    long id,
                    String sku,
                    @Nullable String nameUk,
                    @Nullable BigDecimal basePrice,
                    @Nullable BigDecimal oldPrice) {}
            P product = jdbc.sql("SELECT id, sku, name_uk, base_price, old_price FROM products WHERE sku = :sku")
                    .param("sku", sku)
                    .query(P.class)
                    .optional()
                    .orElseThrow(() -> new ApiProblemException(
                            HttpStatus.BAD_REQUEST, "PRODUCT_NOT_FOUND", "Немає товару " + sku));
            int qty = Math.max(1, row.get("qty") instanceof Number n ? n.intValue() : 1);
            BigDecimal override = row.get("price") instanceof Number n ? BigDecimal.valueOf(n.doubleValue()) : null;
            BigDecimal catalog = product.basePrice() == null ? BigDecimal.ZERO : product.basePrice();
            BigDecimal price = override != null ? override : catalog;
            BigDecimal old = override != null && override.compareTo(catalog) != 0 ? catalog : product.oldPrice();
            out.add(new PreparedItem(
                    product.id(),
                    product.sku(),
                    product.nameUk() == null ? product.sku() : product.nameUk(),
                    qty,
                    price,
                    old));
        }
        return out;
    }

    private String nextNumber() {
        int max = jdbc.sql("SELECT number FROM orders WHERE number LIKE 'TM-%'").query(String.class).list().stream()
                .map(n -> n.replace("TM-", ""))
                .mapToInt(s -> {
                    try {
                        return Integer.parseInt(s);
                    } catch (NumberFormatException e) {
                        return 0;
                    }
                })
                .max()
                .orElse(10482);
        return "TM-" + (max + 1);
    }

    private void addHistory(
            long orderId, @Nullable String from, String to, @Nullable Long actor, String source, String note) {
        jdbc.sql("""
                        INSERT INTO order_status_history (order_id, from_status, to_status, actor_user_id, source, note)
                        VALUES (:order, :from, :to, :actor, :source, :note)
                        """)
                .param("order", orderId)
                .param("from", from)
                .param("to", to)
                .param("actor", actor)
                .param("source", source)
                .param("note", note)
                .update();
    }

    private static @Nullable String blankToNull(@Nullable String v) {
        return v == null || v.isBlank() ? null : v.strip();
    }
}

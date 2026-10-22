-- Orders from all channels. Marketplace orders are deduplicated by (channel, external_id).
CREATE TABLE orders (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number              text           NOT NULL UNIQUE,
    channel             text           NOT NULL
        CHECK (channel IN ('PROM', 'ROZETKA', 'EPICENTR', 'INSTAGRAM', 'MANUAL', 'SITE')),
    external_id         text,
    status              text           NOT NULL
        CHECK (status IN ('DRAFT', 'NEW', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    external_status     text,
    placed_at           timestamptz    NOT NULL,
    confirm_deadline_at timestamptz,
    customer_name       text,
    customer_phone      text,
    city                text,
    delivery_method     text,
    delivery_address    text,
    warehouse           text,
    payment_method      text,
    ttn                 text,
    ttn_status          text,
    comment             text,
    cancel_reason       text,
    total               numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    external_updated_at timestamptz,
    raw_payload         jsonb,
    version             int            NOT NULL DEFAULT 0,
    created_at          timestamptz    NOT NULL DEFAULT now(),
    updated_at          timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT orders_channel_external_id_key UNIQUE (channel, external_id),
    CHECK (channel IN ('INSTAGRAM', 'MANUAL', 'SITE') OR external_id IS NOT NULL)
);
CREATE INDEX orders_placed_at_idx ON orders (placed_at DESC);
CREATE INDEX orders_status_placed_at_idx ON orders (status, placed_at DESC);

CREATE TABLE order_items (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id   bigint         NOT NULL REFERENCES orders (id),
    product_id bigint REFERENCES products (id),
    sku        text           NOT NULL,
    name       text           NOT NULL,
    qty        int            NOT NULL CHECK (qty > 0),
    price      numeric(12, 2) NOT NULL CHECK (price >= 0),
    old_price  numeric(12, 2) CHECK (old_price > 0)
);
CREATE INDEX order_items_order_id_idx ON order_items (order_id);
CREATE INDEX order_items_product_id_idx ON order_items (product_id);

CREATE TABLE order_status_history (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id      bigint      NOT NULL REFERENCES orders (id),
    from_status   text,
    to_status     text        NOT NULL,
    at            timestamptz NOT NULL DEFAULT now(),
    actor_user_id bigint,
    source        text        NOT NULL CHECK (source IN ('USER', 'POLL', 'SYSTEM')),
    note          text
);
CREATE INDEX order_status_history_order_id_at_idx ON order_status_history (order_id, at);

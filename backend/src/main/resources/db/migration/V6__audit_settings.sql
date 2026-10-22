-- Change history shown on product and user pages. actor_user_id NULL means "Система".
CREATE TABLE audit_log (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at            timestamptz NOT NULL DEFAULT now(),
    actor_user_id bigint,
    entity_type   text        NOT NULL
        CHECK (entity_type IN ('PRODUCT', 'ORDER', 'CATEGORY', 'PRICE_RULE', 'INTEGRATION', 'USER')),
    entity_id     bigint,
    sku           text,
    kind          text        NOT NULL
        CHECK (kind IN ('FIELDS', 'PRICE', 'STOCK', 'STATUS', 'INTEGRATION', 'USERS')),
    message       text        NOT NULL,
    diff          jsonb
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, at DESC);
CREATE INDEX audit_log_sku_at_idx ON audit_log (sku, at DESC);
CREATE INDEX audit_log_at_idx ON audit_log (at);

CREATE TABLE settings (
    key        text PRIMARY KEY,
    value      jsonb       NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by bigint
);

-- Defaults from docs/backend/08-marketplace-sync.md §4 and the admin "Закінчується" label; the owner can change them.
INSERT INTO settings (key, value)
VALUES ('stock.low_threshold', '5'),
       ('guard.mass_zero', '{"maxSkus": 10, "maxPercent": 20, "windowMinutes": 10}'),
       ('guard.price_jump', '{"upFactor": 1.5, "downFactor": 2}')
ON CONFLICT (key) DO NOTHING;

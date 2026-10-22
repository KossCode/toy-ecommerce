-- Stock: "available" is what goes to marketplaces. Changes are atomic UPDATEs; the CHECK is the last line of defence.
CREATE TABLE stock (
    product_id bigint PRIMARY KEY REFERENCES products (id),
    total      int         NOT NULL DEFAULT 0,
    reserve    int         NOT NULL DEFAULT 0,
    available  int GENERATED ALWAYS AS (greatest(total - reserve, 0)) STORED,
    awaiting   boolean     NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stock_non_negative CHECK (total >= 0 AND reserve >= 0)
);

CREATE TABLE price_rules (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    marketplace  text        NOT NULL CHECK (marketplace IN ('PROM', 'ROZETKA', 'EPICENTR')),
    scope        text        NOT NULL CHECK (scope IN ('DEFAULT', 'CATEGORY', 'BRAND', 'PRODUCT')),
    scope_ref_id bigint,
    kind         text        NOT NULL CHECK (kind IN ('BASE', 'PERCENT', 'AMOUNT', 'EXACT')),
    value        numeric(12, 2),
    rounding     text        NOT NULL DEFAULT 'NONE'
        CHECK (rounding IN ('NONE', 'UP_10', 'DOWN_10', 'UP_100', 'DOWN_100', 'TO_99')),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   bigint,
    CHECK ((scope = 'DEFAULT') = (scope_ref_id IS NULL)),
    CHECK ((kind = 'BASE') = (value IS NULL)),
    CHECK (kind <> 'EXACT' OR value > 0)
);
CREATE UNIQUE INDEX price_rules_scope_key ON price_rules (marketplace, scope, coalesce(scope_ref_id, 0));

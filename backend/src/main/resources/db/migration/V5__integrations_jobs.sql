-- Marketplace write modes, transactional outbox, call log, feed builds and job runs.
CREATE TABLE integration_settings (
    marketplace            text PRIMARY KEY CHECK (marketplace IN ('PROM', 'ROZETKA', 'EPICENTR')),
    mode                   text        NOT NULL DEFAULT 'READ_ONLY'
        CHECK (mode IN ('OFF', 'READ_ONLY', 'DRY_RUN', 'LIVE')),
    credentials_ciphertext bytea,
    credentials_hint       text,
    credentials_updated_at timestamptz,
    orders_cursor          text,
    paused_reason          text,
    updated_at             timestamptz NOT NULL DEFAULT now(),
    updated_by             bigint
);

-- Safe default: every marketplace starts read-only; LIVE is an explicit owner decision.
INSERT INTO integration_settings (marketplace)
VALUES ('PROM'), ('ROZETKA'), ('EPICENTR')
ON CONFLICT (marketplace) DO NOTHING;

CREATE TABLE sync_outbox (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    marketplace     text        NOT NULL CHECK (marketplace IN ('PROM', 'ROZETKA', 'EPICENTR')),
    kind            text        NOT NULL CHECK (kind IN ('STOCK', 'PRICE', 'ORDER_STATUS')),
    product_id      bigint REFERENCES products (id),
    order_id        bigint REFERENCES orders (id),
    payload         jsonb       NOT NULL,
    dedupe_key      text        NOT NULL,
    status          text        NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE', 'DRY_RUN', 'BLOCKED', 'FAILED')),
    attempts        int         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    processed_at    timestamptz,
    CHECK ((kind = 'ORDER_STATUS') = (order_id IS NOT NULL)),
    CHECK (kind = 'ORDER_STATUS' OR product_id IS NOT NULL)
);
-- Collapsing: while a row is PENDING, a newer value for the same key updates it instead of adding a row.
CREATE UNIQUE INDEX sync_outbox_pending_dedupe_key ON sync_outbox (dedupe_key) WHERE status = 'PENDING';
CREATE INDEX sync_outbox_due_idx ON sync_outbox (next_attempt_at) WHERE status = 'PENDING';

-- Never store tokens or Authorization headers here; excerpts only. Retention: 30 days.
CREATE TABLE sync_log (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    marketplace      text        NOT NULL CHECK (marketplace IN ('PROM', 'ROZETKA', 'EPICENTR')),
    operation        text        NOT NULL,
    http_method      text        NOT NULL,
    path             text        NOT NULL,
    http_status      int,
    duration_ms      int,
    request_excerpt  text,
    response_excerpt text,
    at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_log_at_idx ON sync_log (at);
CREATE INDEX sync_log_marketplace_at_idx ON sync_log (marketplace, at DESC);

CREATE TABLE feed_builds (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    marketplace text        NOT NULL CHECK (marketplace IN ('PROM', 'ROZETKA', 'EPICENTR')),
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    items_count int CHECK (items_count >= 0),
    status      text        NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    errors      jsonb
);
CREATE INDEX feed_builds_marketplace_started_at_idx ON feed_builds (marketplace, started_at DESC);

CREATE TABLE job_runs (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_name    text        NOT NULL,
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    status      text        NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    error       text
);
CREATE INDEX job_runs_job_name_started_at_idx ON job_runs (job_name, started_at DESC);
CREATE INDEX job_runs_started_at_idx ON job_runs (started_at);

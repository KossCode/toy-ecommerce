-- Owner-editable Quartz schedules (orders poll + feed build per marketplace).
-- System jobs keep triggers from code; these rows are the source of truth for user-managed jobs.
CREATE TABLE job_schedules (
    job_key     text PRIMARY KEY,
    flow        text        NOT NULL CHECK (flow IN ('orders', 'feed')),
    marketplace text        CHECK (marketplace IS NULL OR marketplace IN ('PROM', 'ROZETKA', 'EPICENTR')),
    kind        text        NOT NULL CHECK (kind IN ('INTERVAL', 'CALENDAR')),
    payload     jsonb       NOT NULL,
    enabled     boolean     NOT NULL DEFAULT true,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  bigint
);

INSERT INTO job_schedules (job_key, flow, marketplace, kind, payload)
VALUES
    ('PROM.OrdersPoll', 'orders', 'PROM', 'INTERVAL', '{"everySeconds": 90}'::jsonb),
    ('ROZETKA.OrdersPoll', 'orders', 'ROZETKA', 'INTERVAL', '{"everySeconds": 90}'::jsonb),
    ('EPICENTR.OrdersPoll', 'orders', 'EPICENTR', 'INTERVAL', '{"everySeconds": 90}'::jsonb),
    ('PROM.FeedBuild', 'feed', 'PROM', 'CALENDAR',
     '{"daysOfWeek": [1,2,3,4,5,6,7], "hour": 0, "minute": 5}'::jsonb),
    ('ROZETKA.FeedBuild', 'feed', 'ROZETKA', 'CALENDAR',
     '{"daysOfWeek": [1,2,3,4,5,6,7], "hour": 0, "minute": 5}'::jsonb),
    ('EPICENTR.FeedBuild', 'feed', 'EPICENTR', 'CALENDAR',
     '{"daysOfWeek": [1,2,3,4,5,6,7], "hour": 0, "minute": 5}'::jsonb)
ON CONFLICT (job_key) DO NOTHING;

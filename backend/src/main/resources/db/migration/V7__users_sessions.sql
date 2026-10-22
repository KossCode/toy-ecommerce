-- CRM users and sign-in. No users, emails or password hashes in migrations: the repository is public.
-- The first owner is created on the server with the create-owner command (docs/backend/06-auth-and-roles.md §4).
CREATE TABLE users (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email                text        NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
    password_hash        text        NOT NULL,
    full_name            text        NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 200),
    role                 text        NOT NULL CHECK (role IN ('OWNER', 'MANAGER')),
    is_active            boolean     NOT NULL DEFAULT true,
    must_change_password boolean     NOT NULL DEFAULT true,
    last_login_at        timestamptz,
    password_changed_at  timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);

-- Brute-force protection window; old rows are purged by a cleanup job.
CREATE TABLE login_attempts (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email   text        NOT NULL,
    ip      text        NOT NULL,
    at      timestamptz NOT NULL DEFAULT now(),
    success boolean     NOT NULL
);
CREATE INDEX login_attempts_email_ip_at_idx ON login_attempts (email, ip, at);
CREATE INDEX login_attempts_at_idx ON login_attempts (at);

-- Spring Session JDBC 4.1 schema (org/springframework/session/jdbc/schema-postgresql.sql).
CREATE TABLE spring_session (
    primary_id            char(36) NOT NULL,
    session_id            char(36) NOT NULL,
    creation_time         bigint   NOT NULL,
    last_access_time      bigint   NOT NULL,
    max_inactive_interval int      NOT NULL,
    expiry_time           bigint   NOT NULL,
    principal_name        varchar(100),
    CONSTRAINT spring_session_pk PRIMARY KEY (primary_id)
);
CREATE UNIQUE INDEX spring_session_ix1 ON spring_session (session_id);
CREATE INDEX spring_session_ix2 ON spring_session (expiry_time);
CREATE INDEX spring_session_ix3 ON spring_session (principal_name);

CREATE TABLE spring_session_attributes (
    session_primary_id char(36)     NOT NULL,
    attribute_name     varchar(200) NOT NULL,
    attribute_bytes    bytea        NOT NULL,
    CONSTRAINT spring_session_attributes_pk PRIMARY KEY (session_primary_id, attribute_name),
    CONSTRAINT spring_session_attributes_fk FOREIGN KEY (session_primary_id)
        REFERENCES spring_session (primary_id) ON DELETE CASCADE
);

-- "Who changed it" columns created in V2-V6 now point to users.
ALTER TABLE products ADD CONSTRAINT products_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users (id);
ALTER TABLE price_rules ADD CONSTRAINT price_rules_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users (id);
ALTER TABLE integration_settings
    ADD CONSTRAINT integration_settings_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users (id);
ALTER TABLE settings ADD CONSTRAINT settings_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users (id);
ALTER TABLE order_status_history
    ADD CONSTRAINT order_status_history_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users (id);
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users (id);

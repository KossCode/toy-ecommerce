-- Catalog: brands, our category tree, marketplace dictionaries and mappings, products, channels, images.
-- Marketplace codes are text + CHECK (not PG enums) so new values are a simple additive migration.

CREATE TABLE brands (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX brands_name_lower_key ON brands (lower(name));

CREATE TABLE brand_mappings (
    brand_id      bigint NOT NULL REFERENCES brands (id),
    marketplace   text   NOT NULL CHECK (marketplace IN ('PROM', 'ROZETKA', 'EPICENTR')),
    external_id   text,
    external_name text,
    PRIMARY KEY (brand_id, marketplace)
);

CREATE TABLE categories (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parent_id  bigint REFERENCES categories (id),
    name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
    sort_order int         NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX categories_parent_id_idx ON categories (parent_id);

CREATE TABLE marketplace_categories (
    marketplace        text        NOT NULL CHECK (marketplace IN ('PROM', 'ROZETKA', 'EPICENTR')),
    external_id        text        NOT NULL,
    parent_external_id text,
    name               text        NOT NULL,
    is_leaf            boolean     NOT NULL DEFAULT true,
    attribute_set_code text,
    synced_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (marketplace, external_id)
);

CREATE TABLE marketplace_category_attributes (
    marketplace          text        NOT NULL,
    category_external_id text        NOT NULL,
    code                 text        NOT NULL,
    name                 text        NOT NULL,
    is_required          boolean     NOT NULL DEFAULT false,
    value_type           text,
    allowed_values       jsonb,
    synced_at            timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (marketplace, category_external_id, code),
    FOREIGN KEY (marketplace, category_external_id) REFERENCES marketplace_categories (marketplace, external_id)
);

CREATE TABLE category_mappings (
    category_id          bigint NOT NULL REFERENCES categories (id),
    marketplace          text   NOT NULL,
    external_category_id text   NOT NULL,
    attribute_set_code   text,
    PRIMARY KEY (category_id, marketplace),
    FOREIGN KEY (marketplace, external_category_id) REFERENCES marketplace_categories (marketplace, external_id)
);

-- Fixed attribute columns follow docs/backend/04-data-model.md §2.2; a new attribute is a new migration.
CREATE TABLE products (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku            text          NOT NULL UNIQUE CHECK (char_length(sku) BETWEEN 1 AND 64),
    status         text          NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVE')),
    is_demo        boolean       NOT NULL DEFAULT false,
    brand_id       bigint REFERENCES brands (id),
    category_id    bigint REFERENCES categories (id),
    name_uk        text,
    name_ru        text,
    description_uk text,
    description_ru text,
    model          text,
    barcode        text,
    country_uk     text,
    country_ru     text,
    weight_kg      numeric(8, 3) CHECK (weight_kg > 0),
    length_cm      numeric(8, 1) CHECK (length_cm > 0),
    width_cm       numeric(8, 1) CHECK (width_cm > 0),
    height_cm      numeric(8, 1) CHECK (height_cm > 0),
    color_uk       text,
    color_ru       text,
    age_group_uk   text,
    age_group_ru   text,
    material_uk    text,
    material_ru    text,
    type_uk        text,
    type_ru        text,
    parts_count    int CHECK (parts_count > 0),
    series_uk      text,
    series_ru      text,
    condition_uk   text,
    condition_ru   text,
    base_price     numeric(12, 2) CHECK (base_price > 0),
    old_price      numeric(12, 2) CHECK (old_price > 0),
    duplicate_of   bigint REFERENCES products (id),
    version        int           NOT NULL DEFAULT 0,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now(),
    updated_by     bigint,
    CHECK (duplicate_of IS NULL OR duplicate_of <> id)
);
CREATE INDEX products_status_idx ON products (status);
CREATE INDEX products_category_id_idx ON products (category_id);
CREATE INDEX products_brand_id_idx ON products (brand_id);

CREATE TABLE product_channels (
    product_id        bigint      NOT NULL REFERENCES products (id),
    marketplace       text        NOT NULL CHECK (marketplace IN ('PROM', 'ROZETKA', 'EPICENTR')),
    enabled           boolean     NOT NULL DEFAULT false,
    external_id       text        NOT NULL,
    name_override     text,
    moderation_status text,
    last_error        text,
    last_synced_at    timestamptz,
    PRIMARY KEY (product_id, marketplace),
    UNIQUE (marketplace, external_id)
);

CREATE TABLE product_images (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id   bigint      NOT NULL REFERENCES products (id),
    storage_key  text        NOT NULL UNIQUE,
    position     int         NOT NULL CHECK (position >= 0),
    content_type text        NOT NULL,
    size_bytes   bigint      NOT NULL CHECK (size_bytes > 0),
    width        int CHECK (width > 0),
    height       int CHECK (height > 0),
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_images_position_key UNIQUE (product_id, position) DEFERRABLE INITIALLY DEFERRED
);

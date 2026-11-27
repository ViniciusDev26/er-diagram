-- The shop of the examples: every case the diagram distinguishes, in PostgreSQL.
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'cancelled');

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status user_status NOT NULL DEFAULT 'active',
    invited_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One profile per user, keyed by it: one to one, identifying.
CREATE TABLE profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    tags TEXT[]
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE coupons (
    code TEXT PRIMARY KEY,
    percent INTEGER NOT NULL
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    -- An order may have no coupon: an optional parent.
    coupon_code TEXT REFERENCES coupons(code),
    status order_status NOT NULL DEFAULT 'pending'
);

-- Keyed by the order and the product: identifying, many to one each.
CREATE TABLE order_items (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (order_id, product_id)
);

-- A composite foreign key, and one shipment per item at most.
CREATE TABLE shipments (
    id BIGSERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    shipped_at TIMESTAMP,
    FOREIGN KEY (order_id, product_id) REFERENCES order_items(order_id, product_id),
    UNIQUE (order_id, product_id)
);

CREATE INDEX orders_by_user_and_status ON orders (user_id, status);
CREATE INDEX products_by_name ON products (name);
-- A covering index: the included column is not part of the key.
CREATE UNIQUE INDEX products_name_key ON products (name) INCLUDE (price);
-- Unique among pending orders only: a user still has many orders.
CREATE UNIQUE INDEX one_pending_order_per_user ON orders (user_id) WHERE status = 'pending';
-- An expression index has no column to show.
CREATE INDEX users_by_lower_email ON users (lower(email));

COMMENT ON COLUMN users.email IS 'Where the receipts go';

-- A migration tool's table and a view: never in the diagram.
CREATE TABLE flyway_schema_history (installed_rank INTEGER PRIMARY KEY);
CREATE VIEW paid_orders AS SELECT * FROM orders WHERE status = 'paid';

-- A partitioned table is one table, not one per partition.
CREATE TABLE events (id BIGINT NOT NULL, at DATE NOT NULL, PRIMARY KEY (id, at)) PARTITION BY RANGE (at);
CREATE TABLE events_2026 PARTITION OF events FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- Another schema, read only when asked for.
CREATE SCHEMA billing;
CREATE TABLE billing.invoices (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES public.orders(id)
);

-- The shop of the examples in MySQL: enums live on their columns.
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    status ENUM('active', 'inactive', 'it''s off') NOT NULL DEFAULT 'active',
    invited_by INT NULL,
    credit DECIMAL(10, 2) UNSIGNED NOT NULL DEFAULT 0,
    FOREIGN KEY (invited_by) REFERENCES users(id)
);

CREATE TABLE profiles (
    user_id INT PRIMARY KEY,
    bio TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    created_at DATETIME NOT NULL,
    CONSTRAINT orders_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX orders_by_user_and_date (user_id, created_at)
);

CREATE TABLE products (code VARCHAR(20) PRIMARY KEY);

-- Foreign keys come in column order, whatever their names.
CREATE TABLE order_items (
    order_id INT NOT NULL,
    line INT NOT NULL,
    product_code VARCHAR(20) NOT NULL,
    PRIMARY KEY (order_id, line),
    CONSTRAINT a_product FOREIGN KEY (product_code) REFERENCES products(code),
    CONSTRAINT b_order FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE shipments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    line INT NOT NULL,
    UNIQUE KEY shipments_once (order_id, line),
    FOREIGN KEY (order_id, line) REFERENCES order_items(order_id, line)
);

-- A functional index has no column to show.
CREATE INDEX users_by_lower_email ON users ((lower(email)));

CREATE TABLE flyway_schema_history (installed_rank INT PRIMARY KEY, version VARCHAR(50), INDEX (version));

-- A foreign key to another database is not part of this one's diagram.
CREATE TABLE wallets (id INT PRIMARY KEY, account_id INT, FOREIGN KEY (account_id) REFERENCES other.accounts(id));
CREATE VIEW big_orders AS SELECT * FROM orders;

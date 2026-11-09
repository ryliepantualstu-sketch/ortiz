-- Run once on an existing database when deploying the frame reservation workflow.
ALTER TABLE orders
    ADD COLUMN reservation_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders
    ADD COLUMN requires_eye_checkup BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE orders
    ADD COLUMN reservation_confirmed_at DATETIME NULL;

ALTER TABLE orders
    ADD COLUMN reservation_stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE appointments
    ADD COLUMN reservation_order_id INT NULL,
    ADD INDEX idx_appointments_reservation_order (reservation_order_id),
    ADD CONSTRAINT fk_appointments_reservation_order
        FOREIGN KEY (reservation_order_id) REFERENCES orders(order_id) ON DELETE SET NULL;

ALTER TABLE order_items
    ADD COLUMN frame_price DECIMAL(10, 2) NULL,
    ADD COLUMN lens_price DECIMAL(10, 2) NULL;

ALTER TABLE orders
    ADD COLUMN checkup_fee DECIMAL(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE products MODIFY COLUMN category ENUM('Glasses', 'Frame') NOT NULL;
UPDATE products SET category = 'Frame' WHERE category = 'Glasses';
ALTER TABLE products MODIFY COLUMN category ENUM('Frame') NOT NULL;

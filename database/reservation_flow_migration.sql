-- Run once on an existing database when deploying the frame reservation workflow.
ALTER TABLE orders
    ADD COLUMN reservation_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE appointments
    ADD COLUMN reservation_order_id INT NULL,
    ADD INDEX idx_appointments_reservation_order (reservation_order_id),
    ADD CONSTRAINT fk_appointments_reservation_order
        FOREIGN KEY (reservation_order_id) REFERENCES orders(order_id) ON DELETE SET NULL;

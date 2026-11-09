-- Run once on an existing database to require staff approval for pickup date requests.
ALTER TABLE orders
    ADD COLUMN pickup_date_requested DATE NULL,
    ADD COLUMN pickup_date_request_status VARCHAR(20) NULL;

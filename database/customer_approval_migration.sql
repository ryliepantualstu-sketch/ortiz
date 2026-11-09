-- Existing accounts stay approved; new customer registrations wait for owner approval.
ALTER TABLE users
    ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'approved';

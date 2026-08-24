CREATE DATABASE IF NOT EXISTS ortiz_optical_db;
USE ortiz_optical_db;

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'staff', 'customer') NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(15),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX (email),
    INDEX (role)
);

CREATE TABLE customers (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    phone VARCHAR(15),
    date_of_birth DATE,
    address VARCHAR(255),
    city VARCHAR(50),
    state VARCHAR(50),
    zip_code VARCHAR(10),
    is_senior BOOLEAN DEFAULT FALSE,
    is_pwd BOOLEAN DEFAULT FALSE,
    loyalty_points INT DEFAULT 0,
    gender ENUM('Male', 'Female', 'Other'),
    emergency_contact VARCHAR(100),
    emergency_phone VARCHAR(15),
    medical_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE staff (
    staff_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    position VARCHAR(50),
    hire_date DATE,
    department VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    category ENUM('Glasses') NOT NULL,
    description TEXT,
    frame_material VARCHAR(100),
    lens_type VARCHAR(100),
    frame_shape VARCHAR(100),
    color_name VARCHAR(100),
    color_hex VARCHAR(7),
    color_int INT NULL,
    price DECIMAL(10, 2) NOT NULL,
    frame_only_price DECIMAL(10, 2),
    regular_lens_price DECIMAL(10, 2),
    photochromic_price DECIMAL(10, 2),
    supplier VARCHAR(100),
    image_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (category),
    INDEX (product_name)
);

CREATE TABLE inventory (
    inventory_id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL UNIQUE,
    stock_quantity INT NOT NULL DEFAULT 0,
    min_stock_level INT DEFAULT 10,
    last_restock_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
);

CREATE TABLE appointments (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    duration_minutes INT DEFAULT 30,
    service_type ENUM('Eye Checkup', 'Lens Fitting', 'Frame Adjustment', 'General Consultation') NOT NULL,
    status ENUM('Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No-show') DEFAULT 'Scheduled',
    notes TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    verified_at TIMESTAMP NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX (appointment_date),
    INDEX (status),
    UNIQUE KEY unique_appointment_slot (appointment_date, appointment_time)
);

CREATE TABLE orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    order_date DATE NOT NULL,
    order_time TIME NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    discount_type VARCHAR(50),
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status ENUM('Pending', 'Processing', 'Ready for Pickup', 'Completed', 'Cancelled') DEFAULT 'Pending',
    payment_status ENUM('Unpaid', 'Paid', 'Refunded') DEFAULT 'Unpaid',
    payment_method ENUM('Cash', 'Card', 'Online') DEFAULT 'Cash',
    delivery_address VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    INDEX (order_date),
    INDEX (status),
    INDEX (customer_id)
);

CREATE TABLE order_items (
    order_item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE shopping_cart (
    cart_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
    UNIQUE KEY unique_cart_item (customer_id, product_id)
);

CREATE TABLE qr_codes (
    qr_id INT AUTO_INCREMENT PRIMARY KEY,
    code_type ENUM('Appointment', 'Order') NOT NULL,
    reference_id INT NOT NULL,
    qr_code_data LONGTEXT NOT NULL,
    qr_image_path VARCHAR(255),
    is_used BOOLEAN DEFAULT FALSE,
    scanned_at TIMESTAMP NULL,
    scanned_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expired_at TIMESTAMP NULL,
    FOREIGN KEY (scanned_by) REFERENCES users(user_id),
    INDEX (code_type),
    INDEX (reference_id),
    INDEX (is_used)
);

CREATE TABLE inventory_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    transaction_type ENUM('Stock In', 'Stock Out', 'Adjustment') NOT NULL,
    quantity INT NOT NULL,
    reference_type ENUM('Order', 'Purchase', 'Adjustment', 'Return') NOT NULL,
    reference_id INT,
    performed_by INT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(user_id),
    INDEX (product_id),
    INDEX (created_at)
);

CREATE TABLE appointment_availability (
    availability_id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_appointments INT DEFAULT 1,
    current_bookings INT DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_time_slot (appointment_date, start_time),
    INDEX (appointment_date)
);

CREATE TABLE reports (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    report_type ENUM('Sales', 'Appointments', 'Inventory', 'Customer') NOT NULL,
    report_name VARCHAR(100),
    generated_by INT NOT NULL,
    report_data LONGTEXT,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (generated_by) REFERENCES users(user_id)
);

CREATE TABLE schedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    day_of_week ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') NULL,
    schedule_date DATE NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_operational BOOLEAN DEFAULT TRUE,
    max_appointments_per_slot INT DEFAULT 1,
    slot_duration_minutes INT DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_schedule_date (schedule_date),
    UNIQUE KEY unique_day_of_week (day_of_week),
    INDEX (day_of_week),
    INDEX (schedule_date)
);

CREATE TABLE holidays (
    holiday_id INT AUTO_INCREMENT PRIMARY KEY,
    holiday_date DATE NOT NULL UNIQUE,
    holiday_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (holiday_date)
);

CREATE TABLE blocked_slots (
    blocked_slot_id INT AUTO_INCREMENT PRIMARY KEY,
    block_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    reason VARCHAR(255),
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX (block_date)
);

CREATE TABLE staff_service_assignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id INT NOT NULL,
    service_type ENUM('Eye Checkup', 'Lens Fitting', 'Frame Adjustment', 'General Consultation') NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id) REFERENCES users(user_id),
    UNIQUE KEY unique_staff_service (staff_id, service_type),
    INDEX (staff_id),
    INDEX (service_type)
);


INSERT INTO users (email, password, role, full_name, phone) VALUES
('admin@ortizoptical.com', '$2y$10$E9rnJRrJf.rj8cSJrXrGdeP6hNLDSl9.yJzH8zvKhKcZVpjK2d5iC', 'admin', 'Admin User', '1234567890');

INSERT INTO users (email, password, role, full_name, phone) VALUES
('staff@ortizoptical.com', '$2y$10$E9rnJRrJf.rj8cSJrXrGdeP6hNLDSl9.yJzH8zvKhKcZVpjK2d5iC', 'staff', 'John Staff', '0987654321');

INSERT INTO staff (user_id, position, hire_date, department) VALUES
(2, 'Optometrist', '2025-01-15', 'Clinical');

INSERT INTO users (email, password, role, full_name, phone) VALUES
('customer@example.com', '$2y$10$E9rnJRrJf.rj8cSJrXrGdeP6hNLDSl9.yJzH8zvKhKcZVpjK2d5iC', 'customer', 'Jane Customer', '5555555555');

INSERT INTO customers (user_id, address, city, state, zip_code, gender) VALUES
(3, '123 Main Street', 'Springfield', 'IL', '62701', 'Female');

INSERT INTO products (product_name, category, description, frame_material, lens_type, frame_shape, color_name, color_hex, color_int, price, supplier) VALUES
('Rayban Wayfarer', 'Glasses', 'Classic Rayban frames', 'Acetate', 'Anti-Reflective', 'Wayfarer', 'Black', '#000000', 16711680, 199.99, 'Rayban Inc'),
('Anti-Reflective Coating', 'Glasses', 'Premium anti-reflective coating', 'Metal', 'Anti-Reflective', 'Rectangular', 'Gunmetal', '#2F4F4F', 8421504, 50.00, 'Essilor'),
('Blue Light Blocker', 'Glasses', 'Blue light filtering lenses', 'Plastic', 'Blue Light Blocking', 'Classic', 'Blue', '#0000FF', 255, 75.00, 'Crizal'),
('Microfiber Cleaning Cloth', 'Glasses', 'High quality microfiber cloth', 'N/A', 'Cleaning', 'N/A', 'Gray', '#7F7F7F', 12632256, 5.99, 'Various'),
('Saline Solution', 'Glasses', 'Lens cleaning solution', 'N/A', 'Lens Care', 'N/A', 'Clear', '#FFFFFF', 16777215, 12.99, 'Alcon');

INSERT INTO inventory (product_id, stock_quantity, min_stock_level) VALUES
(1, 25, 10),
(2, 50, 20),
(3, 40, 15),
(4, 100, 30),
(5, 60, 20);

INSERT INTO appointment_availability (appointment_date, start_time, end_time, max_appointments) VALUES
('2026-03-10', '09:00:00', '09:30:00', 1),
('2026-03-10', '09:30:00', '10:00:00', 1),
('2026-03-10', '10:00:00', '10:30:00', 1),
('2026-03-10', '10:30:00', '11:00:00', 1),
('2026-03-10', '14:00:00', '14:30:00', 1),
('2026-03-10', '14:30:00', '15:00:00', 1),
('2026-03-11', '09:00:00', '09:30:00', 1),
('2026-03-11', '09:30:00', '10:00:00', 1);

CREATE INDEX idx_appointments_customer ON appointments(customer_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_qr_codes_type ON qr_codes(code_type, reference_id);
CREATE INDEX idx_shopping_cart_customer ON shopping_cart(customer_id);
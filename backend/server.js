const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { DataTypes } = require('sequelize');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const sequelize = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.resolve(__dirname, '../frontend/public')));

// Initialize database and models
const User = require('./models/User');
const Customer = require('./models/Customer');
const Product = require('./models/Product');
const Appointment = require('./models/Appointment');
const Order = require('./models/Order');
const OrderItem = require('./models/OrderItem');
const Cart = require('./models/Cart');
const QRCode = require('./models/QRCode');
const Schedule = require('./models/Schedule');
const Holiday = require('./models/Holiday');
const BlockedSlot = require('./models/BlockedSlot');
const StaffServiceAssignment = require('./models/StaffServiceAssignment');
const StockAuditLog = require('./models/StockAuditLog');

// Define associations
User.hasOne(Customer, { foreignKey: 'user_id' });
Customer.belongsTo(User, { foreignKey: 'user_id' });

Customer.hasMany(Appointment, { foreignKey: 'customer_id' });
Appointment.belongsTo(Customer, { foreignKey: 'customer_id' });

Customer.hasMany(Order, { foreignKey: 'customer_id' });
Order.belongsTo(Customer, { foreignKey: 'customer_id' });

Order.hasMany(OrderItem, { foreignKey: 'order_id' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id' });

OrderItem.belongsTo(Product, { foreignKey: 'product_id' });
Product.hasMany(OrderItem, { foreignKey: 'product_id' });

Customer.hasMany(Cart, { foreignKey: 'customer_id' });
Cart.belongsTo(Customer, { foreignKey: 'customer_id' });

Cart.belongsTo(Product, { foreignKey: 'product_id' });
Product.hasMany(Cart, { foreignKey: 'product_id' });

Appointment.belongsTo(User, { foreignKey: 'assigned_staff_id', as: 'staff' });
Appointment.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

User.hasMany(BlockedSlot, { foreignKey: 'created_by', as: 'blockedSlots' });
BlockedSlot.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

User.hasMany(StaffServiceAssignment, { foreignKey: 'staff_id', as: 'serviceAssignments' });
StaffServiceAssignment.belongsTo(User, { foreignKey: 'staff_id', as: 'staff' });

// Stock audit log associations
Product.hasMany(StockAuditLog, { foreignKey: 'product_id' });
StockAuditLog.belongsTo(Product, { foreignKey: 'product_id' });

User.hasMany(StockAuditLog, { foreignKey: 'admin_id', as: 'admin' });
StockAuditLog.belongsTo(User, { foreignKey: 'admin_id', as: 'admin' });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/customer', require('./routes/customer'));
app.use('/api/staff', require('./routes/staff'));

// Health check (reports DB connection status when available)
app.get('/api/health', (req, res) => {
  const dbConnected = app.locals.dbConnected === true;
  res.json({ success: true, message: 'Server is running', dbConnected });
});

// Debug: quick DB info endpoint to inspect row counts and sample data
app.get('/api/debug/db-info', async (req, res) => {
  try {
    const [usersCount] = await sequelize.query('SELECT COUNT(*) AS cnt FROM users');
    const [customersCount] = await sequelize.query('SELECT COUNT(*) AS cnt FROM customers');
    const [productsCount] = await sequelize.query('SELECT COUNT(*) AS cnt FROM products');
    const [ordersCount] = await sequelize.query('SELECT COUNT(*) AS cnt FROM orders');
    const [cartCount] = await sequelize.query('SELECT COUNT(*) AS cnt FROM shopping_cart');

    // determine which customer columns exist before selecting
    const [customerCols] = await sequelize.query("SHOW COLUMNS FROM customers");
    const customerColNames = (customerCols || []).map(c => c.Field);
    const desiredCustomerFields = ['user_id', 'phone', 'date_of_birth', 'is_senior', 'is_pwd'];
    const selectCustomerFields = desiredCustomerFields.filter(f => customerColNames.includes(f));
    const customerSelect = selectCustomerFields.length > 0 ? selectCustomerFields.join(', ') : 'user_id';
    const [sampleCustomers] = await sequelize.query(`SELECT ${customerSelect} FROM customers LIMIT 5`);

    const [sampleUsers] = await sequelize.query('SELECT user_id, email, role FROM users LIMIT 5');

    const [productCols] = await sequelize.query("SHOW COLUMNS FROM products");
    const productColNames = (productCols || []).map(c => c.Field);
    const desiredProductFields = ['product_id', 'product_name', 'price', 'stock_quantity'];
    const selectProductFields = desiredProductFields.filter(f => productColNames.includes(f));
    const productSelect = selectProductFields.length > 0 ? selectProductFields.join(', ') : 'product_id, product_name';
    const [sampleProducts] = await sequelize.query(`SELECT ${productSelect} FROM products LIMIT 5`);

    // sample shopping cart entries (join with products and customers)
    let sampleCart = [];
    try {
      const [cartRows] = await sequelize.query(`SELECT sc.cart_id, sc.customer_id, sc.product_id, sc.quantity, sc.lens_option, p.product_name, p.price AS product_price, c.user_id AS customer_user_id FROM shopping_cart sc LEFT JOIN products p ON p.product_id = sc.product_id LEFT JOIN customers c ON c.customer_id = sc.customer_id LIMIT 10`);
      sampleCart = cartRows;
    } catch (cartErr) {
      sampleCart = [];
    }

    res.json({
      success: true,
      counts: {
        users: Number(usersCount[0].cnt || 0),
        customers: Number(customersCount[0].cnt || 0),
        products: Number(productsCount[0].cnt || 0),
        orders: Number(ordersCount[0].cnt || 0),
        cart: Number(cartCount[0].cnt || 0)
      },
      sample: {
        customers: sampleCustomers,
        users: sampleUsers,
        products: sampleProducts,
        cart: sampleCart
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch debug info', error: err.message });
  }
});

// Error handler
app.use(errorHandler);

// Database connection and server start
const PORT = process.env.PORT || 3000;

const http = require('http');

const startHttpServer = async (startPort, maxAttempts = 5) => {
  let port = Number(startPort) || 3000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const server = http.createServer(app);
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => resolve());
      });
      app.locals.port = port;
      console.log(`Server is running on http://localhost:${port}`);
      return server;
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} in use, trying ${port + 1}...`);
        port++;
        try { server.close(); } catch (e) {}
        await delay(200);
        continue;
      }
      throw err;
    }
  }
  throw new Error('No available ports to bind server');
};

const dropStockAuditTablespace = async () => {
  const tablesToDrop = ['stock_audit_log_entries', 'stock_audit_logs'];
  for (const tableName of tablesToDrop) {
    try {
      await sequelize.getQueryInterface().dropTable(tableName, { cascade: true });
    } catch (dropErr) {
      // ignore failures if the table does not exist or cannot be dropped normally
    }
  }

  try {
    await sequelize.query('DROP TABLESPACE `ortiz_optical_db/stock_audit_log_entries`;');
  } catch (tablespaceErr) {
    // ignore if tablespace does not exist or cannot be dropped
  }
  try {
    await sequelize.query('DROP TABLESPACE `ortiz_optical_db/stock_audit_logs`;');
  } catch (tablespaceErr) {
    // ignore if tablespace does not exist or cannot be dropped
  }
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const ensureStockAuditLogTable = async () => {
  try {
    await StockAuditLog.sync();
  } catch (syncErr) {
    const code = syncErr && syncErr.parent && syncErr.parent.code;
    if (code === 'ER_TABLESPACE_EXISTS' || code === 'ER_NO_SUCH_TABLE' || /doesn't exist in engine/i.test(syncErr.message)) {
      console.error('MySQL stock_audit_log_entries recovery detected. Attempting recovery...');
      await dropStockAuditTablespace();
      console.log('Dropped corrupt stock_audit_log_entries tablespace/table metadata. Retrying sync...');
      await StockAuditLog.sync();
    } else if (code === 'ECONNRESET') {
      console.error('Database connection reset detected while checking stock_audit_log_entries. Retrying...');
      // attempt a short reconnect-and-retry flow
      for (let i = 0; i < 3; i++) {
        try {
          await sequelize.close();
        } catch (e) {}
        await delay(500);
        try {
          await sequelize.authenticate();
          await StockAuditLog.sync();
          return;
        } catch (retryErr) {
          console.error('Retry', i + 1, 'failed:', retryErr && retryErr.parent && retryErr.parent.code || retryErr.message);
          await delay(500);
        }
      }
      throw syncErr;
    } else {
      throw syncErr;
    }
  }
};

const ensureSchemaColumns = async () => {
  const qi = sequelize.getQueryInterface();
  const addColumnIfMissing = async (tableName, columnName, definition) => {
    const columns = await qi.describeTable(tableName);
    if (!columns[columnName]) {
      console.log(`Adding missing column ${tableName}.${columnName}`);
      await qi.addColumn(tableName, columnName, definition);
    }
  };

  const changeColumnIfDifferent = async (tableName, columnName, definition) => {
    const columns = await qi.describeTable(tableName);
    const column = columns[columnName];
    if (!column) {
      return;
    }

    const needsAllowNullFix = definition.allowNull !== undefined && column.allowNull !== definition.allowNull;
    const needsTypeFix = definition.type && String(column.type).toLowerCase() !== String(definition.type).toLowerCase();

    if (needsAllowNullFix || needsTypeFix) {
      console.log(`Altering ${tableName}.${columnName} to match model definition`);
      await qi.changeColumn(tableName, columnName, definition);
    }
  };

  try {
    await addColumnIfMissing('customers', 'phone', {
      type: DataTypes.STRING(15),
      allowNull: true
    });
    await addColumnIfMissing('customers', 'is_senior', {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    });
    await addColumnIfMissing('customers', 'is_pwd', {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    });
    await addColumnIfMissing('customers', 'discount_card_image_url', {
      type: DataTypes.TEXT('long'),
      allowNull: true
    });
    await changeColumnIfDifferent('customers', 'discount_card_image_url', {
      type: DataTypes.TEXT('long'),
      allowNull: true
    });
    await addColumnIfMissing('customers', 'loyalty_points', {
      type: DataTypes.INTEGER,
      defaultValue: 0
    });
    await addColumnIfMissing('orders', 'discount_type', {
      type: DataTypes.STRING(50),
      allowNull: true
    });
    await addColumnIfMissing('orders', 'discount_amount', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    });
    await addColumnIfMissing('schedules', 'schedule_date', {
      type: DataTypes.DATEONLY,
      allowNull: true
    });
    await addColumnIfMissing('schedules', 'day_of_week', {
      type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
      allowNull: true
    });

    await changeColumnIfDifferent('schedules', 'day_of_week', {
      type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
      allowNull: true
    });
    await changeColumnIfDifferent('schedules', 'schedule_date', {
      type: DataTypes.DATEONLY,
      allowNull: true
    });
  } catch (schemaErr) {
    console.error('Failed to ensure schema columns:', schemaErr.message || schemaErr);
    throw schemaErr;
  }
};

const ensureDefaultAdmin = async () => {
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@ortizoptical.com';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

  const adminExists = await User.findOne({ where: { email: adminEmail } });
  if (!adminExists) {
    await User.create({
      full_name: 'Admin User',
      email: adminEmail,
      password: adminPassword,
      phone: '1234567890',
      role: 'admin'
    });
    console.log(`Default admin created: ${adminEmail} / ${adminPassword}`);
  }
};

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');
    app.locals.dbConnected = true;

    if (sequelize.getDialect() === 'sqlite' || process.env.DB_SYNC === 'true') {
      console.log('Synchronizing database schema...');
      await sequelize.sync();
    } else {
      console.log('Skipping full Sequelize sync because DB_SYNC is not set to true.');
    }

    await ensureSchemaColumns();
    await ensureDefaultAdmin();

    // Ensure the stock audit table can be created safely before any other sync operations.
    await ensureStockAuditLogTable();

    if (process.env.DB_SYNC === 'true') {
      try {
        await sequelize.sync();
      } catch (syncErr) {
        const code = syncErr && syncErr.parent && syncErr.parent.code;
        if (code === 'ER_TABLESPACE_EXISTS') {
          console.error('MySQL tablespace issue detected during full sync. Attempting recovery...');
          await dropStockAuditTablespace();
          console.log('Dropped corrupt stock_audit_logs tablespace. Retrying full sync...');
          await sequelize.sync();
        } else if (code === 'ECONNRESET') {
          console.error('Database connection reset during full sync. Attempting reconnect and retry...');
          for (let i = 0; i < 3; i++) {
            try {
              await sequelize.close();
            } catch (e) {}
            await delay(500);
            try {
              await sequelize.authenticate();
              await sequelize.sync();
              break;
            } catch (retryErr) {
              console.error('Full sync retry', i + 1, 'failed:', retryErr && retryErr.parent && retryErr.parent.code || retryErr.message);
              await delay(500);
            }
          }
        } else {
          throw syncErr;
        }
      }
    } else {
      console.log('Skipping full Sequelize sync because DB_SYNC is not set to true.');
    }

    await startHttpServer(PORT);
  } catch (err) {
    console.error('Database initialization failed:', err);
    // Do not exit process — start server in degraded mode so nodemon stays up.
    app.locals.dbConnected = false;
    console.warn('Starting server in degraded mode (DB unavailable). Some features will be disabled.');
    await startHttpServer(PORT);
  }

};

startServer();

module.exports = app;

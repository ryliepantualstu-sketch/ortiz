const express = require('express');
const router = express.Router();
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { authMiddleware, requireRole } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const Appointment = require('../models/Appointment');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Customer = require('../models/Customer');
const Cart = require('../models/Cart');
const QRCode = require('../models/QRCode');
const Schedule = require('../models/Schedule');
const Holiday = require('../models/Holiday');
const BlockedSlot = require('../models/BlockedSlot');
const StaffServiceAssignment = require('../models/StaffServiceAssignment');
const StockAuditLog = require('../models/StockAuditLog');
const { archiveUser, restoreUser } = require('../utils/userLifecycle');
const PRODUCT_IMAGE_DIRECTORY = path.resolve(__dirname, '../../frontend/public/images/products');
const PRODUCT_IMAGE_URL_PREFIX = 'images/products';
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};
const ALLOWED_PRODUCT_CATEGORIES = ['Glasses'];

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const values = user.toJSON ? user.toJSON() : user;
  delete values.password;
  return values;
}

function isManagedProductImage(imageUrl) {
  return typeof imageUrl === 'string' && imageUrl.startsWith(`${PRODUCT_IMAGE_URL_PREFIX}/`);
}

async function removeManagedProductImage(imageUrl) {
  if (!isManagedProductImage(imageUrl)) {
    return;
  }

  try {
    const imagePath = path.join(PRODUCT_IMAGE_DIRECTORY, path.basename(imageUrl));
    await fs.rm(imagePath, { force: true });
  } catch (error) {
    console.error('Error removing product image:', error);
    // Don't throw - just log it so deletion can continue
  }
}

async function persistProductImage(imageData, originalFileName) {
  if (!imageData) {
    return null;
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageData);
  if (!match) {
    throw new Error('Invalid product image format');
  }

  const mimeType = match[1].toLowerCase();
  const extension = ALLOWED_IMAGE_TYPES[mimeType];

  if (!extension) {
    throw new Error('Unsupported image type. Use JPG, PNG, WEBP, or GIF');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Product image must be 5MB or smaller');
  }

  const baseName = path.basename(originalFileName || `product.${extension}`, path.extname(originalFileName || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'product';
  const fileName = `${baseName}-${crypto.randomBytes(6).toString('hex')}.${extension}`;

  await fs.mkdir(PRODUCT_IMAGE_DIRECTORY, { recursive: true });
  await fs.writeFile(path.join(PRODUCT_IMAGE_DIRECTORY, fileName), buffer);

  return `${PRODUCT_IMAGE_URL_PREFIX}/${fileName}`;
}

// Public: Get all active products (available to all authenticated users)
router.get('/products/view/all', authMiddleware, async (req, res) => {
  try {
    const products = await Product.findAll({
      where: { is_active: true },
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// Force delete user and all dependent records (appointments, orders, cart)
router.delete('/users/:id/force', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    // Require explicit confirmation to avoid accidental destructive actions
    if (String(req.query.confirm).toLowerCase() !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Force delete requires ?confirm=true to proceed'
      });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const customer = await Customer.findOne({ where: { user_id: user.user_id } });
    // Collect dependent IDs and counts for logging before deletion
    let appointmentIds = [];
    let orderIds = [];
    let orderItemIds = [];
    let cartItemIds = [];

    if (customer) {
      const appointments = await Appointment.findAll({ where: { customer_id: customer.customer_id } });
      appointmentIds = appointments.map(a => a.appointment_id);

      const orders = await Order.findAll({ where: { customer_id: customer.customer_id } });
      orderIds = orders.map(o => o.order_id);

      for (const ord of orders) {
        const items = await OrderItem.findAll({ where: { order_id: ord.order_id }, attributes: ['order_item_id'] });
        orderItemIds.push(...items.map(i => i.order_item_id));
      }

      const cartItems = await Cart.findAll({ where: { customer_id: customer.customer_id } });
      cartItemIds = cartItems.map(c => c.cart_id);

      // Write deletion log entry (JSONL)
      try {
        const LOG_DIR = path.resolve(__dirname, '../logs');
        await fs.mkdir(LOG_DIR, { recursive: true });
        const logFile = path.join(LOG_DIR, 'deleted_users.jsonl');
        const entry = {
          deleted_at: new Date().toISOString(),
          deleted_by: req.user ? req.user.user_id : null,
          user: sanitizeUser(user),
          customer_id: customer.customer_id,
          appointment_ids: appointmentIds,
          order_ids: orderIds,
          order_item_ids: orderItemIds,
          cart_item_ids: cartItemIds
        };
        await fs.appendFile(logFile, JSON.stringify(entry) + '\n');
      } catch (logErr) {
        console.error('Failed to write deletion log:', logErr);
      }

      // Remove appointment QR codes and appointments
      for (const appt of await Appointment.findAll({ where: { customer_id: customer.customer_id } })) {
        await QRCode.destroy({ where: { code_type: 'Appointment', reference_id: appt.appointment_id } });
        await appt.destroy();
      }

      // Remove order items, order QR codes, and orders
      for (const ord of await Order.findAll({ where: { customer_id: customer.customer_id } })) {
        await OrderItem.destroy({ where: { order_id: ord.order_id } });
        await QRCode.destroy({ where: { code_type: 'Order', reference_id: ord.order_id } });
        await ord.destroy();
      }

      // Remove cart items
      await Cart.destroy({ where: { customer_id: customer.customer_id } });

      // Finally remove the customer record
      await customer.destroy();
    }

    // Remove the user record
    await user.destroy();

    res.json({
      success: true,
      message: 'User and dependent records force-deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to force delete user',
      error: error.message
    });
  }
});

// Get dashboard stats
router.get('/dashboard-stats', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { is_active: true } });
    const totalProducts = await Product.count();
    const lowStockProducts = await Product.count({ where: { stock_quantity: { [require('sequelize').Op.lt]: 10 } } });
    const totalOrders = await Order.count();
    const pendingOrders = await Order.count({ where: { status: 'pending' } });

    res.json({
      success: true,
      stats: {
        total_users: totalUsers,
        active_users: activeUsers,
        total_products: totalProducts,
        low_stock_products: lowStockProducts,
        total_orders: totalOrders,
        pending_orders: pendingOrders
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
});

// Get all users
router.get('/users', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// Create user
router.post('/users', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { full_name, email, password, phone, role, is_active } = req.body;
    const normalizedPhone = typeof phone === 'string'
      ? phone.trim().replace(/[\s-]/g, '')
      : '';

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, password, and role are required'
      });
    }

    if (normalizedPhone && !/^\+?\d{7,15}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must contain 7 to 15 digits, with optional leading +'
      });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    const user = await User.create({
      full_name,
      email,
      password,
      phone: normalizedPhone || null,
      role,
      is_active: is_active !== false
    });

    if (role === 'customer') {
      await Customer.findOrCreate({ where: { user_id: user.user_id }, defaults: { user_id: user.user_id } });
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: sanitizeUser(user)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
});

// Update user
router.put('/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const { full_name, email, password, phone, role, is_active } = req.body;
    const normalizedPhone = typeof phone === 'string'
      ? phone.trim().replace(/[\s-]/g, '')
      : '';

    if (!full_name || !email || !role) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, and role are required'
      });
    }

    if (normalizedPhone && !/^\+?\d{7,15}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must contain 7 to 15 digits, with optional leading +'
      });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser && existingUser.user_id !== user.user_id) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    const updates = {
      full_name,
      email,
      phone: normalizedPhone || null,
      role,
      is_active: Boolean(is_active)
    };

    if (password) {
      updates.password = password;
    }

    await user.update(updates);

    if (role === 'customer') {
      await Customer.findOrCreate({ where: { user_id: user.user_id }, defaults: { user_id: user.user_id } });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      user: sanitizeUser(user)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
});

// Archive user (soft delete via deactivation)
router.delete('/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.is_active === false) {
      return res.json({
        success: true,
        message: 'User is already archived'
      });
    }

    const result = await archiveUser(user);

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to archive user',
      error: error.message
    });
  }
});

// Restore archived user
router.post('/users/:id/restore', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const result = await restoreUser(user);

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to restore user',
      error: error.message
    });
  }
});

// Get all products
router.get('/products', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const products = await Product.findAll({
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// Create product
router.post('/products', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { product_name, category, description, frame_material, lens_type, frame_shape, color_name, color_hex, color_int, price, frame_only_price, regular_lens_price, photochromic_price, stock_quantity, min_stock_level, supplier, image_data, image_name } = req.body;
    const colorInt = color_int != null && color_int !== '' ? Number(color_int) : null;
    const trimmedColorHex = color_hex ? String(color_hex).trim() : null;
    const normalizedColorHex = trimmedColorHex ? trimmedColorHex.replace(/^#/, '').toUpperCase() : null;

    console.log('Creating product:', { product_name, category, frame_material, lens_type, frame_shape, color_name, color_hex: normalizedColorHex, color_int: colorInt, price, stock_quantity, image_data: !!image_data });

    if (!product_name || !category || price == null || stock_quantity == null) {
      return res.status(400).json({
        success: false,
        message: 'Product name, category, price, and stock quantity are required'
      });
    }

    if (!ALLOWED_PRODUCT_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Use one of: ${ALLOWED_PRODUCT_CATEGORIES.join(', ')}`
      });
    }

    if (colorInt !== null && !Number.isInteger(colorInt)) {
      return res.status(400).json({
        success: false,
        message: 'Color Int must be a whole number.'
      });
    }

    if (normalizedColorHex && !/^([A-F0-9]{6})$/.test(normalizedColorHex)) {
      return res.status(400).json({
        success: false,
        message: 'Color Hex must be a valid 6-digit hex string, with or without #.'
      });
    }

    const product = await Product.create({
      product_name,
      category,
      description,
      frame_material,
      lens_type,
      frame_shape,
      color_name: color_name?.trim() || null,
      color_hex: normalizedColorHex ? `#${normalizedColorHex}` : null,
      color_int: colorInt,
      price,
      frame_only_price,
      regular_lens_price,
      photochromic_price,
      stock_quantity,
      min_stock_level,
      supplier,
      image_url: null
    });

    let image_url = null;
    if (image_data) {
      try {
        image_url = await persistProductImage(image_data, image_name);
        await product.update({ image_url });
      } catch (imageError) {
        console.error('Image persistence failed:', imageError);
        // Product created without image, continue
      }
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

// Update product
router.put('/products/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const updates = { ...req.body };

    if (updates.category && !ALLOWED_PRODUCT_CATEGORIES.includes(updates.category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Use one of: ${ALLOWED_PRODUCT_CATEGORIES.join(', ')}`
      });
    }

    if (updates.image_data) {
      const image_url = await persistProductImage(updates.image_data, updates.image_name);
      await removeManagedProductImage(product.image_url);
      updates.image_url = image_url;
    }

    delete updates.image_data;
    delete updates.image_name;

    // Log stock changes if stock_quantity is being updated
    if (updates.stock_quantity !== undefined && updates.stock_quantity !== product.stock_quantity) {
      const previousStock = product.stock_quantity;
      const newStock = updates.stock_quantity;
      const quantityAdded = newStock - previousStock;
      
      // Determine change type
      let changeType = 'adjustment';
      if (quantityAdded > 0) {
        changeType = 'add';
        updates.last_restock_date = new Date();
      } else if (quantityAdded < 0) {
        changeType = 'remove';
      }

      // Create audit log
      try {
        await StockAuditLog.create({
          product_id: product.product_id,
          admin_id: req.user.user_id,
          previous_stock: previousStock,
          new_stock: newStock,
          quantity_added: quantityAdded,
          change_type: changeType,
          reason: updates.stock_reason || null
        });
      } catch (auditError) {
        if (auditError.parent && auditError.parent.code === 'ER_NO_SUCH_TABLE') {
          await StockAuditLog.sync();
          await StockAuditLog.create({
            product_id: product.product_id,
            admin_id: req.user.user_id,
            previous_stock: previousStock,
            new_stock: newStock,
            quantity_added: quantityAdded,
            change_type: changeType,
            reason: updates.stock_reason || null
          });
        } else {
          throw auditError;
        }
      }

      // Remove stock_reason from updates as it's not a product field
      delete updates.stock_reason;
    }

    await product.update(updates);

    res.json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
});

// Delete product
router.delete('/products/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    
    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete related StockAuditLog records first
    await StockAuditLog.destroy({
      where: { product_id: productId }
    });

    // Delete related Cart items
    await Cart.destroy({
      where: { product_id: productId }
    });

    // Delete related OrderItem records
    await OrderItem.destroy({
      where: { product_id: productId }
    });

    // Remove product image
    await removeManagedProductImage(product.image_url);

    // Delete the product
    await product.destroy();

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
});

// Archive product (alternative to deletion)
router.put('/products/:id/archive', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Preserve stock metadata when archiving so restore keeps the original quantity.
    await product.update({
      is_active: false
    });

    res.json({
      success: true,
      message: 'Product archived successfully',
      product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to archive product',
      error: error.message
    });
  }
});

// Get all appointments
router.get('/appointments', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const appointments = await Appointment.findAll({
      include: [
        {
          model: Customer,
          include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }]
        },
        { model: User, as: 'staff', attributes: ['full_name'] },
        { model: User, as: 'creator', attributes: ['full_name', 'email'] }
      ],
      order: [['appointment_date', 'DESC']]
    });

    res.json({
      success: true,
      appointments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

// Update appointment status
router.put('/appointments/:id/status', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    await appointment.update({ status });
    res.json({ success: true, message: 'Appointment status updated', appointment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update appointment', error: error.message });
  }
});

// Get all orders
router.get('/orders', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const orders = await Order.findAll({
      include: [
        {
          model: Customer,
          include: [{ model: User, attributes: ['full_name', 'email'] }]
        },
        { model: OrderItem, include: [{ model: Product }] }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

// Get inventory
router.get('/inventory', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const products = await Product.findAll({
      attributes: ['product_id', 'product_name', 'category', 'color_name', 'color_hex', 'color_int', 'stock_quantity', 'min_stock_level', 'price', 'last_restock_date'],
      order: [['stock_quantity', 'ASC']]
    });

    res.json({
      success: true,
      inventory: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory',
      error: error.message
    });
  }
});

// Get single order by id (admin)
router.get('/orders/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id, {
      include: [
        { model: OrderItem, include: [{ model: Product }] },
        { model: Customer, include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }] }
      ]
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch order', error: error.message });
  }
});

// ===== SCHEDULE MANAGEMENT ROUTES =====

// Get all schedules
router.get('/schedules', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const schedules = await Schedule.findAll({
      order: [['schedule_date', 'ASC'], ['day_of_week', 'ASC']]
    });
    res.json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch schedules', error: error.message });
  }
});

// Create or update schedule
router.post('/schedules', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const {
      schedule_id,
      schedule_date,
      day_of_week,
      start_time,
      end_time,
      is_operational,
      max_appointments_per_slot,
      slot_duration_minutes
    } = req.body;

    const normalizedDate = schedule_date ? String(schedule_date).trim() : null;
    const hasDate = Boolean(normalizedDate);
    const hasDay = Boolean(day_of_week);

    if (hasDate && hasDay) {
      return res.status(400).json({ success: false, message: 'Cannot set both a specific date and a weekday for the same schedule' });
    }

    if (!hasDate && !hasDay) {
      return res.status(400).json({ success: false, message: 'Either a specific date or a weekday is required for a schedule' });
    }

    const scheduleValues = {
      schedule_date: hasDate ? normalizedDate : null,
      day_of_week: hasDate ? null : day_of_week,
      start_time,
      end_time,
      is_operational,
      max_appointments_per_slot,
      slot_duration_minutes
    };

    let schedule;
    if (schedule_id) {
      schedule = await Schedule.findByPk(schedule_id);
    }

    if (!schedule) {
      const findCriteria = hasDate
        ? { schedule_date: normalizedDate }
        : { day_of_week };
      schedule = await Schedule.findOne({ where: findCriteria });
    }

    if (schedule) {
      await schedule.update(scheduleValues);
    } else {
      schedule = await Schedule.create(scheduleValues);
    }

    res.json({
      success: true,
      message: schedule_id || schedule ? 'Schedule saved successfully' : 'Schedule created',
      schedule
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save schedule', error: error.message });
  }
});

// Delete schedule
router.delete('/schedules/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await Schedule.destroy({
      where: { schedule_id: req.params.id }
    });

    if (deleted) {
      res.json({ success: true, message: 'Schedule deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Schedule not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete schedule', error: error.message });
  }
});

// Get all holidays
router.get('/holidays', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const holidays = await Holiday.findAll({
      order: [['holiday_date', 'ASC']]
    });
    res.json({ success: true, holidays });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch holidays', error: error.message });
  }
});

// Create holiday
router.post('/holidays', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { holiday_date, holiday_name, description, is_recurring } = req.body;

    const holiday = await Holiday.create({
      holiday_date,
      holiday_name,
      description,
      is_recurring
    });

    res.json({ success: true, message: 'Holiday created', holiday });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      res.status(400).json({ success: false, message: 'Holiday already exists for this date' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to create holiday', error: error.message });
    }
  }
});

// Update holiday
router.put('/holidays/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { holiday_date, holiday_name, description, is_recurring } = req.body;

    const holiday = await Holiday.findByPk(req.params.id);
    if (!holiday) {
      return res.status(404).json({ success: false, message: 'Holiday not found' });
    }

    await holiday.update({
      holiday_date,
      holiday_name,
      description,
      is_recurring
    });

    res.json({ success: true, message: 'Holiday updated', holiday });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update holiday', error: error.message });
  }
});

// Delete holiday
router.delete('/holidays/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await Holiday.destroy({
      where: { holiday_id: req.params.id }
    });

    if (deleted) {
      res.json({ success: true, message: 'Holiday deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Holiday not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete holiday', error: error.message });
  }
});

// Get blocked slots
router.get('/blocked-slots', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const blockedSlots = await BlockedSlot.findAll({
      include: [{ model: User, as: 'creator', attributes: ['full_name'] }],
      order: [['block_date', 'ASC'], ['start_time', 'ASC']]
    });
    res.json({ success: true, blockedSlots });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch blocked slots', error: error.message });
  }
});

// Create blocked slot
router.post('/blocked-slots', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { block_date, start_time, end_time, reason } = req.body;

    const blockedSlot = await BlockedSlot.create({
      block_date,
      start_time,
      end_time,
      reason,
      created_by: req.user.user_id
    });

    res.json({ success: true, message: 'Blocked slot created', blockedSlot });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create blocked slot', error: error.message });
  }
});

// Delete blocked slot
router.delete('/blocked-slots/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await BlockedSlot.destroy({
      where: { blocked_slot_id: req.params.id }
    });

    if (deleted) {
      res.json({ success: true, message: 'Blocked slot deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Blocked slot not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete blocked slot', error: error.message });
  }
});

// Get staff service assignments
router.get('/staff-assignments', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const assignments = await StaffServiceAssignment.findAll({
      include: [{ model: User, as: 'staff', attributes: ['full_name', 'email'] }],
      order: [['staff_id', 'ASC'], ['service_type', 'ASC']]
    });
    res.json({ success: true, assignments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch staff assignments', error: error.message });
  }
});

// Create staff service assignment
router.post('/staff-assignments', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { staff_id, service_type } = req.body;

    const assignment = await StaffServiceAssignment.create({
      staff_id,
      service_type,
      is_active: true
    });

    res.json({ success: true, message: 'Staff assignment created', assignment });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      res.status(400).json({ success: false, message: 'Staff is already assigned to this service' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to create staff assignment', error: error.message });
    }
  }
});

// Update staff assignment status
router.put('/staff-assignments/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { is_active } = req.body;

    const assignment = await StaffServiceAssignment.findByPk(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    await assignment.update({ is_active });

    res.json({ success: true, message: 'Assignment updated', assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update assignment', error: error.message });
  }
});

// Delete staff assignment
router.delete('/staff-assignments/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await StaffServiceAssignment.destroy({
      where: { assignment_id: req.params.id }
    });

    if (deleted) {
      res.json({ success: true, message: 'Staff assignment deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Assignment not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete assignment', error: error.message });
  }
});

// Get available time slots for a date
router.get('/available-slots', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date parameter required' });
    }

    const dateObj = new Date(date);
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

    // Check if it's a holiday
    const holiday = await Holiday.findOne({
      where: { holiday_date: date }
    });

    if (holiday) {
      return res.json({
        success: true,
        available: false,
        reason: `Holiday: ${holiday.holiday_name}`,
        slots: []
      });
    }

    // Get schedule for the day
    const schedule = await Schedule.findOne({
      where: { day_of_week: dayOfWeek, is_operational: true }
    });

    if (!schedule) {
      return res.json({
        success: true,
        available: false,
        reason: 'Not operational on this day',
        slots: []
      });
    }

    // Get blocked slots for the date
    const blockedSlots = await BlockedSlot.findAll({
      where: { block_date: date }
    });

    // Generate time slots
    const slots = [];
    let currentTime = new Date(`${date}T${schedule.start_time}`);
    const endTime = new Date(`${date}T${schedule.end_time}`);

    while (currentTime < endTime) {
      const slotEnd = new Date(currentTime.getTime() + schedule.slot_duration_minutes * 60000);

      // Check if slot is blocked
      const isBlocked = blockedSlots.some(blocked =>
        (currentTime >= new Date(`${date}T${blocked.start_time}`) &&
         currentTime < new Date(`${date}T${blocked.end_time}`)) ||
        (slotEnd > new Date(`${date}T${blocked.start_time}`) &&
         slotEnd <= new Date(`${date}T${blocked.end_time}`))
      );

      if (!isBlocked) {
        slots.push({
          start_time: currentTime.toTimeString().slice(0, 5),
          end_time: slotEnd.toTimeString().slice(0, 5),
          available: true
        });
      }

      currentTime = slotEnd;
    }

    res.json({
      success: true,
      available: slots.length > 0,
      slots
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get available slots', error: error.message });
  }
});

// ===== REPORTS ROUTES =====

// Generate Report
router.post('/reports/generate', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { report_type, date_from, date_to } = req.body;
    let reportData = {};
    const currentDate = new Date().toISOString();

    // Generate different types of reports
    if (report_type === 'sales') {
      const orders = await Order.findAll({
        attributes: ['order_id', 'total_amount', 'status', 'order_date'],
        include: [{ model: Customer, attributes: ['customer_name'], include: [{ model: User, attributes: ['full_name'] }] }],
        where: {
          order_date: {
            $gte: date_from || new Date(Date.now() - 30*24*60*60*1000),
            $lte: date_to || new Date()
          }
        },
        order: [['order_date', 'DESC']]
      });
      
      const totalSales = orders.reduce((sum, order) => sum + parseFloat(order.total_amount), 0);
      reportData = {
        type: 'Sales Report',
        total_orders: orders.length,
        total_sales: totalSales.toFixed(2),
        data: orders
      };
    } else if (report_type === 'inventory') {
      const products = await Product.findAll({
        attributes: ['product_id', 'product_name', 'stock_quantity', 'min_stock_level', 'price']
      });
      
      const lowStockProducts = products.filter(p => p.stock_quantity <= p.min_stock_level);
      reportData = {
        type: 'Inventory Report',
        total_products: products.length,
        low_stock_count: lowStockProducts.length,
        total_value: products.reduce((sum, p) => sum + (p.stock_quantity * p.price), 0).toFixed(2),
        data: products
      };
    } else if (report_type === 'appointments') {
      const appointments = await Appointment.findAll({
        attributes: ['appointment_id', 'service_type', 'status', 'appointment_date', 'appointment_time'],
        include: [
          { model: Customer, attributes: ['customer_name'], include: [{ model: User, attributes: ['full_name'] }] },
          { model: User, as: 'staff', attributes: ['full_name'] }
        ],
        where: {
          appointment_date: {
            $gte: date_from || new Date(Date.now() - 30*24*60*60*1000),
            $lte: date_to || new Date()
          }
        },
        order: [['appointment_date', 'DESC']]
      });
      
      reportData = {
        type: 'Appointments Report',
        total_appointments: appointments.length,
        completed: appointments.filter(a => a.status === 'completed').length,
        pending: appointments.filter(a => a.status === 'pending').length,
        cancelled: appointments.filter(a => a.status === 'cancelled').length,
        data: appointments
      };
    } else if (report_type === 'customers') {
      const customers = await User.findAll({
        attributes: ['user_id', 'full_name', 'email', 'phone', 'created_at'],
        where: { role: 'customer' },
        include: [{ model: Order, attributes: ['order_id', 'total_amount'] }]
      });
      
      reportData = {
        type: 'Customers Report',
        total_customers: customers.length,
        total_orders: customers.reduce((sum, c) => sum + (c.Orders?.length || 0), 0),
        total_revenue: customers.reduce((sum, c) => sum + (c.Orders?.reduce((s, o) => s + parseFloat(o.total_amount), 0) || 0), 0).toFixed(2),
        data: customers
      };
    } else if (report_type === 'products') {
      const products = await Product.findAll({
      attributes: ['product_id', 'product_name', 'category', 'color_name', 'color_hex', 'color_int', 'price', 'stock_quantity', 'created_at'],
      });
      
      reportData = {
        type: 'Products Report',
        total_products: products.length,
        by_category: {},
        data: products
      };

      // Count by category
      products.forEach(p => {
        reportData.by_category[p.category] = (reportData.by_category[p.category] || 0) + 1;
      });
    }

    // Store report metadata
    const report = {
      report_id: 'RPT-' + Date.now(),
      type: reportData.type,
      report_type,
      generated_date: currentDate,
      generated_by: req.user.user_id,
      date_from: date_from || new Date(Date.now() - 30*24*60*60*1000).toISOString(),
      date_to: date_to || new Date().toISOString(),
      summary: reportData,
      status: 'completed'
    };

    res.json({
      success: true,
      message: 'Report generated successfully',
      report
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to generate report', error: error.message });
  }
});

// Get all reports (in-memory storage for this session)
router.get('/reports', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    // In a real application, you would query a reports table from the database
    // For now, returning an empty list since we're generating on-demand
    res.json({
      success: true,
      reports: []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch reports', error: error.message });
  }
});

// ===== ARCHIVED RECORDS ROUTES =====

// Get archived records
router.get('/archived', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { archive_type, date_from, date_to } = req.query;

    const archivedProducts = await Product.findAll({
      where: { is_active: false },
      order: [['updated_at', 'DESC']]
    });

    const archivedUsers = await User.findAll({
      where: { is_active: false },
      order: [['updated_at', 'DESC']]
    });

    let archivedRecords = [
      ...archivedProducts.map(product => ({
        archived_id: `PROD-${product.product_id}`,
        type: 'product',
        record_id: product.product_id,
        name: product.product_name,
        archived_date: product.updated_at ? product.updated_at.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        archived_by: 'Admin User',
        reason: 'Product archived',
        original_data: product.toJSON()
      })),
      ...archivedUsers.map(user => ({
        archived_id: `USR-${user.user_id}`,
        type: 'user',
        record_id: user.user_id,
        name: user.full_name || user.email || 'User',
        archived_date: user.updated_at ? user.updated_at.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        archived_by: 'Admin User',
        reason: 'User archived',
        original_data: sanitizeUser(user)
      }))
    ];

    if (archive_type && archive_type !== '') {
      const typeMap = { 'users': 'user', 'products': 'product', 'orders': 'order', 'appointments': 'appointment' };
      const filterType = typeMap[archive_type];
      if (filterType) {
        archivedRecords = archivedRecords.filter(r => r.type === filterType);
      }
    }

    if (date_from || date_to) {
      const fromDate = date_from ? new Date(date_from) : new Date(0);
      const toDate = date_to ? new Date(date_to) : new Date();

      archivedRecords = archivedRecords.filter(r => {
        const archiveDate = new Date(r.archived_date);
        return archiveDate >= fromDate && archiveDate <= toDate;
      });
    }

    res.json({
      success: true,
      archived_records: archivedRecords
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch archived records', error: error.message });
  }
});

// Archive a record
router.post('/archived', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { record_type, record_id, reason } = req.body;

    const archivedRecord = {
      archived_id: 'ARC-' + Date.now(),
      type: record_type,
      record_id,
      archived_date: new Date().toISOString().split('T')[0],
      archived_by: req.user.full_name || 'Admin User',
      reason: reason || 'User archived',
      original_data: {}
    };

    res.json({
      success: true,
      message: 'Record archived successfully',
      archived_record: archivedRecord
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to archive record', error: error.message });
  }
});

// Restore archived record
router.post('/archived/:id/restore', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (id.startsWith('PROD-')) {
      const productId = parseInt(id.replace('PROD-', ''), 10);
      const product = await Product.findByPk(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Archived product not found' });
      }

      await product.update({ is_active: true });
      return res.json({ success: true, message: 'Archived product restored successfully', restored_id: id });
    }

    if (id.startsWith('USR-')) {
      const userId = parseInt(id.replace('USR-', ''), 10);
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Archived user not found' });
      }

      await user.update({ is_active: true });
      return res.json({ success: true, message: 'Archived user restored successfully', restored_id: id });
    }

    res.status(400).json({ success: false, message: 'Unsupported archived record type' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to restore record', error: error.message });
  }
});

// Delete archived record permanently
router.delete('/archived/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (id.startsWith('PROD-')) {
      const productId = parseInt(id.replace('PROD-', ''), 10);
      const product = await Product.findByPk(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Archived product not found' });
      }

      await StockAuditLog.destroy({ where: { product_id: productId } });
      await Cart.destroy({ where: { product_id: productId } });
      await OrderItem.destroy({ where: { product_id: productId } });
      await removeManagedProductImage(product.image_url);
      await product.destroy();

      return res.json({ success: true, message: 'Archived product deleted permanently' });
    }

    if (id.startsWith('USR-')) {
      const userId = parseInt(id.replace('USR-', ''), 10);
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Archived user not found' });
      }

      await user.destroy();
      return res.json({ success: true, message: 'Archived user deleted permanently' });
    }

    res.status(400).json({ success: false, message: 'Unsupported archived record type' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete archived record', error: error.message });
  }
});

// ===== STOCK AUDIT LOG ROUTES =====

// Get stock audit logs (all or filtered by product)
router.get('/stock-history', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { product_id, limit = 50, offset = 0, date_from, date_to } = req.query;

    let whereClause = {};
    if (product_id) {
      whereClause.product_id = product_id;
    }

    if (date_from || date_to) {
      whereClause.created_at = {};
      if (date_from) {
        whereClause.created_at[require('sequelize').Op.gte] = new Date(date_from);
      }
      if (date_to) {
        whereClause.created_at[require('sequelize').Op.lte] = new Date(date_to);
      }
    }

    const logs = await StockAuditLog.findAll({
      where: whereClause,
      include: [
        {
          model: Product,
          attributes: ['product_id', 'product_name', 'category']
        },
        {
          model: User,
          attributes: ['user_id', 'full_name', 'email'],
          as: 'admin'
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await StockAuditLog.count({ where: whereClause });

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stock history',
      error: error.message
    });
  }
});

// Get stock history for a specific product
router.get('/stock-history/:product_id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { product_id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const product = await Product.findByPk(product_id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const logs = await StockAuditLog.findAll({
      where: { product_id },
      include: [
        {
          model: User,
          attributes: ['user_id', 'full_name', 'email'],
          as: 'admin'
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await StockAuditLog.count({ where: { product_id } });

    // Calculate statistics
    const stats = {
      total_changes: total,
      total_added: logs.reduce((sum, log) => sum + (log.quantity_added > 0 ? log.quantity_added : 0), 0),
      total_removed: logs.reduce((sum, log) => sum + (log.quantity_added < 0 ? Math.abs(log.quantity_added) : 0), 0),
      current_stock: product.stock_quantity,
      last_restock: product.last_restock_date
    };

    res.json({
      success: true,
      product: {
        product_id: product.product_id,
        product_name: product.product_name,
        category: product.category
      },
      stats,
      history: logs,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product stock history',
      error: error.message
    });
  }
});

// Get recent stock additions (admin dashboard)
router.get('/stock-additions/recent', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const recentAdditions = await StockAuditLog.findAll({
      where: {
        change_type: 'add'
      },
      include: [
        {
          model: Product,
          attributes: ['product_id', 'product_name', 'category']
        },
        {
          model: User,
          attributes: ['user_id', 'full_name', 'email'],
          as: 'admin'
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: recentAdditions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent stock additions',
      error: error.message
    });
  }
});

module.exports = router;

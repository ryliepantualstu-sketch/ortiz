const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Appointment = require('../models/Appointment');
const Order = require('../models/Order');
const CustomerFeedback = require('../models/CustomerFeedback');
const OrderItem = require('../models/OrderItem');
const Cart = require('../models/Cart');
const QRCode = require('../models/QRCode');
const QrcodeLibrary = require('qrcode');
const Schedule = require('../models/Schedule');
const Holiday = require('../models/Holiday');
const BlockedSlot = require('../models/BlockedSlot');
const { isTimeWithinSchedule, isAppointmentSlotInPast, buildAvailableAppointmentSlots, buildAppointmentSlotList, parseTimeToMinutes, normalizeAppointmentDate, normalizeAppointmentTime, isSundayDate } = require('../utils/appointmentAvailability');
const { persistCustomerDiscountCardImage, getOrCreateCustomerRecord } = require('../utils/customerProfile');
const { notifyAppointmentUpdate, notifyOrderUpdate, notifyStaffPickupDateRequest } = require('../utils/notificationService');
const { attachOrderQrDetails } = require('../utils/orderQr');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { getManilaToday, getReservationPickupDeadline, isValidPickupDate } = require('../utils/orderPickup');

const { getPriceByLensOption } = require('../utils/pricing');
const { normalizeCustomerName, findCustomerNameConflict } = require('../utils/customerName');

router.put('/password', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;
    if (
      typeof current_password !== 'string' || !current_password ||
      typeof new_password !== 'string' || !new_password ||
      typeof confirm_password !== 'string' || !confirm_password
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your current password and fill in all new password fields'
      });
    }

    if (typeof new_password !== 'string' || new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match'
      });
    }

    if (current_password === new_password) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password'
      });
    }

    const user = await User.findByPk(req.user.user_id);
    if (!user || !(await user.comparePassword(current_password))) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    await user.update({ password: new_password });
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Failed to change customer password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

function calculateCustomerDiscount(customer, amount) {
  const isSenior = Boolean(customer?.is_senior);
  const isPwd = Boolean(customer?.is_pwd);
  const discountRate = (isSenior || isPwd) ? 0.20 : 0;
  const discountType = isSenior ? 'senior' : (isPwd ? 'pwd' : null);
  const discountAmount = Number((amount * discountRate).toFixed(2));
  const totalAfterDiscount = Number((amount - discountAmount).toFixed(2));
  return {
    discount_type: discountType,
    discount_amount: discountAmount,
    total_amount: totalAfterDiscount
  };
}

async function findScheduleForDate(dateValue) {
  const dateStr = normalizeAppointmentDate(dateValue);
  if (!dateStr) return null;

  const dateObject = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(dateObject.getTime())) return null;

  const requestedDay = dateObject.toLocaleDateString('en-US', { weekday: 'long' });
  const dateSchedule = await Schedule.findOne({ where: { schedule_date: dateStr } });
  if (dateSchedule) {
    return dateSchedule;
  }

  return await Schedule.findOne({
    where: {
      day_of_week: requestedDay,
      is_operational: true
    }
  });
}

function buildAppointmentQrPayload(appointment, user) {
  return JSON.stringify({
    type: 'appointment',
    appointment_id: appointment.appointment_id,
    customer_id: appointment.customer_id,
    customer_name: user.full_name,
    appointment_date: normalizeAppointmentDate(appointment.appointment_date),
    appointment_time: normalizeAppointmentTime(appointment.appointment_time),
    service_type: appointment.service_type
  });
}

async function attachAppointmentQrDetails(appointments) {
  if (appointments.length === 0) {
    return [];
  }

  const qrCodes = await QRCode.findAll({
    where: {
      code_type: 'Appointment',
      reference_id: {
        [Op.in]: appointments.map((appointment) => appointment.appointment_id)
      }
    }
  });

  const qrCodeByReferenceId = new Map(
    qrCodes.map((qrCode) => [qrCode.reference_id, qrCode])
  );

  return Promise.all(appointments.map(async (appointment) => {
    const qrCode = qrCodeByReferenceId.get(appointment.appointment_id);
    const qrImage = qrCode
      ? await QrcodeLibrary.toDataURL(qrCode.qr_code_data)
      : null;

    return {
      ...appointment.toJSON(),
      qr_code: qrImage,
      qr_payload: qrCode?.qr_code_data || null,
      qr_ready: Boolean(qrCode),
      qr_verified: Boolean(qrCode?.is_used),
      qr_scanned_at: qrCode?.scanned_at || null
    };
  }));
}

// Get customer dashboard stats
router.get('/dashboard-stats', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, req.user.phone || null);
    
    console.log('Dashboard Stats - User ID:', req.user.user_id);
    console.log('Dashboard Stats - Customer:', customer);

    const totalAppointments = await Appointment.count({ where: { customer_id: customer.customer_id } });
    
    // Count upcoming appointments - dates from today onwards
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('Today for comparison:', today);
    
    const upcomingAppointments = await Appointment.count({
      where: {
        customer_id: customer.customer_id,
        appointment_date: { [Op.gte]: today }
      }
    });
    
    const totalOrders = await Order.count({ where: { customer_id: customer.customer_id } });
    
    // Count pending orders - orders that are NOT completed or cancelled
    const pendingOrders = await Order.count({
      where: {
        customer_id: customer.customer_id,
        status: {
          [Op.notIn]: ['completed', 'cancelled']
        }
      }
    });
    
    const cartItems = await Cart.count({ where: { customer_id: customer.customer_id } });

    console.log('Dashboard Stats Result:', {
      totalAppointments,
      upcomingAppointments,
      totalOrders,
      pendingOrders,
      cartItems
    });

    res.json({
      success: true,
      stats: {
        total_appointments: totalAppointments,
        upcoming_appointments: upcomingAppointments,
        total_orders: totalOrders,
        pending_orders: pendingOrders,
        cart_items: cartItems
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
});

// Get all products
router.get('/products', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    console.log('GET /customer/products', { user: req.user && req.user.user_id, query: req.query });
    const { category } = req.query;
    const where = category ? { category } : {};

    const products = await Product.findAll({
      where,
      order: [['product_name', 'ASC']]
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

// Get a single product detail for customer quick-view refresh
router.get('/products/:id', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    console.log('GET /customer/products/:id', { user: req.user && req.user.user_id, id: req.params.id });
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
});

// Add to cart
router.post('/cart/add', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { product_id, quantity, lens_option } = req.body;
    const normalizedQuantity = Number(quantity);
    const selectedLensOption = lens_option || 'regular-lens';
    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, req.user.phone || null);

    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive whole number'
      });
    }

    const product = await Product.findByPk(product_id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (product.stock_quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'This product is currently out of stock'
      });
    }

    // Safely add/merge cart items. The DB has a UNIQUE(customer_id, product_id) constraint
    // so avoid creating duplicate rows for different lens options by merging when needed.
    let cartItem = await Cart.findOne({
      where: { customer_id: customer.customer_id, product_id, lens_option: selectedLensOption }
    });

    if (cartItem) {
      const newQuantity = cartItem.quantity + normalizedQuantity;
      if (newQuantity > product.stock_quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stock_quantity - cartItem.quantity} more item${product.stock_quantity - cartItem.quantity === 1 ? '' : 's'} can be added to the cart`
        });
      }
      cartItem.quantity = newQuantity;
      await cartItem.save();
    } else {
      // Try to find any existing cart row for this customer+product (regardless of lens_option)
      let existing = await Cart.findOne({ where: { customer_id: customer.customer_id, product_id } });
      if (existing) {
        // Merge into the existing row to respect UNIQUE constraint.
        const newQuantity = existing.quantity + normalizedQuantity;
        if (newQuantity > product.stock_quantity) {
          return res.status(400).json({
            success: false,
            message: `Only ${product.stock_quantity - existing.quantity} more item${product.stock_quantity - existing.quantity === 1 ? '' : 's'} can be added to the cart`
          });
        }
        existing.quantity = newQuantity;
        // update lens_option to the newly selected option (best-effort merge)
        existing.lens_option = selectedLensOption;
        await existing.save();
        cartItem = existing;
      } else {
        if (normalizedQuantity > product.stock_quantity) {
          return res.status(400).json({
            success: false,
            message: `Only ${product.stock_quantity} item${product.stock_quantity === 1 ? '' : 's'} are available`
          });
        }
        // Create new cart row
        try {
          cartItem = await Cart.create({
            customer_id: customer.customer_id,
            product_id,
            quantity: normalizedQuantity,
            lens_option: selectedLensOption
          });
        } catch (createErr) {
          // If a race-condition or unique-constraint occurs, attempt to merge into existing row
          if (createErr && createErr.name === 'SequelizeUniqueConstraintError') {
            const fallback = await Cart.findOne({ where: { customer_id: customer.customer_id, product_id } });
            if (fallback) {
              const newQuantity = fallback.quantity + normalizedQuantity;
              if (newQuantity > product.stock_quantity) {
                return res.status(400).json({
                  success: false,
                  message: `Only ${product.stock_quantity - fallback.quantity} more item${product.stock_quantity - fallback.quantity === 1 ? '' : 's'} can be added to the cart`
                });
              }
              fallback.quantity = newQuantity;
              fallback.lens_option = selectedLensOption;
              await fallback.save();
              cartItem = fallback;
            } else {
              throw createErr;
            }
          } else {
            throw createErr;
          }
        }
      }
    }

    res.json({
      success: true,
      message: 'Item added to cart',
      cartItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add item to cart',
      error: error.message
    });
  }
});

// Update cart quantity
router.put('/cart/:cartId', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { quantity } = req.body;
    const normalizedQuantity = Number(quantity);
    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, req.user.phone || null);

    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive whole number'
      });
    }

    const cartItem = await Cart.findOne({
      where: {
        cart_id: req.params.cartId,
        customer_id: customer.customer_id
      },
      include: [{ model: Product }]
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    if (!cartItem.Product) {
      return res.status(404).json({
        success: false,
        message: 'Product linked to cart item not found'
      });
    }

    if (normalizedQuantity > cartItem.Product.stock_quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${cartItem.Product.stock_quantity} item${cartItem.Product.stock_quantity === 1 ? '' : 's'} are available for this product`
      });
    }

    await cartItem.update({ quantity: normalizedQuantity });

    res.json({
      success: true,
      message: 'Cart item updated successfully',
      cartItem: {
        cart_id: cartItem.cart_id,
        product_id: cartItem.product_id,
        product_name: cartItem.Product?.product_name,
        price: cartItem.Product?.price,
        quantity: cartItem.quantity,
        item_total: Number(cartItem.Product?.price || 0) * cartItem.quantity
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update cart item',
      error: error.message
    });
  }
});

// Get cart
router.get('/cart', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    console.log('GET /customer/cart', { user: req.user && req.user.user_id });
    const user = await User.findByPk(req.user.user_id);
    let customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, user?.phone || null);

    const cartItems = await Cart.findAll({
      where: { customer_id: customer.customer_id },
      include: [{ model: Product }]
    });

    const cart = (cartItems || []).map(item => {
      const itemPrice = getPriceByLensOption(item.Product, item.lens_option);
      return {
        cart_id: item.cart_id,
        product_id: item.product_id,
        product_name: item.Product.product_name,
        price: itemPrice,
        quantity: item.quantity,
        lens_option: item.lens_option || 'regular-lens',
        item_total: item.quantity * itemPrice,
        image_url: item.Product?.image_url || null
      };
    });

    res.json({
      success: true,
      cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cart',
      error: error.message
    });
  }
});

// Remove from cart
router.delete('/cart/:cartId', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, req.user.phone || null);
    const cartItem = await Cart.findOne({
      where: {
        cart_id: req.params.cartId,
        customer_id: customer.customer_id
      }
    });
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    await cartItem.destroy();

    res.json({
      success: true,
      message: 'Item removed from cart'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart',
      error: error.message
    });
  }
});

// Get available appointment slots for a date
router.get('/available-slots', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date parameter required' });
    }

    const dateStr = normalizeAppointmentDate(date);
    if (!dateStr) {
      return res.status(400).json({ success: false, message: 'Invalid date parameter' });
    }

    if (isSundayDate(dateStr)) {
      return res.json({ success: true, available: false, reason: 'Ortiz Optical is closed on Sundays', slots: [] });
    }

    const dateObj = new Date(`${dateStr}T00:00:00`);
    const holiday = await Holiday.findOne({ where: { holiday_date: dateStr } });
    if (holiday) {
      return res.json({ success: true, available: false, reason: `Holiday: ${holiday.holiday_name}`, slots: [] });
    }

    const schedule = await findScheduleForDate(dateStr);
    if (!schedule || !schedule.is_operational) {
      return res.json({ success: true, available: false, reason: 'Not operational on this day', slots: [] });
    }

    const blockedSlots = await BlockedSlot.findAll({ where: { block_date: dateStr } });
    const existingAppointments = await Appointment.findAll({
      where: {
        appointment_date: dateStr,
        status: { [Op.ne]: 'cancelled' }
      },
      attributes: ['appointment_date', 'appointment_time']
    });

    const slots = buildAppointmentSlotList(
      dateStr,
      schedule,
      blockedSlots,
      existingAppointments
    );

    res.json({ success: true, available: slots.some((slot) => slot.available), slots, reason: slots.some((slot) => slot.available) ? null : 'No appointment slots are available for this date' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get available slots', error: error.message });
  }
});

// Book appointment
router.post('/appointments/book', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { appointment_date, appointment_time, service_type } = req.body;
    console.log('Appointment book request:', { user: req.user && req.user.user_id, appointment_date, appointment_time, service_type });
    const user = await User.findByPk(req.user.user_id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, user.phone || null);

    const reservationOrderId = Number(req.body.reservation_order_id);
    if (service_type === 'Eye Checkup' && Number.isInteger(reservationOrderId) && reservationOrderId > 0) {
      const reservation = await Order.findOne({ where: {
        order_id: reservationOrderId,
        customer_id: customer.customer_id,
        reservation_only: true,
        requires_eye_checkup: true,
        status: 'processing'
      } });
      if (!reservation) {
        return res.status(409).json({ success: false, message: 'This reservation is not confirmed for an eye check-up' });
      }
      const existingReservationAppointment = await Appointment.findOne({ where: { reservation_order_id: reservationOrderId, status: { [Op.ne]: 'cancelled' } } });
      if (existingReservationAppointment) {
        return res.status(409).json({ success: false, message: 'A checkup is already scheduled for this frame reservation' });
      }
    }

    // Basic validation of date/time
    if (!appointment_date || !appointment_time) {
      return res.status(400).json({ success: false, message: 'appointment_date and appointment_time are required' });
    }

    // Normalize input
    const dateStr = String(appointment_date).trim();
    const timeStr = String(appointment_time).trim();
    if (!dateStr || !timeStr) {
      return res.status(400).json({ success: false, message: 'Invalid appointment date or time' });
    }

    if (isSundayDate(dateStr)) {
      return res.status(400).json({ success: false, message: 'Appointments are not available on Sundays because Ortiz Optical is closed' });
    }

    const requestedDate = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxAllowedDate = new Date(today);
    maxAllowedDate.setFullYear(maxAllowedDate.getFullYear() + 1);

    if (requestedDate < today || requestedDate > maxAllowedDate) {
      return res.status(400).json({
        success: false,
        message: 'Appointments can only be booked within the next 1 year'
      });
    }

    if (isAppointmentSlotInPast(dateStr, timeStr)) {
      return res.status(400).json({
        success: false,
        message: 'The selected appointment time has already passed'
      });
    }

    const requestedDay = requestedDate.toLocaleDateString('en-US', { weekday: 'long' });
    const holiday = await Holiday.findOne({ where: { holiday_date: dateStr } });
    if (holiday) {
      return res.status(400).json({
        success: false,
        message: `Appointments are not available on ${holiday.holiday_name}`
      });
    }

    const schedule = await findScheduleForDate(dateStr);
    if (!schedule) {
      return res.status(400).json({
        success: false,
        message: 'Appointments are not available on this day'
      });
    }

    if (!schedule.is_operational) {
      return res.status(400).json({
        success: false,
        message: 'Appointments are not available on this date'
      });
    }

    if (!isTimeWithinSchedule(timeStr, schedule.start_time, schedule.end_time)) {
      return res.status(400).json({
        success: false,
        message: 'Selected time is outside the admin working hours'
      });
    }

    const lunchBreakStart = parseTimeToMinutes('12:00');
    const lunchBreakEnd = parseTimeToMinutes('13:30');
    const requestedTimeMinutes = parseTimeToMinutes(timeStr);
    if (requestedTimeMinutes !== null && requestedTimeMinutes >= lunchBreakStart && requestedTimeMinutes < lunchBreakEnd) {
      return res.status(400).json({
        success: false,
        message: 'Selected time is within Ortiz lunch break (12:00 - 13:30)'
      });
    }

    const blockedSlots = await BlockedSlot.findAll({ where: { block_date: dateStr } });
    const isBlocked = blockedSlots.some((blockedSlot) => {
      const blockStart = parseTimeToMinutes(blockedSlot.start_time);
      const blockEnd = parseTimeToMinutes(blockedSlot.end_time);
      return requestedTimeMinutes !== null && blockStart !== null && blockEnd !== null && requestedTimeMinutes >= blockStart && requestedTimeMinutes < blockEnd;
    });

    if (isBlocked) {
      return res.status(400).json({
        success: false,
        message: 'Selected time is blocked by the admin'
      });
    }

    // Prevent double-booking for the same date+time (ignore cancelled)
    const normalizedDate = normalizeAppointmentDate(dateStr);
    const normalizedTime = normalizeAppointmentTime(timeStr);
    const existingAppointment = await Appointment.findOne({
      where: {
        [Op.or]: [
          {
            appointment_date: normalizedDate,
            appointment_time: normalizedTime
          },
          {
            appointment_date: normalizedDate,
            appointment_time: `${normalizedTime}:00`
          }
        ],
        status: {
          [Op.ne]: 'cancelled'
        }
      }
    });

    if (existingAppointment) {
      return res.status(409).json({
        success: false,
        message: 'Sorry this schedule is not available'
      });
    }


    const appointment = await Appointment.create({
      customer_id: customer.customer_id,
      reservation_order_id: service_type === 'Eye Checkup' && Number.isInteger(reservationOrderId) && reservationOrderId > 0 ? reservationOrderId : null,
      appointment_date,
      appointment_time,
      service_type,
      status: 'pending',
      created_by: req.user.user_id
    });

    let qrData = null;
    let qrUrl = null;

    // Generate QR code (best-effort). If QR generation fails, still allow booking.
    try {
      const safeUser = user || { full_name: 'Customer' };
      qrData = buildAppointmentQrPayload(appointment, safeUser);
      qrUrl = await QrcodeLibrary.toDataURL(qrData);

      await QRCode.create({
        code_type: 'Appointment',
        reference_id: appointment.appointment_id,
        qr_code_data: qrData
      });

      // include qr in response
      appointment.dataValues.qr_payload = qrData;
      appointment.dataValues.qr_code = qrUrl;
    } catch (qrError) {
      console.error('QR generation failed for appointment', qrError && qrError.message);
    }

    notifyAppointmentUpdate({
      user,
      appointment,
      action: 'booked (pending confirmation)'
    }).catch(e => console.error('Notification error:', e && e.message));

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      appointment: {
        appointment_id: appointment.appointment_id,
        appointment_date: appointment.appointment_date,
        appointment_time: appointment.appointment_time,
        service_type: appointment.service_type,
        qr_payload: qrData,
        qr_code: qrUrl
      }
    });
  } catch (error) {
    console.error('Appointment booking error:', error && error.stack || error);
    res.status(500).json({
      success: false,
      message: 'Failed to book appointment',
      error: error.message,
      stack: error.stack
    });
  }
});

// Get customer appointments
router.get('/appointments', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, req.user.phone || null);

    const appointments = await Appointment.findAll({
      where: { customer_id: customer.customer_id },
      order: [['appointment_date', 'DESC']]
    });

    const appointmentsWithQr = await attachAppointmentQrDetails(appointments);
    const feedback = appointments.length ? await CustomerFeedback.findAll({
      where: { customer_id: customer.customer_id, appointment_id: { [Op.in]: appointments.map(apt => apt.appointment_id) } },
      attributes: ['feedback_id', 'appointment_id', 'rating', 'comment', 'created_at']
    }) : [];
    const feedbackByAppointment = new Map(feedback.map(item => [Number(item.appointment_id), item.toJSON()]));
    const appointmentsWithFeedback = appointmentsWithQr.map(appointment => ({
      ...appointment,
      feedback: feedbackByAppointment.get(Number(appointment.appointment_id)) || null
    }));

    res.json({
      success: true,
      appointments: appointmentsWithFeedback
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

// Update appointment
router.put('/appointments/:id', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { appointment_date, appointment_time, service_type, notes } = req.body;
    const user = await User.findByPk(req.user.user_id);
    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, user?.phone || null);

    const appointment = await Appointment.findOne({
      where: {
        appointment_id: req.params.id,
        customer_id: customer.customer_id
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (['completed', 'cancelled'].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: 'This appointment can no longer be edited'
      });
    }

    if (appointment_date) {
      const requestedDate = new Date(`${String(appointment_date).trim()}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const maxAllowedDate = new Date(today);
      maxAllowedDate.setFullYear(maxAllowedDate.getFullYear() + 1);

      if (requestedDate < today || requestedDate > maxAllowedDate) {
        return res.status(400).json({
          success: false,
          message: 'Appointments can only be booked within the next 1 year'
        });
      }

      const dateStr = normalizeAppointmentDate(appointment_date);
      if (!dateStr) {
        return res.status(400).json({
          success: false,
          message: 'Invalid appointment date'
        });
      }

      if (isSundayDate(dateStr)) {
        return res.status(400).json({
          success: false,
          message: 'Appointments are not available on Sundays because Ortiz Optical is closed'
        });
      }

      const requestedDay = requestedDate.toLocaleDateString('en-US', { weekday: 'long' });
      const holiday = await Holiday.findOne({ where: { holiday_date: dateStr } });
      if (holiday) {
        return res.status(400).json({
          success: false,
          message: `Appointments are not available on ${holiday.holiday_name}`
        });
      }

      const schedule = await findScheduleForDate(dateStr);
      if (!schedule) {
        return res.status(400).json({
          success: false,
          message: 'Appointments are not available on this day'
        });
      }

      if (!schedule.is_operational) {
        return res.status(400).json({
          success: false,
          message: 'Appointments are not available on this date'
        });
      }

      const requestedTime = String(appointment_time || appointment.appointment_time).trim();
      if (isAppointmentSlotInPast(dateStr, requestedTime)) {
        return res.status(400).json({
          success: false,
          message: 'The selected appointment time has already passed'
        });
      }

      if (!isTimeWithinSchedule(requestedTime, schedule.start_time, schedule.end_time)) {
        return res.status(400).json({
          success: false,
          message: 'Selected time is outside the admin working hours'
        });
      }

      const lunchBreakStart = parseTimeToMinutes('12:00');
      const lunchBreakEnd = parseTimeToMinutes('13:30');
      const requestedTimeMinutes = parseTimeToMinutes(requestedTime);
      if (requestedTimeMinutes !== null && requestedTimeMinutes >= lunchBreakStart && requestedTimeMinutes < lunchBreakEnd) {
        return res.status(400).json({
          success: false,
          message: 'Selected time is within Ortiz lunch break (12:00 - 13:30)'
        });
      }

      const blockedSlots = await BlockedSlot.findAll({ where: { block_date: dateStr } });
      const isBlocked = blockedSlots.some((blockedSlot) => {
        const blockStart = parseTimeToMinutes(blockedSlot.start_time);
        const blockEnd = parseTimeToMinutes(blockedSlot.end_time);
        return requestedTimeMinutes !== null && blockStart !== null && blockEnd !== null && requestedTimeMinutes >= blockStart && requestedTimeMinutes < blockEnd;
      });

      if (isBlocked) {
        return res.status(400).json({
          success: false,
          message: 'Selected time is blocked by the admin'
        });
      }
    }

    await appointment.update({
      appointment_date,
      appointment_time,
      service_type,
      notes: notes || null,
      status: 'pending',
      assigned_staff_id: null
    });

    const qrData = buildAppointmentQrPayload(appointment, user);
    const qrRecord = await QRCode.findOne({
      where: {
        code_type: 'Appointment',
        reference_id: appointment.appointment_id
      }
    });

    if (qrRecord && qrRecord.is_used) {
      return res.status(400).json({
        success: false,
        message: 'Verified appointments can no longer be edited'
      });
    }

    if (qrRecord) {
      await qrRecord.update({
        qr_code_data: qrData,
        is_used: false,
        scanned_at: null,
        scanned_by: null
      });
    } else {
      await QRCode.create({
        code_type: 'Appointment',
        reference_id: appointment.appointment_id,
        qr_code_data: qrData
      });
    }

    const [appointmentWithQr] = await attachAppointmentQrDetails([appointment]);

    notifyAppointmentUpdate({
      user,
      appointment,
      action: 'rescheduled / updated'
    }).catch(e => console.error('Notification error:', e && e.message));

    res.json({
      success: true,
      message: 'Appointment updated successfully',
      appointment: appointmentWithQr
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update appointment',
      error: error.message
    });
  }
});

// Cancel appointment without deleting its history
router.patch('/appointments/:id/cancel', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, req.user.phone || null);
    const appointment = await Appointment.findOne({
      where: {
        appointment_id: req.params.id,
        customer_id: customer.customer_id
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (appointment.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Completed appointments cannot be cancelled'
      });
    }

    const qrRecord = await QRCode.findOne({
      where: {
        code_type: 'Appointment',
        reference_id: appointment.appointment_id
      }
    });

    if (qrRecord?.is_used) {
      return res.status(400).json({
        success: false,
        message: 'Verified appointments cannot be cancelled'
      });
    }

    if (qrRecord) {
      await qrRecord.update({ expired_at: new Date() });
    }

    await appointment.update({ status: 'cancelled' });

    notifyAppointmentUpdate({
      user: { full_name: req.user.full_name, email: req.user.email, phone: req.user.phone },
      appointment,
      action: 'cancelled'
    }).catch(e => console.error('Notification error:', e && e.message));

    res.json({
      success: true,
      message: 'Appointment cancelled successfully',
      appointment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to cancel appointment',
      error: error.message
    });
  }
});

// Submit a frame reservation from the customer's cart. Staff approval is required before scheduling.
router.post('/orders/checkout', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const requiresEyeCheckup = typeof req.body?.requires_eye_checkup === 'boolean'
      ? req.body.requires_eye_checkup
      : true;
    const user = await User.findByPk(req.user.user_id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    let customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, user.phone || null);

    // Get cart items
    const cartItems = await Cart.findAll({
      where: { customer_id: customer.customer_id },
      include: [{ model: Product }]
    });

    if (cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Reservation only records the frame selection. Lens options, prescription and payment
    // are handled in person after the eye checkup.
    const order = await Order.create({
      customer_id: customer.customer_id,
      total_amount: 0,
      discount_amount: 0,
      reservation_only: true,
      requires_eye_checkup: requiresEyeCheckup,
      notes: requiresEyeCheckup
        ? 'Frame reservation with eye check-up; lens customization and payment are completed in store.'
        : 'Frame-only reservation; no eye check-up requested. Customer will show the reservation QR and pay in store.',
      status: 'pending'
    });
    for (const cartItem of cartItems) {
      await OrderItem.create({
        order_id: order.order_id,
        product_id: cartItem.product_id,
        quantity: cartItem.quantity,
        price: 0,
        subtotal: 0,
        frame_price: Number(cartItem.Product?.frame_only_price || cartItem.Product?.price || 0),
        lens_price: 0,
        lens_option: 'frame-only'
      });
    }

    // Clear cart
    await Cart.destroy({ where: { customer_id: customer.customer_id } });

    notifyOrderUpdate({
      user,
      order,
      status: 'frame reservation submitted'
    }).catch(e => console.error('Notification error:', e && e.message));

    res.status(201).json({
      success: true,
      message: requiresEyeCheckup
        ? 'Frame reservation submitted. You can schedule your eye checkup after staff confirms it.'
        : 'Frame-only reservation submitted. Show your reservation QR to staff when you visit to pay and claim the frame.',
      order: {
        order_id: order.order_id,
        total_amount: 0,
        status: 'pending',
        items_count: cartItems.length,
        reservation_only: true,
        requires_eye_checkup: requiresEyeCheckup
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

// Set an order pickup date after staff marks it ready
router.put('/orders/:id/pickup-date', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { pickup_date } = req.body;
    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, req.user.phone || null);
    const order = await Order.findOne({
      where: { order_id: req.params.id, customer_id: customer.customer_id }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isFrameOnlyReservation = order.reservation_only && !order.requires_eye_checkup && String(order.status || '').trim().toLowerCase() === 'processing';
    if (!isFrameOnlyReservation && String(order.status || '').trim().toLowerCase() !== 'ready for pickup') {
      return res.status(409).json({ success: false, message: 'Pickup dates are available after the frame reservation is confirmed or the product is ready for pickup' });
    }

    const deadline = isFrameOnlyReservation
      ? getReservationPickupDeadline(order.reservation_confirmed_at || order.updated_at || order.created_at)
      : null;
    if (isFrameOnlyReservation && getManilaToday() > deadline) {
      return res.status(409).json({ success: false, message: 'This frame reservation expired because it was not collected within 3 days of staff confirmation' });
    }
    if (!isValidPickupDate(pickup_date, getManilaToday(), deadline)) {
      return res.status(400).json({ success: false, message: isFrameOnlyReservation
        ? `Choose a pickup date from today through ${deadline}`
        : 'Choose a valid pickup date that is today or later' });
    }
    if (!isFrameOnlyReservation && String(order.payment_status || '').toLowerCase() !== 'paid') {
      return res.status(409).json({ success: false, message: 'Payment must be complete before requesting a pickup date' });
    }
    if (order.pickup_date_request_status === 'pending') {
      return res.status(409).json({ success: false, message: 'A pickup date request is already waiting for staff approval' });
    }
    if (String(order.pickup_date || '') === String(pickup_date)) {
      return res.status(400).json({ success: false, message: 'Choose a different pickup date to submit a change request' });
    }
    if (order.pickup_missed && (order.pickup_reschedule_count || 0) >= 1) {
      return res.status(409).json({ success: false, message: 'This order can no longer be rescheduled for pickup' });
    }

    await order.update({ pickup_date_requested: pickup_date, pickup_date_request_status: 'pending', updated_at: new Date() });
    try {
      const [customerUser, staffUsers] = await Promise.all([
        User.findByPk(req.user.user_id, { attributes: ['full_name'] }),
        User.findAll({ where: { role: 'staff', is_active: true }, attributes: ['email', 'phone'] })
      ]);
      for (const staff of staffUsers) {
        notifyStaffPickupDateRequest({ staff, order, customerName: customerUser?.full_name, pickupDate: pickup_date })
          .catch(error => console.error('Pickup date staff notification failed:', error.message));
      }
    } catch (notificationError) {
      console.error('Could not load staff for pickup date notification:', notificationError.message);
    }
    res.json({ success: true, message: isFrameOnlyReservation
      ? 'Frame collection date request sent. Staff must approve it first, and collection must be within 3 days of confirmation.'
      : 'Pickup date request sent. Staff must approve it first.', order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save pickup date', error: error.message });
  }
});

// Cancel an order (only before it is ready for pickup)
router.patch('/orders/:id/cancel', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, req.user.phone || null);
    const order = await Order.findOne({
      where: { order_id: req.params.id, customer_id: customer.customer_id }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const currentStatus = (order.status || '').trim().toLowerCase();
    if (!['pending', 'processing'].includes(currentStatus)) {
      return res.status(409).json({
        success: false,
        message: currentStatus === 'cancelled'
          ? 'This order is already cancelled'
          : 'Only pending or processing orders can be cancelled. Please contact the shop.'
      });
    }

    await sequelize.transaction(async (transaction) => {
      const lockedOrder = await Order.findOne({
        where: { order_id: order.order_id, customer_id: customer.customer_id },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!lockedOrder || !['pending', 'processing'].includes(String(lockedOrder.status || '').trim().toLowerCase())) {
        throw Object.assign(new Error('This order can no longer be cancelled'), { status: 409 });
      }
      if (lockedOrder.reservation_stock_reserved) {
        const items = await OrderItem.findAll({ where: { order_id: lockedOrder.order_id }, transaction });
        for (const item of items) {
          const product = await Product.findByPk(item.product_id, { transaction, lock: transaction.LOCK.UPDATE });
          if (product) {
            await product.update({ stock_quantity: Number(product.stock_quantity || 0) + Number(item.quantity || 0) }, { transaction });
          }
        }
      }
      await lockedOrder.update({ status: 'cancelled', reservation_stock_reserved: false, updated_at: new Date() }, { transaction });
      await QRCode.update(
        { expired_at: new Date() },
        { where: { code_type: 'Order', reference_id: lockedOrder.order_id, is_used: false }, transaction }
      );
      order.set(lockedOrder.toJSON());
    });
    if (order.reservation_only) {
      const linkedAppointments = await Appointment.findAll({
        where: { reservation_order_id: order.order_id, status: { [Op.ne]: 'cancelled' } }
      });
      for (const appointment of linkedAppointments) {
        await appointment.update({ status: 'cancelled' });
        await QRCode.update(
          { expired_at: new Date() },
          { where: { code_type: 'Appointment', reference_id: appointment.appointment_id, expired_at: null } }
        );
      }
    }

    const user = await User.findByPk(req.user.user_id);
    notifyOrderUpdate({ user, order, status: 'cancelled' })
      .catch(e => console.error('Notification error:', e && e.message));

    res.json({ success: true, message: 'Order cancelled', order });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Failed to cancel order', ...(error.status ? {} : { error: error.message }) });
  }
});

// Get customer orders
router.get('/orders', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, req.user.phone || null);

    const orders = await Order.findAll({
      where: { customer_id: customer.customer_id },
      include: [
        { model: OrderItem, include: [{ model: Product }] },
        { model: Customer, include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }] }
      ],
      order: [['created_at', 'DESC']]
    });

    const ordersWithQr = await attachOrderQrDetails(orders);
    const feedback = orders.length ? await CustomerFeedback.findAll({
      where: { customer_id: customer.customer_id, order_id: { [Op.in]: orders.map(order => order.order_id) } },
      attributes: ['feedback_id', 'order_id', 'rating', 'comment', 'created_at']
    }) : [];
    const feedbackByOrder = new Map(feedback.map(item => [Number(item.order_id), item.toJSON()]));
    const reservationIds = orders.filter((order) => order.reservation_only).map((order) => order.order_id);
    const reservationAppointments = reservationIds.length
      ? await Appointment.findAll({ where: { reservation_order_id: { [Op.in]: reservationIds } } })
      : [];
    const appointmentByReservation = new Map(reservationAppointments.map((appointment) => [Number(appointment.reservation_order_id), appointment]));
    const ordersWithReservationDetails = ordersWithQr.map((order) => {
      const orderData = typeof order.toJSON === 'function' ? order.toJSON() : order;
      return {
        ...orderData,
        reservation_pickup_deadline: orderData.reservation_only && !orderData.requires_eye_checkup
          ? getReservationPickupDeadline(orderData.reservation_confirmed_at || orderData.updated_at || orderData.created_at)
          : null,
        reservation_appointment: appointmentByReservation.get(Number(orderData.order_id)) || null,
        feedback: feedbackByOrder.get(Number(orderData.order_id)) || null
      };
    });

    res.json({
      success: true,
      orders: ordersWithReservationDetails
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

router.post('/feedback', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const recordType = String(req.body?.record_type || '').trim().toLowerCase();
    const recordId = Number(req.body?.record_id);
    const rating = Number(req.body?.rating);
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    if (!['order', 'appointment'].includes(recordType) || !Number.isInteger(recordId) || recordId < 1) {
      return res.status(400).json({ success: false, message: 'Choose a valid completed order or appointment' });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Choose a rating from 1 to 5 stars' });
    }
    if (!comment || comment.length > 2000) {
      return res.status(400).json({ success: false, message: 'Enter a comment (up to 2,000 characters)' });
    }

    const customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, req.user.phone || null);
    let orderId = null;
    let appointmentId = null;
    if (recordType === 'order') {
      const order = await Order.findOne({ where: { order_id: recordId, customer_id: customer.customer_id } });
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
      if (!['picked up', 'completed'].includes(String(order.status || '').trim().toLowerCase())) {
        return res.status(409).json({ success: false, message: 'Feedback is available after the order is completed and picked up' });
      }
      orderId = order.order_id;
    } else {
      const appointment = await Appointment.findOne({ where: { appointment_id: recordId, customer_id: customer.customer_id } });
      if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
      if (String(appointment.status || '').trim().toLowerCase() !== 'completed') {
        return res.status(409).json({ success: false, message: 'Feedback is available after the appointment is completed' });
      }
      appointmentId = appointment.appointment_id;
    }

    const existingFeedback = await CustomerFeedback.findOne({
      where: recordType === 'order' ? { order_id: orderId } : { appointment_id: appointmentId }
    });
    if (existingFeedback) {
      return res.status(409).json({ success: false, message: 'Feedback has already been submitted for this record' });
    }

    const feedback = await CustomerFeedback.create({
      customer_id: customer.customer_id,
      order_id: orderId,
      appointment_id: appointmentId,
      rating,
      comment
    });
    res.status(201).json({ success: true, message: 'Thank you for your feedback', feedback });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: 'Feedback has already been submitted for this record' });
    }
    res.status(500).json({ success: false, message: 'Failed to submit feedback', error: error.message });
  }
});

// Get customer profile
router.get('/profile', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    console.log('GET /customer/profile', { user: req.user && req.user.user_id });
    const user = await User.findByPk(req.user.user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let customer = await getOrCreateCustomerRecord(Customer, req.user.user_id, user.phone || null);

    res.json({
      success: true,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        phone: user.phone
      },
      customer: {
        phone: customer.phone || user.phone,
        date_of_birth: customer.date_of_birth,
        address: customer.address || null,
        discount_card_image_url: customer.discount_card_image_url || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
});

// Update customer profile
router.put('/profile', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { email, phone, birthday, address, discount_card_image_data, discount_card_image_name } = req.body;
    const full_name = normalizeCustomerName(req.body.full_name);

    // Validate required fields
    if (!full_name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full_name, email, and phone'
      });
    }

    if (await findCustomerNameConflict(User, full_name, userId)) {
      return res.status(409).json({
        success: false,
        message: 'A customer account with this name already exists. Please use your existing account.'
      });
    }

    // Validate phone format
    const normalizedPhone = phone.toString().trim().replace(/[\s-]/g, '');
    if (!/^\+?\d{7,15}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must contain 7 to 15 digits, with optional leading +'
      });
    }

    // Check if email is already used by another user
    const existingUser = await User.findOne({
      where: {
        email: email,
        user_id: { [Op.ne]: userId }
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email is already in use'
      });
    }

    // Update user profile, including phone on the User record
    await User.update(
      { full_name, email, phone: normalizedPhone },
      { where: { user_id: userId } }
    );

    // Update or create customer profile and senior/PWD flags if needed
    const [customerRecord] = await Customer.findOrCreate({
      where: { user_id: userId },
      defaults: {
        user_id: userId,
        phone: normalizedPhone
      }
    });

    let discountCardImageUrl = customerRecord.discount_card_image_url || null;
    if (discount_card_image_data) {
      discountCardImageUrl = await persistCustomerDiscountCardImage(discount_card_image_data, discount_card_image_name);
    }

    const customerUpdates = {
      phone: normalizedPhone,
      discount_card_image_url: discountCardImageUrl
    };
    if (birthday) customerUpdates.date_of_birth = birthday;
    if (typeof address !== 'undefined') customerUpdates.address = address;

    if (customerRecord && customerRecord.customer_id) {
      await customerRecord.update(customerUpdates);
    }

    // Fetch updated user
    const updatedUser = await User.findByPk(userId);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        user_id: updatedUser.user_id,
        full_name: updatedUser.full_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role
      },
      customer: {
        address: customerRecord.address,
        date_of_birth: customerRecord.date_of_birth,
        discount_card_image_url: discountCardImageUrl
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

module.exports = router;

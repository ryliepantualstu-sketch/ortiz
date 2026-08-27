const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const Appointment = require('../models/Appointment');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Product = require('../models/Product');
const QRCode = require('../models/QRCode');
const { buildStaffConfirmationUpdate } = require('../utils/appointmentConfirmation');
const { Op } = require('sequelize');

async function attachAppointmentVerificationDetails(appointments) {
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

  return appointments.map((appointment) => {
    const qrCode = qrCodeByReferenceId.get(appointment.appointment_id);

    return {
      ...appointment.toJSON(),
      qr_ready: Boolean(qrCode),
      qr_verified: Boolean(qrCode?.is_used),
      qr_scanned_at: qrCode?.scanned_at || null
    };
  });
}

// Get dashboard stats
router.get('/dashboard-stats', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysAppointments = await Appointment.count({
      where: {
        appointment_date: {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        }
      }
    });

    const pendingOrders = await Order.count({
      where: { status: 'pending' }
    });

    const completedToday = await Appointment.count({
      where: {
        appointment_date: {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        },
        status: 'completed'
      }
    });

    res.json({
      success: true,
      stats: {
        todays_appointments: todaysAppointments,
        pending_orders: pendingOrders,
        completed_today: completedToday
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

// Get today's appointments
router.get('/appointments/today', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointments = await Appointment.findAll({
      where: {
        appointment_date: {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        }
      },
      include: [
        {
          model: Customer,
          include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }]
        }
      ],
      order: [['appointment_time', 'ASC']]
    });

    const appointmentsWithVerification = await attachAppointmentVerificationDetails(appointments);

    res.json({
      success: true,
      appointments: appointmentsWithVerification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today appointments',
      error: error.message
    });
  }
});

// Get all appointments
router.get('/appointments', authMiddleware, requireRole('staff'), async (req, res) => {
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

    const appointmentsWithVerification = await attachAppointmentVerificationDetails(appointments);

    res.json({
      success: true,
      appointments: appointmentsWithVerification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

// Preview or confirm an appointment from its QR code
router.post('/appointments/verify', authMiddleware, requireRole('staff', 'admin'), async (req, res) => {
  try {
    const qrCodeData = req.body?.qr_code_data?.trim();

    if (!qrCodeData) {
      return res.status(400).json({
        success: false,
        message: 'QR code data is required'
      });
    }

    let decodedQrPayload = null;
    try {
      decodedQrPayload = JSON.parse(qrCodeData);
    } catch (error) {
      decodedQrPayload = null;
    }

    let qrCode = await QRCode.findOne({
      where: {
        code_type: 'Appointment',
        qr_code_data: qrCodeData
      }
    });

    if (!qrCode && decodedQrPayload?.appointment_id) {
      qrCode = await QRCode.findOne({
        where: {
          code_type: 'Appointment',
          reference_id: decodedQrPayload.appointment_id
        }
      });
    }

    if (!qrCode) {
      return res.status(404).json({
        success: false,
        message: 'Appointment QR code not found'
      });
    }

    if (qrCode.is_used) {
      return res.status(409).json({
        success: false,
        message: 'This appointment QR code has already been confirmed by staff'
      });
    }

    const appointment = await Appointment.findByPk(qrCode.reference_id, {
      include: [
        {
          model: Customer,
          include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }]
        }
      ]
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found for this QR code'
      });
    }

    if (decodedQrPayload && decodedQrPayload.appointment_date && decodedQrPayload.appointment_time) {
      const qrDate = normalizeAppointmentDate(decodedQrPayload.appointment_date);
      const qrTime = normalizeAppointmentTime(decodedQrPayload.appointment_time);
      const appointmentDate = normalizeAppointmentDate(appointment.appointment_date);
      const appointmentTime = normalizeAppointmentTime(appointment.appointment_time);

      if (qrDate !== appointmentDate || qrTime !== appointmentTime) {
        return res.status(400).json({
          success: false,
          message: 'QR code does not match the scheduled appointment date or time'
        });
      }
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cancelled appointments cannot be verified'
      });
    }

    if (req.body?.confirm !== true) {
      return res.json({
        success: true,
        confirmed: false,
        message: 'Appointment QR code verified. Review the customer details before confirming.',
        appointment: {
          ...appointment.toJSON(),
          qr_verified: false,
          qr_scanned_at: null
        },
        verified_schedule: `${appointment.appointment_date} ${appointment.appointment_time}`
      });
    }

    const confirmationUpdate = buildStaffConfirmationUpdate(appointment, req.user.user_id);

    await appointment.update(confirmationUpdate);

    await qrCode.update({
      is_used: true,
      scanned_at: new Date(),
      scanned_by: req.user.user_id
    });

    res.json({
      success: true,
      message: 'Appointment confirmed successfully',
      appointment: {
        ...appointment.toJSON(),
        qr_verified: true,
        qr_scanned_at: qrCode.scanned_at
      },
      verified_schedule: `${appointment.appointment_date} ${appointment.appointment_time}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to verify appointment QR code',
      error: error.message
    });
  }
});

// Update appointment status
router.put('/appointments/:id', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const { status, staff_confirm, check_in, staff_id } = req.body;
    const appointment = await Appointment.findByPk(req.params.id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    const updates = {};
    if (status) updates.status = status;
    if (typeof staff_confirm !== 'undefined') {
      updates.staff_confirmed = Boolean(staff_confirm);
      updates.staff_confirmed_by = staff_confirm ? (req.user.user_id || staff_id) : null;
    }
    if (typeof check_in !== 'undefined') {
      updates.checked_in = Boolean(check_in);
      updates.checked_in_at = check_in ? new Date() : null;
    }
    if (staff_id) updates.assigned_staff_id = staff_id;

    await appointment.update(updates);

    res.json({
      success: true,
      message: 'Appointment updated successfully',
      appointment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update appointment',
      error: error.message
    });
  }
});

// Get all orders
router.get('/orders', authMiddleware, requireRole('staff'), async (req, res) => {
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

// Update order status
router.get('/orders/:id', authMiddleware, requireRole('staff'), async (req, res) => {
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

router.put('/orders/:id', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByPk(req.params.id, {
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ['product_id', 'stock_quantity']
            }
          ]
        }
      ]
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // When order is marked as picked up, reduce product stock
    if (status && status.toLowerCase() === 'picked up' && order.status && order.status.toLowerCase() !== 'picked up') {
      const orderItems = order.OrderItems || [];
      for (const item of orderItems) {
        const product = item.Product;
        if (product) {
          const newStock = Math.max(0, (product.stock_quantity || 0) - (item.quantity || 0));
          await Product.update(
            { stock_quantity: newStock },
            { where: { product_id: product.product_id } }
          );
        }
      }
    }

    await order.update({ status });

    res.json({
      success: true,
      message: 'Order updated successfully',
      order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update order',
      error: error.message
    });
  }
});

// Apply or remove a fixed 20% discount on an order (staff only)
router.put('/orders/:id/discount', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const { discount_type } = req.body; // expected 'senior' | 'pwd' | null
    const order = await Order.findByPk(req.params.id, {
      include: [{ model: OrderItem }]
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Calculate subtotal from items
    const items = order.OrderItems || [];
    const subtotal = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);

    const validTypes = ['senior', 'pwd'];
    const applyDiscount = validTypes.includes(discount_type);
    const discountRate = applyDiscount ? 0.20 : 0;
    const discountAmount = Number((subtotal * discountRate).toFixed(2));
    const totalAfter = Number((subtotal - discountAmount).toFixed(2));

    await order.update({
      discount_type: applyDiscount ? discount_type : null,
      discount_amount: discountAmount,
      total_amount: totalAfter
    });

    res.json({ success: true, message: 'Order discount updated', order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update order discount', error: error.message });
  }
});

// Get all customers
router.get('/customers', authMiddleware, requireRole('staff', 'admin'), async (req, res) => {
  try {
    const customers = await Customer.findAll({
      include: [
        { model: User, attributes: ['full_name', 'email', 'phone'] }
      ],
      order: [['created_at', 'DESC']]
    });

    // Attach appointment and order counts
    const customerData = await Promise.all(customers.map(async (customer) => {
      const appointmentCount = await Appointment.count({ where: { customer_id: customer.customer_id } });
      const orderCount = await Order.count({ where: { customer_id: customer.customer_id } });
      return {
        ...customer.toJSON(),
        appointment_count: appointmentCount,
        order_count: orderCount
      };
    }));

    res.json({
      success: true,
      customers: customerData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: error.message
    });
  }
});

// Get single customer details with appointments and orders
router.get('/customers/:id', authMiddleware, requireRole('staff', 'admin'), async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id, {
      include: [
        { model: User, attributes: ['full_name', 'email', 'phone'] }
      ]
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const appointments = await Appointment.findAll({
      where: { customer_id: customer.customer_id },
      order: [['appointment_date', 'DESC']],
      limit: 10
    });

    const orders = await Order.findAll({
      where: { customer_id: customer.customer_id },
      include: [{ model: OrderItem, include: [{ model: Product, attributes: ['product_id', 'product_name', 'category', 'color_name', 'color_hex', 'color_int', 'price'] }] }],
      order: [['created_at', 'DESC']],
      limit: 10
    });

    res.json({
      success: true,
      customer: {
        ...customer.toJSON(),
        discount_card_image_url: customer.discount_card_image_url || null
      },
      appointments,
      orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer details',
      error: error.message
    });
  }
});

// Get all products (for staff inventory viewing)
router.get('/products', authMiddleware, requireRole('staff'), async (req, res) => {
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

// Get inventory status (for staff)
router.get('/inventory', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const products = await Product.findAll({
      attributes: ['product_id', 'product_name', 'category', 'color_name', 'color_hex', 'color_int', 'stock_quantity', 'min_stock_level', 'price'],
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

module.exports = router;

const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const Appointment = require('../models/Appointment');
const Order = require('../models/Order');
const CustomerFeedback = require('../models/CustomerFeedback');
const OrderItem = require('../models/OrderItem');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Product = require('../models/Product');
const QRCode = require('../models/QRCode');
const { buildStaffConfirmationUpdate } = require('../utils/appointmentConfirmation');
const { normalizePrescription } = require('../utils/prescription');
const { notifyAppointmentUpdate, notifyOrderUpdate, notifyPickupDateDecision } = require('../utils/notificationService');
const { buildOrderQrPayload, createOrderQrCode, attachOrderQrDetails } = require('../utils/orderQr');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { getPriceByLensOption } = require('../utils/pricing');
const { normalizePhoneNumber, resolveWalkInCustomerMatch } = require('../utils/walkInCustomerMatch');
const { normalizeCustomerName } = require('../utils/customerName');
const {
  createWalkInClaimCode,
  findWalkInClaim,
  findLatestWalkInClaimCodeByIdentity,
  normalizeWalkInClaimCode
} = require('../utils/walkInClaim');
const { getManilaToday, isValidPickupDate } = require('../utils/orderPickup');

function normalizeAppointmentDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeAppointmentTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

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

  const reservationIds = appointments
    .map((appointment) => Number(appointment.reservation_order_id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const reservationOrders = reservationIds.length
    ? await Order.findAll({
      where: { order_id: { [Op.in]: reservationIds } },
      include: [{ model: OrderItem, include: [{ model: Product }] }]
    })
    : [];
  const reservationById = new Map(reservationOrders.map((order) => [Number(order.order_id), order.toJSON()]));
  const feedbackRecords = await CustomerFeedback.findAll({
    where: { appointment_id: { [Op.in]: appointments.map(appointment => appointment.appointment_id) } },
    attributes: ['appointment_id', 'rating', 'comment', 'created_at']
  });
  const feedbackByAppointment = new Map(feedbackRecords.map(feedback => [Number(feedback.appointment_id), feedback.toJSON()]));

  return appointments.map((appointment) => {
    const qrCode = qrCodeByReferenceId.get(appointment.appointment_id);
    const appointmentData = appointment.toJSON();

    return {
      ...appointmentData,
      qr_ready: Boolean(qrCode),
      qr_verified: Boolean(qrCode?.is_used),
      qr_scanned_at: qrCode?.scanned_at || null,
      frame_reservation_order: reservationById.get(Number(appointment.reservation_order_id)) || null,
      feedback: feedbackByAppointment.get(Number(appointment.appointment_id)) || null
    };
  });
}

// Get dashboard stats
router.get('/dashboard-stats', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const today = getManilaToday();

    const [todaysAppointments, pendingOrders, completedToday, pendingAppointments, pendingReservations, readyForPickup, pendingPickupDateRequests] = await Promise.all([
      Appointment.count({ where: { appointment_date: today } }),
      Order.count({ where: { status: 'pending' } }),
      Appointment.count({ where: { appointment_date: today, status: 'completed' } }),
      Appointment.count({ where: { status: 'pending' } }),
      Order.count({ where: { reservation_only: true, status: 'pending' } }),
      Order.count({ where: { status: 'ready for pickup', payment_status: 'Paid' } }),
      Order.count({ where: { pickup_date_request_status: 'pending' } })
    ]);

    res.json({
      success: true,
      stats: {
        todays_appointments: todaysAppointments,
        pending_orders: pendingOrders,
        completed_today: completedToday,
        pending_appointments: pendingAppointments,
        pending_reservations: pendingReservations,
        ready_for_pickup: readyForPickup,
        pending_pickup_date_requests: pendingPickupDateRequests
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
    const today = getManilaToday();

    const appointments = await Appointment.findAll({
      where: {
        appointment_date: today
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

    if (appointment.Customer && appointment.Customer.User) {
      notifyAppointmentUpdate({
        user: appointment.Customer.User,
        appointment,
        action: 'confirmed'
      }).catch((notificationError) => {
        console.error('Failed to send appointment confirmation notification:', notificationError);
      });
    }

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
    if (status) {
      updates.status = status;
      if (status.toLowerCase() === 'completed' && appointment.service_type.toLowerCase() === 'eye checkup') {
        const prescriptionInput = req.body.prescription;
        if (prescriptionInput !== undefined && prescriptionInput !== null) {
          if (typeof prescriptionInput !== 'object' || Array.isArray(prescriptionInput)) {
            return res.status(400).json({ success: false, message: 'Prescription must be an object' });
          }

          const hasPrescriptionValues = Object.values(prescriptionInput)
            .some(value => value !== null && String(value).trim() !== '');
          if (hasPrescriptionValues) {
            const { prescription, error } = normalizePrescription(prescriptionInput);
            if (error) {
              return res.status(400).json({ success: false, message: error });
            }
            Object.assign(updates, prescription);
          }
        }
      }
    }
    if (typeof staff_confirm !== 'undefined') {
      updates.staff_confirmed = Boolean(staff_confirm);
      updates.staff_confirmed_by = staff_confirm ? (req.user.user_id || staff_id) : null;
    }
    if (typeof check_in !== 'undefined') {
      updates.checked_in = Boolean(check_in);
      updates.checked_in_at = check_in ? new Date() : null;
    }
    if (staff_id) updates.assigned_staff_id = staff_id;

    let completedReservationOrder = null;
    let appointmentReceipt = null;
    if (status && status.toLowerCase() === 'completed' && !appointment.reservation_order_id && appointment.service_type.toLowerCase() === 'eye checkup') {
      if (req.body.checkup_fee === undefined || String(req.body.checkup_fee).trim() === '') {
        return res.status(400).json({ success: false, message: 'Enter the eye check-up fee before collecting payment' });
      }
      const checkupFee = Number(req.body.checkup_fee);
      if (!Number.isFinite(checkupFee) || checkupFee < 0 || checkupFee >= 100000000) {
        return res.status(400).json({ success: false, message: 'Enter a valid checkup fee of zero or more' });
      }
      const paymentMethod = req.body.payment_method || 'Cash';
      if (!['Cash', 'Card', 'Online'].includes(paymentMethod)) {
        return res.status(400).json({ success: false, message: 'Choose a valid payment method' });
      }
      updates.checkup_fee = Number(checkupFee.toFixed(2));
      updates.payment_status = 'Paid';
      updates.payment_method = paymentMethod;
      updates.updated_at = new Date();
    }

    if (status && status.toLowerCase() === 'completed' && appointment.reservation_order_id) {
      const lensOption = req.body.lens_option || 'regular-lens';
      if (!['regular-lens', 'photochromic'].includes(lensOption)) {
        return res.status(400).json({ success: false, message: 'Choose a valid lens customization' });
      }
      const paymentMethod = req.body.payment_method || 'Cash';
      if (!['Cash', 'Card', 'Online'].includes(paymentMethod)) {
        return res.status(400).json({ success: false, message: 'Choose a valid payment method' });
      }
      const lensPrice = Number(req.body.lens_price);
      if (!Number.isFinite(lensPrice) || lensPrice < 0 || lensPrice >= 100000000) {
        return res.status(400).json({ success: false, message: 'Enter a valid lens price of zero or more' });
      }
      if (req.body.checkup_fee === undefined || String(req.body.checkup_fee).trim() === '') {
        return res.status(400).json({ success: false, message: 'Enter the eye check-up fee before collecting payment' });
      }
      const checkupFee = Number(req.body.checkup_fee);
      if (!Number.isFinite(checkupFee) || checkupFee < 0 || checkupFee >= 100000000) {
        return res.status(400).json({ success: false, message: 'Enter a valid checkup fee of zero or more' });
      }
      const { prescription, error } = normalizePrescription({ ...appointment.toJSON(), ...updates });
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'A complete prescription is required to complete this reserved-frame checkup'
        });
      }
      Object.assign(updates, prescription);

      await sequelize.transaction(async (transaction) => {
        await appointment.update(updates, { transaction });
        const reservedOrder = await Order.findByPk(appointment.reservation_order_id, {
          include: [
            { model: OrderItem, include: [{ model: Product }] },
            { model: Customer, include: [{ model: User, attributes: ['full_name'] }] }
          ],
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (!reservedOrder || !reservedOrder.reservation_only || String(reservedOrder.status).toLowerCase() !== 'processing') {
          throw Object.assign(new Error('The linked frame reservation is no longer available'), { status: 409 });
        }

        const items = reservedOrder.OrderItems || [];
        if (!items.length || items.some((item) => !item.Product)) {
          throw Object.assign(new Error('The reserved frame item could not be found'), { status: 409 });
        }
        let totalAmount = checkupFee;
        for (const item of items) {
          const framePrice = Number(item.frame_price ?? item.Product.frame_only_price ?? item.Product.price ?? 0);
          const price = Number((framePrice + lensPrice).toFixed(2));
          const subtotal = Number((price * Number(item.quantity || 0)).toFixed(2));
          totalAmount += subtotal;
          await item.update({ frame_price: framePrice, lens_price: lensPrice, price, subtotal, lens_option: lensOption }, { transaction });
        }
        await reservedOrder.update({
          ...prescription,
          order_date: new Date(),
          updated_at: new Date(),
          prescription_appointment_id: appointment.appointment_id,
          total_amount: Number(totalAmount.toFixed(2)),
          payment_status: 'Paid',
          payment_method: paymentMethod,
          checkup_fee: Number(checkupFee.toFixed(2)),
          reservation_only: false,
          status: 'processing',
          notes: `Frame reserved by customer; prescription recorded after eye checkup #${appointment.appointment_id}. Lenses are being customized.`
        }, { transaction });
        const existingOrderQr = await QRCode.findOne({
          where: { code_type: 'Order', reference_id: reservedOrder.order_id },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (existingOrderQr) {
          await existingOrderQr.update({
            qr_code_data: buildOrderQrPayload(reservedOrder),
            is_used: false,
            scanned_at: null,
            scanned_by: null,
            expired_at: null
          }, { transaction });
        } else {
          await createOrderQrCode(reservedOrder, { transaction });
        }
        completedReservationOrder = reservedOrder;
      });
    } else if (status && status.toLowerCase() === 'completed' && !appointment.reservation_order_id && appointment.service_type.toLowerCase() === 'eye checkup' && req.body.purchase_frame) {
      const { prescription, error } = normalizePrescription({ ...appointment.toJSON(), ...updates });
      if (error) {
        return res.status(400).json({ success: false, message: 'A complete prescription is required when the customer purchases frames and lenses' });
      }
      const productId = Number(req.body.product_id);
      const lensPrice = Number(req.body.lens_price);
      const lensOption = req.body.lens_option || 'regular-lens';
      if (!Number.isInteger(productId) || productId < 1) {
        return res.status(400).json({ success: false, message: 'Choose a frame for the customer order' });
      }
      if (!Number.isFinite(lensPrice) || lensPrice < 0 || lensPrice >= 100000000) {
        return res.status(400).json({ success: false, message: 'Enter a valid lens price of zero or more' });
      }
      if (!['regular-lens', 'photochromic'].includes(lensOption)) {
        return res.status(400).json({ success: false, message: 'Choose a valid lens customization' });
      }

      Object.assign(updates, prescription);
      const createdOrderId = await sequelize.transaction(async (transaction) => {
        const product = await Product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!product || !product.is_active) {
          throw Object.assign(new Error('The selected frame is no longer available'), { status: 404 });
        }
        if (Number(product.stock_quantity || 0) < 1) {
          throw Object.assign(new Error(`Not enough stock for ${product.product_name}`), { status: 409 });
        }
        const framePrice = Number(product.frame_only_price ?? product.price ?? 0);
        const itemPrice = Number((framePrice + lensPrice).toFixed(2));
        const totalAmount = Number((itemPrice + Number(updates.checkup_fee)).toFixed(2));
        await appointment.update(updates, { transaction });
        const order = await Order.create({
          customer_id: appointment.customer_id,
          ...prescription,
          prescription_appointment_id: appointment.appointment_id,
          total_amount: totalAmount,
          discount_amount: 0,
          payment_status: 'Paid',
          payment_method: updates.payment_method,
          checkup_fee: updates.checkup_fee,
          customer_name: null,
          delivery_address: null,
          is_walk_in: false,
          reservation_only: false,
          status: 'processing',
          notes: `Frame and customized lenses ordered after eye checkup #${appointment.appointment_id}`
        }, { transaction });
        await OrderItem.create({
          order_id: order.order_id,
          product_id: product.product_id,
          quantity: 1,
          frame_price: framePrice,
          lens_price: lensPrice,
          price: itemPrice,
          subtotal: itemPrice,
          lens_option: lensOption
        }, { transaction });
        await createOrderQrCode(order, { transaction });
        return order.order_id;
      });
      completedReservationOrder = await Order.findByPk(createdOrderId, {
        include: [
          { model: OrderItem, include: [{ model: Product }] },
          { model: Customer, include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }] }
        ]
      });
    } else {
      await appointment.update(updates);
      if (status && status.toLowerCase() === 'completed' && !appointment.reservation_order_id && appointment.service_type.toLowerCase() === 'eye checkup') {
        const customerRecord = await Customer.findByPk(appointment.customer_id, {
          include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }]
        });
        appointmentReceipt = {
          order_id: `APT-${appointment.appointment_id}`,
          appointment_id: appointment.appointment_id,
          customer_name: customerRecord?.User?.full_name || '',
          Customer: customerRecord,
          created_at: new Date(),
          total_amount: updates.checkup_fee,
          checkup_fee: updates.checkup_fee,
          payment_status: 'Paid',
          payment_method: updates.payment_method,
          OrderItems: []
        };
      }
    }

    try {
      const customerRecord = await Customer.findByPk(appointment.customer_id, {
        include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }]
      });
      if (customerRecord && customerRecord.User) {
        if (completedReservationOrder) {
          notifyOrderUpdate({ user: customerRecord.User, order: completedReservationOrder, status: 'processing' })
            .catch(e => console.error(e));
        }
        notifyAppointmentUpdate({
          user: customerRecord.User,
          appointment,
          action: status || 'updated'
        }).catch(e => console.error(e));
      }
    } catch (notifErr) {
      console.warn('Failed to send appointment notification:', notifErr.message);
    }

    res.json({
      success: true,
      message: completedReservationOrder
        ? appointment.reservation_order_id
          ? 'Checkup completed. The reserved frame and prescription are saved as an order for lens customization.'
          : 'Checkup completed. The frame, customized lenses, prescription, payment, and receipt are saved to the customer order.'
        : 'Appointment updated successfully',
      appointment,
      order: completedReservationOrder,
      appointmentReceipt
    });
  } catch (error) {
    console.error('Failed to update appointment:', error);
    res.status(error.status || 500).json({
      success: false,
      message: 'Failed to update appointment',
      error: error.message
    });
  }
});

// Walk-in sale: staff records an over-the-counter purchase, stock is deducted right away
router.get('/orders/walk-in/claim-code', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const customerName = normalizeCustomerName(req.query.customer_name);
    const customerPhone = normalizePhoneNumber(req.query.customer_phone);
    if (!customerName || !/^\+?\d{7,15}$/.test(customerPhone)) {
      return res.status(400).json({
        success: false,
        message: 'A customer name and valid phone number are required'
      });
    }

    const claimCode = await findLatestWalkInClaimCodeByIdentity(Order, customerName, customerPhone);
    res.json({ success: true, claim_code: claimCode });
  } catch (error) {
    console.error('Failed to look up walk-in claim code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to look up walk-in claim code'
    });
  }
});

router.post('/orders/walk-in', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const customerName = normalizeCustomerName(req.body.customer_name);
    const customerPhone = normalizePhoneNumber(req.body.customer_phone);
    const address = typeof req.body.address === 'string' ? req.body.address.trim() : '';
    const rawExistingClaimCode = req.body.existing_claim_code;
    const discountType = ['senior', 'pwd'].includes(req.body.discount_type) ? req.body.discount_type : null;
    const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
    const paymentMethod = req.body.payment_method || 'Cash';
    const isCustomizedLensSale = requestedItems.some(item => item.lens_option !== 'frame-only');
    const existingClaimCode = rawExistingClaimCode ? normalizeWalkInClaimCode(rawExistingClaimCode) : null;

    if (!customerName) {
      return res.status(400).json({ success: false, message: 'Customer name is required' });
    }
    if (!/^\+?\d{7,15}$/.test(customerPhone)) {
      return res.status(400).json({ success: false, message: 'Enter a valid customer phone number (7 to 15 digits)' });
    }
    if (requestedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one item' });
    }
    if (!['Cash', 'Card', 'Online'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Choose a valid payment method' });
    }
    let checkupFee = 0;
    let prescription = {};
    if (isCustomizedLensSale) {
      if (req.body.checkup_fee === undefined || String(req.body.checkup_fee).trim() === '') {
        return res.status(400).json({ success: false, message: 'Enter the eye check-up fee for customized lenses' });
      }
      checkupFee = Number(req.body.checkup_fee);
      if (!Number.isFinite(checkupFee) || checkupFee < 0 || checkupFee >= 100000000) {
        return res.status(400).json({ success: false, message: 'Enter a valid check-up fee of zero or more' });
      }
      const normalized = normalizePrescription(req.body.prescription || {});
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }
      prescription = normalized.prescription;
      if (!Object.keys(prescription).length) {
        return res.status(400).json({ success: false, message: 'Enter the customer’s eye-check results before ordering customized lenses' });
      }
    }
    if (rawExistingClaimCode && !existingClaimCode) {
      return res.status(400).json({ success: false, message: 'Enter a valid 12-character code from a walk-in receipt' });
    }

    const matchingAccounts = await User.findAll({
      attributes: ['user_id', 'full_name', 'phone'],
      where: {
        role: 'customer',
        is_active: true,
        [Op.and]: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('full_name')),
          customerName.toLowerCase()
        )
      },
      include: [{ model: Customer, required: true, attributes: ['customer_id', 'phone'] }]
    });
    const accountMatch = resolveWalkInCustomerMatch(matchingAccounts, customerPhone);

    const orderId = await sequelize.transaction(async (transaction) => {
      const existingClaim = existingClaimCode
        ? await findWalkInClaim(Order, existingClaimCode, transaction)
        : null;
      if (existingClaimCode && !existingClaim) {
        throw Object.assign(new Error('Walk-in claim code not found'), { status: 404 });
      }

      const lines = [];
      for (const entry of requestedItems) {
        const quantity = Number.parseInt(entry.quantity, 10);
        if (!Number.isInteger(quantity) || quantity < 1) {
          throw Object.assign(new Error('Quantity must be at least 1'), { status: 400 });
        }
        const product = await Product.findByPk(entry.product_id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!product || !product.is_active) {
          throw Object.assign(new Error('Product not found or unavailable'), { status: 404 });
        }
        if ((product.stock_quantity || 0) < quantity) {
          throw Object.assign(new Error(`Not enough stock for ${product.product_name} (available: ${product.stock_quantity || 0})`), { status: 409 });
        }
        const lensOption = entry.lens_option || 'regular-lens';
        if (!['frame-only', 'regular-lens', 'photochromic'].includes(lensOption)) {
          throw Object.assign(new Error('Choose a valid lens customization'), { status: 400 });
        }
        const price = Number(getPriceByLensOption(product, lensOption));
        lines.push({ product, quantity, lensOption, price });
      }

      const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
      const discountAmount = discountType ? Number((subtotal * 0.2).toFixed(2)) : 0;
      const totalAmount = Number((subtotal - discountAmount + checkupFee).toFixed(2));
      const customerId = existingClaimCode
        ? existingClaim.customer_id
        : accountMatch.customer_id;
      const walkInClaimCode = customerId
        ? null
        : existingClaimCode || createWalkInClaimCode();

      const order = await Order.create({
        customer_id: customerId,
        ...prescription,
        total_amount: totalAmount,
        discount_type: discountType,
        discount_amount: discountAmount,
        checkup_fee: Number(checkupFee.toFixed(2)),
        payment_status: 'Paid',
        payment_method: paymentMethod,
        customer_name: customerName,
        walk_in_phone: customerPhone,
        delivery_address: address || null,
        is_walk_in: true,
        walk_in_claim_code: walkInClaimCode,
        status: isCustomizedLensSale ? 'processing' : 'picked up',
        notes: isCustomizedLensSale ? 'Walk-in eye checkup completed; prescription saved and customized lenses are being prepared.' : 'Completed paid walk-in frame-only sale; frame handed to customer at the counter.'
      }, { transaction });
      await createOrderQrCode(order, { transaction });

      for (const line of lines) {
        await OrderItem.create({
          order_id: order.order_id,
          product_id: line.product.product_id,
          quantity: line.quantity,
          price: line.price,
          subtotal: line.price * line.quantity,
          lens_option: line.lensOption
        }, { transaction });
        await line.product.update(
          { stock_quantity: line.product.stock_quantity - line.quantity },
          { transaction }
        );
      }

      return order.order_id;
    });

    const order = await Order.findByPk(orderId, {
      include: [
        { model: OrderItem, include: [{ model: Product }] },
        { model: Customer, include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }] }
      ]
    });
    const [orderWithQr] = await attachOrderQrDetails([order]);

    res.status(201).json({
      success: true,
      message: isCustomizedLensSale ? 'Walk-in check-up and customized-lens order recorded' : 'Walk-in frame-only order completed',
      account_linked: Boolean(order.customer_id),
      account_match_ambiguous: accountMatch.ambiguous,
      order: orderWithQr
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Failed to record walk-in sale',
      ...(error.status ? {} : { error: error.message })
    });
  }
});

// Create a customer order from a completed eye checkup while the customer is in the clinic.
router.post('/appointments/:id/orders', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment || appointment.status !== 'completed' || appointment.service_type !== 'Eye Checkup') {
      return res.status(404).json({
        success: false,
        message: 'Completed eye checkup not found'
      });
    }
    if (appointment.reservation_order_id) {
      return res.status(409).json({
        success: false,
        message: 'This checkup already updates the frame reserved by the customer. Do not create another glasses order.'
      });
    }
    const existingAppointmentOrder = await Order.findOne({ where: { prescription_appointment_id: appointment.appointment_id } });
    if (existingAppointmentOrder) {
      return res.status(409).json({ success: false, message: 'A frame and lens order is already linked to this eye checkup' });
    }

    const { prescription, error } = normalizePrescription(appointment);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'This eye checkup does not have a complete prescription'
      });
    }

    const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (requestedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one item' });
    }

    const orderId = await sequelize.transaction(async (transaction) => {
      const lines = [];
      for (const entry of requestedItems) {
        const productId = Number(entry.product_id);
        const quantity = Number(entry.quantity);
        const lensOption = entry.lens_option || 'regular-lens';
        if (!Number.isInteger(productId) || productId < 1) {
          throw Object.assign(new Error('Choose a valid product'), { status: 400 });
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
          throw Object.assign(new Error('Quantity must be at least 1'), { status: 400 });
        }
        if (!['frame-only', 'regular-lens', 'photochromic'].includes(lensOption)) {
          throw Object.assign(new Error('Choose a valid lens option'), { status: 400 });
        }

        const product = await Product.findByPk(productId, {
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (!product || !product.is_active) {
          throw Object.assign(new Error('Product not found or unavailable'), { status: 404 });
        }
        if ((product.stock_quantity || 0) < quantity) {
          throw Object.assign(new Error(`Not enough stock for ${product.product_name} (available: ${product.stock_quantity || 0})`), { status: 409 });
        }
        lines.push({
          product,
          quantity,
          lensOption,
          price: Number(getPriceByLensOption(product, lensOption))
        });
      }

      const totalAmount = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
      const order = await Order.create({
        customer_id: appointment.customer_id,
        ...prescription,
        prescription_appointment_id: appointment.appointment_id,
        total_amount: Number(totalAmount.toFixed(2)),
        discount_amount: 0,
        customer_name: null,
        delivery_address: null,
        is_walk_in: false,
        status: 'pending',
        notes: `Created by staff after eye checkup #${appointment.appointment_id}`
      }, { transaction });
      await createOrderQrCode(order, { transaction });

      for (const line of lines) {
        await OrderItem.create({
          order_id: order.order_id,
          product_id: line.product.product_id,
          quantity: line.quantity,
          price: line.price,
          subtotal: line.price * line.quantity,
          lens_option: line.lensOption
        }, { transaction });
      }

      return order.order_id;
    });

    const order = await Order.findByPk(orderId, {
      include: [
        { model: OrderItem, include: [{ model: Product }] },
        { model: Customer, include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }] }
      ]
    });
    const [orderWithQr] = await attachOrderQrDetails([order]);

    res.status(201).json({ success: true, message: 'Customer order created', order: orderWithQr });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Failed to create customer order',
      ...(error.status ? {} : { error: error.message })
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
    const feedbackRecords = orders.length ? await CustomerFeedback.findAll({
      where: { order_id: { [Op.in]: orders.map(order => order.order_id) } },
      attributes: ['order_id', 'rating', 'comment', 'created_at']
    }) : [];
    const feedbackByOrder = new Map(feedbackRecords.map(feedback => [Number(feedback.order_id), feedback.toJSON()]));
    const ordersWithPrescription = orders.map((order) => {
      const orderData = order.toJSON();
      orderData.prescription = {
        prescription_appointment_id: orderData.prescription_appointment_id,
        right_sph: orderData.right_sph,
        right_cyl: orderData.right_cyl,
        right_axis: orderData.right_axis,
        left_sph: orderData.left_sph,
        left_cyl: orderData.left_cyl,
        left_axis: orderData.left_axis
      };
      orderData.feedback = feedbackByOrder.get(Number(orderData.order_id)) || null;
      return orderData;
    });

    res.json({
      success: true,
      orders: ordersWithPrescription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

router.post('/orders/verify-qr', authMiddleware, requireRole('staff', 'admin'), async (req, res) => {
  try {
    const qrCodeData = typeof req.body?.qr_code_data === 'string'
      ? req.body.qr_code_data.trim()
      : '';
    if (!qrCodeData) {
      return res.status(400).json({ success: false, message: 'Order QR code data is required' });
    }

    const qrCode = await QRCode.findOne({
      where: {
        code_type: 'Order',
        qr_code_data: qrCodeData
      }
    });
    if (!qrCode) {
      return res.status(404).json({ success: false, message: 'Order QR code not found' });
    }

    const order = await Order.findByPk(qrCode.reference_id, {
      include: [
        { model: OrderItem, include: [{ model: Product }] },
        { model: Customer, include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }] }
      ]
    });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found for this QR code' });
    }
    if (qrCode.expired_at || qrCode.is_used) {
      return res.status(409).json({ success: false, message: 'This order claim QR code has already been used or expired' });
    }
    const isConfirmedFrameReservation = order.reservation_only && String(order.status).toLowerCase() === 'processing';
    if (!isConfirmedFrameReservation && String(order.status).toLowerCase() !== 'ready for pickup') {
      return res.status(409).json({ success: false, message: 'This reservation or product is not ready for QR verification' });
    }
    if (!isConfirmedFrameReservation && String(order.payment_status).toLowerCase() !== 'paid') {
      return res.status(409).json({ success: false, message: 'Payment must be completed before the customer can claim this product' });
    }

    res.json({
      success: true,
      message: isConfirmedFrameReservation ? 'Frame reservation QR code verified' : 'Order QR code verified',
      purpose: isConfirmedFrameReservation ? 'frame-reservation' : 'pickup',
      order: order.toJSON()
    });
  } catch (error) {
    console.error('Failed to verify order QR code:', error);
    res.status(500).json({ success: false, message: 'Failed to verify order QR code' });
  }
});

// Complete a confirmed frame-only reservation after verifying the customer’s QR at the counter.
router.post('/orders/:id/complete-frame-only-reservation', authMiddleware, requireRole('staff', 'admin'), async (req, res) => {
  try {
    const qrCodeData = typeof req.body?.qr_code_data === 'string' ? req.body.qr_code_data.trim() : '';
    const paymentMethod = ['Cash', 'Card', 'Online'].includes(req.body?.payment_method) ? req.body.payment_method : null;
    if (!qrCodeData || !paymentMethod) {
      return res.status(400).json({ success: false, message: 'Verified reservation QR and a valid payment method are required' });
    }

    const orderId = Number(req.params.id);
    const completedOrderId = await sequelize.transaction(async (transaction) => {
      const order = await Order.findByPk(orderId, {
        include: [{ model: OrderItem, include: [{ model: Product }] }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!order || !order.reservation_only || String(order.status).toLowerCase() !== 'processing') {
        throw Object.assign(new Error('Only a staff-confirmed frame reservation can be completed this way'), { status: 409 });
      }

      const qrCode = await QRCode.findOne({
        where: { code_type: 'Order', reference_id: order.order_id, qr_code_data: qrCodeData, expired_at: null, is_used: false },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!qrCode) throw Object.assign(new Error('Scan this customer’s valid reservation QR before completing the sale'), { status: 403 });

      const items = order.OrderItems || [];
      if (!items.length || items.some(item => !item.Product || item.lens_option !== 'frame-only')) {
        throw Object.assign(new Error('This reservation is not a frame-only reservation'), { status: 409 });
      }

      let totalAmount = 0;
      for (const item of items) {
        const product = await Product.findByPk(item.product_id, { transaction, lock: transaction.LOCK.UPDATE });
        const quantity = Number(item.quantity || 0);
        if (!product || !product.is_active || !Number.isInteger(quantity) || quantity < 1 || Number(product.stock_quantity || 0) < quantity) {
          throw Object.assign(new Error(`Not enough available stock for ${item.Product?.product_name || 'the reserved frame'}`), { status: 409 });
        }
        const framePrice = Number(item.frame_price ?? product.frame_only_price ?? product.price ?? 0);
        const subtotal = Number((framePrice * quantity).toFixed(2));
        totalAmount += subtotal;
        await item.update({ price: framePrice, subtotal, lens_price: 0, lens_option: 'frame-only' }, { transaction });
        await product.update({ stock_quantity: Number(product.stock_quantity) - quantity }, { transaction });
      }

      await order.update({
        order_date: new Date(),
        updated_at: new Date(),
        total_amount: Number(totalAmount.toFixed(2)),
        discount_amount: 0,
        discount_type: null,
        payment_status: 'Paid',
        payment_method: paymentMethod,
        checkup_fee: 0,
        reservation_only: false,
        status: 'picked up',
        notes: 'Confirmed frame-only reservation; customer identity verified with QR and frame released at the counter.'
      }, { transaction });
      await qrCode.update({ is_used: true, scanned_at: new Date(), scanned_by: req.user.user_id }, { transaction });
      return order.order_id;
    });

    const order = await Order.findByPk(completedOrderId, {
      include: [{ model: OrderItem, include: [{ model: Product }] }, { model: Customer, include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }] }]
    });
    res.json({ success: true, message: 'Frame-only reservation paid and released after QR verification', order });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Failed to complete frame-only reservation', ...(error.status ? {} : { error: error.message }) });
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
    const [orderData] = await attachOrderQrDetails([order]);
    orderData.prescription = {
      prescription_appointment_id: orderData.prescription_appointment_id,
      right_sph: orderData.right_sph,
      right_cyl: orderData.right_cyl,
      right_axis: orderData.right_axis,
      left_sph: orderData.left_sph,
      left_cyl: orderData.left_cyl,
      left_axis: orderData.left_axis
    };
    res.json({ success: true, order: orderData });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch order', error: error.message });
  }
});

router.put('/orders/:id/pickup-date-request', authMiddleware, requireRole('staff'), async (req, res) => {
  try {
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    if (!['approve', 'decline'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Choose approve or decline for this pickup date request' });
    }

    const order = await Order.findByPk(req.params.id, {
      include: [{ model: Customer, include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }] }]
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (String(order.status || '').toLowerCase() !== 'ready for pickup') {
      return res.status(409).json({ success: false, message: 'Pickup dates can only be approved while the order is ready for pickup' });
    }
    if (order.pickup_date_request_status !== 'pending' || !order.pickup_date_requested) {
      return res.status(409).json({ success: false, message: 'There is no pending pickup date request for this order' });
    }

    let approvedDate = null;
    if (decision === 'approve') {
      approvedDate = String(order.pickup_date_requested);
      if (!isValidPickupDate(approvedDate)) {
        return res.status(409).json({ success: false, message: 'The requested pickup date has passed. Ask the customer to submit a new date.' });
      }
      if (order.pickup_missed && (order.pickup_reschedule_count || 0) >= 1) {
        return res.status(409).json({ success: false, message: 'This order has reached its allowed re-pickup limit' });
      }
      await order.update({
        pickup_date: approvedDate,
        pickup_date_request_status: 'approved',
        pickup_reschedule_count: order.pickup_missed ? Number(order.pickup_reschedule_count || 0) + 1 : Number(order.pickup_reschedule_count || 0)
      });
    } else {
      await order.update({ pickup_date_request_status: 'rejected' });
    }

    notifyPickupDateDecision({
      user: order.Customer?.User,
      order,
      approved: decision === 'approve',
      pickupDate: approvedDate
    }).catch(error => console.error('Pickup date decision notification failed:', error.message));

    res.json({
      success: true,
      message: decision === 'approve' ? `Pickup date approved for ${approvedDate}` : 'Pickup date request declined',
      order
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to review pickup date request', error: error.message });
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

    if (order.reservation_only) {
      const nextStatus = String(status || '').trim().toLowerCase();
      if (!['processing', 'cancelled'].includes(nextStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Frame reservations can only be confirmed or cancelled. Complete the sale after the customer visit.'
        });
      }
      if (String(order.status || '').trim().toLowerCase() !== 'pending' && String(order.status || '').trim().toLowerCase() !== nextStatus) {
        return res.status(409).json({ success: false, message: 'This frame reservation has already been reviewed' });
      }
    }

    let claimQrCode = null;
    if (String(status || '').trim().toLowerCase() === 'picked up') {
      if (String(order.status || '').trim().toLowerCase() !== 'ready for pickup') {
        return res.status(409).json({ success: false, message: 'Only a finished product can be claimed' });
      }
      if (String(order.payment_status || '').trim().toLowerCase() !== 'paid') {
        return res.status(409).json({ success: false, message: 'Record payment before releasing the finished product' });
      }
      claimQrCode = await QRCode.findOne({
        where: {
          code_type: 'Order',
          reference_id: order.order_id,
          qr_code_data: req.body.qr_code_data,
          expired_at: null,
          is_used: false
        }
      });
      if (!claimQrCode) {
        return res.status(403).json({ success: false, message: 'Scan this customer’s valid claim QR code before releasing the product' });
      }
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
    if (claimQrCode) {
      await claimQrCode.update({ is_used: true, scanned_at: new Date(), scanned_by: req.user.user_id });
    }

    try {
      const customerRecord = await Customer.findByPk(order.customer_id, {
        include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }]
      });
      if (customerRecord && customerRecord.User) {
        notifyOrderUpdate({
          user: customerRecord.User,
          order,
          status
        }).catch(e => console.error(e));
      }
    } catch (notifErr) {
      console.warn('Failed to send order notification:', notifErr.message);
    }

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

    if (String(order.payment_status || '').toLowerCase() === 'paid') {
      return res.status(409).json({ success: false, message: 'The order has already been paid; its discount and total can no longer be changed' });
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

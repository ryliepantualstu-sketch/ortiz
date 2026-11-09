const { Op } = require('sequelize');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const User = require('../models/User');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const QRCode = require('../models/QRCode');
const sequelize = require('../config/database');
const { getManilaToday, getReservationPickupDeadline } = require('./orderPickup');
const { notifyOrderUpdate } = require('./notificationService');

// Orders whose re-pickup date has also passed are cancelled automatically
async function cancelExpiredPickups() {
  const orders = await Order.findAll({
    where: {
      status: 'ready for pickup',
      pickup_date: { [Op.lt]: getManilaToday() },
      pickup_reschedule_count: { [Op.gte]: 1 }
    }
  });

  for (const order of orders) {
    await order.update({ status: 'cancelled', updated_at: new Date() });
    try {
      const customer = await Customer.findByPk(order.customer_id, {
        include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }]
      });
      if (customer && customer.User) {
        await notifyOrderUpdate({ user: customer.User, order, status: 'cancelled (pickup not claimed)' });
      }
    } catch (error) {
      console.warn('Auto-cancel notification failed:', error.message);
    }
  }

  const expiredFrameReservations = await Order.findAll({
    where: {
      reservation_only: true,
      requires_eye_checkup: false,
      reservation_confirmed_at: { [Op.ne]: null },
      status: 'processing'
    }
  });
  let reservationsExpired = 0;

  for (const candidate of expiredFrameReservations) {
    const deadline = getReservationPickupDeadline(candidate.reservation_confirmed_at);
    if (getManilaToday() <= deadline) continue;

    let expiredOrder = null;
    await sequelize.transaction(async (transaction) => {
      const order = await Order.findByPk(candidate.order_id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!order || !order.reservation_only || order.requires_eye_checkup || String(order.status).toLowerCase() !== 'processing') return;
      const currentDeadline = getReservationPickupDeadline(order.reservation_confirmed_at);
      if (getManilaToday() <= currentDeadline) return;

      if (order.reservation_stock_reserved) {
        const items = await OrderItem.findAll({ where: { order_id: order.order_id }, transaction });
        for (const item of items) {
          const product = await Product.findByPk(item.product_id, { transaction, lock: transaction.LOCK.UPDATE });
          if (product) {
            await product.update({ stock_quantity: Number(product.stock_quantity || 0) + Number(item.quantity || 0) }, { transaction });
          }
        }
      }

      await order.update({
        status: 'cancelled',
        reservation_stock_reserved: false,
        pickup_date_request_status: 'expired',
        updated_at: new Date(),
        notes: `${order.notes || ''} Frame reservation expired after 3 days; reserved stock returned to inventory.`.trim()
      }, { transaction });
      await QRCode.update(
        { expired_at: new Date() },
        { where: { code_type: 'Order', reference_id: order.order_id, is_used: false }, transaction }
      );
      expiredOrder = order;
      reservationsExpired += 1;
    });

    if (expiredOrder) {
      try {
        const customer = await Customer.findByPk(expiredOrder.customer_id, {
          include: [{ model: User, attributes: ['full_name', 'email', 'phone'] }]
        });
        if (customer?.User) {
          await notifyOrderUpdate({ user: customer.User, order: expiredOrder, status: 'cancelled (frame reservation expired; stock returned)' });
        }
      } catch (error) {
        console.warn('Expired frame reservation notification failed:', error.message);
      }
    }
  }

  return orders.length + reservationsExpired;
}

function startMissedPickupJob(intervalMs = 10 * 60 * 1000) {
  const run = () => cancelExpiredPickups()
    .then((count) => { if (count) console.log(`[PICKUP] Auto-cancelled ${count} unclaimed order(s)`); })
    .catch((error) => console.error('[PICKUP] Auto-cancel failed:', error.message));
  run();
  return setInterval(run, intervalMs).unref();
}

module.exports = { cancelExpiredPickups, startMissedPickupJob };

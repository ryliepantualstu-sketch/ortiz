const { Op } = require('sequelize');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const User = require('../models/User');
const { getManilaToday } = require('./orderPickup');
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

  return orders.length;
}

function startMissedPickupJob(intervalMs = 10 * 60 * 1000) {
  const run = () => cancelExpiredPickups()
    .then((count) => { if (count) console.log(`[PICKUP] Auto-cancelled ${count} unclaimed order(s)`); })
    .catch((error) => console.error('[PICKUP] Auto-cancel failed:', error.message));
  run();
  return setInterval(run, intervalMs).unref();
}

module.exports = { cancelExpiredPickups, startMissedPickupJob };

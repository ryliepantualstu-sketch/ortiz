const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { getManilaToday } = require('../utils/orderPickup');

const Order = sequelize.define('Order', {
  order_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'customer_id'
    }
  },
  order_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'ready for pickup', 'picked up', 'completed', 'cancelled'),
    defaultValue: 'pending'
  },
  delivery_address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  discount_type: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  pickup_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  pickup_reschedule_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // True when the order is ready for pickup but the customer's chosen date has passed
  pickup_missed: {
    type: DataTypes.VIRTUAL,
    get() {
      const status = (this.getDataValue('status') || '').toString().trim().toLowerCase();
      const pickupDate = this.getDataValue('pickup_date');
      return status === 'ready for pickup' && !!pickupDate && String(pickupDate) < getManilaToday();
    }
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'orders',
  timestamps: false
});

module.exports = Order;

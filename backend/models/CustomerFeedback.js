const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CustomerFeedback = sequelize.define('CustomerFeedback', {
  feedback_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  rating: {
    type: DataTypes.TINYINT,
    allowNull: false,
    validate: { min: 1, max: 5 }
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { notEmpty: true, len: [1, 2000] }
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'customer_feedback',
  timestamps: false,
  validate: {
    exactlyOneCompletedRecord() {
      if (Boolean(this.order_id) === Boolean(this.appointment_id)) {
        throw new Error('Feedback must belong to exactly one order or appointment');
      }
    }
  },
  indexes: [
    { unique: true, fields: ['order_id'], name: 'unique_feedback_order' },
    { unique: true, fields: ['appointment_id'], name: 'unique_feedback_appointment' }
  ]
});

module.exports = CustomerFeedback;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Customer = sequelize.define('Customer', {
  customer_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  state: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING(15),
    allowNull: true
  },
  date_of_birth: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  postal_code: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'zip_code'
  },
  is_senior: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_pwd: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  loyalty_points: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  discount_card_image_url: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'customers',
  timestamps: false
});

module.exports = Customer;

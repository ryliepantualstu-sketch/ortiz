const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('Product', {
  product_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  product_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  frame_material: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  lens_type: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  frame_shape: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  color_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  color_hex: {
    type: DataTypes.STRING(7),
    allowNull: true
  },
  color_int: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  frame_only_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  regular_lens_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  photochromic_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  stock_quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  min_stock_level: {
    type: DataTypes.INTEGER,
    defaultValue: 10
  },
  supplier: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  image_url: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  last_restock_date: {
    type: DataTypes.DATE,
    allowNull: true
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
  tableName: 'products',
  timestamps: false
});

module.exports = Product;

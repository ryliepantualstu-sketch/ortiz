const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QRCode = sequelize.define('QRCode', {
  qr_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code_type: {
    type: DataTypes.ENUM('Order', 'Appointment'),
    allowNull: false,
    field: 'code_type'
  },
  reference_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  qr_code_data: {
    type: DataTypes.TEXT('long'),
    allowNull: false
  },
  qr_image_path: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  is_used: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  scanned_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  scanned_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  expired_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'qr_codes',
  timestamps: false
});

module.exports = QRCode;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockAuditLog = sequelize.define('StockAuditLog', {
  audit_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'product_id'
    }
  },
  admin_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  previous_stock: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  new_stock: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity_added: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'new_stock - previous_stock'
  },
  change_type: {
    type: DataTypes.ENUM('add', 'remove', 'adjustment'),
    defaultValue: 'add',
    allowNull: false
  },
  reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Optional reason for stock change (e.g., "Restock shipment", "Damaged goods", etc.)'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  }
}, {
  tableName: 'stock_audit_log_entries',
  timestamps: false,
  indexes: [
    {
      fields: ['product_id']
    },
    {
      fields: ['admin_id']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = StockAuditLog;

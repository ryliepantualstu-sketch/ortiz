const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BlockedSlot = sequelize.define('BlockedSlot', {
  blocked_slot_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  block_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  start_time: {
    type: DataTypes.TIME,
    allowNull: false
  },
  end_time: {
    type: DataTypes.TIME,
    allowNull: false
  },
  reason: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
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
  tableName: 'blocked_slots',
  timestamps: false
});

// Associations
BlockedSlot.associate = (models) => {
  BlockedSlot.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
};

module.exports = BlockedSlot;
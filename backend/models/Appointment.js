const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Appointment = sequelize.define('Appointment', {
  appointment_id: {
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
  appointment_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  appointment_time: {
    type: DataTypes.TIME,
    allowNull: false
  },
  service_type: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'cancelled'),
    defaultValue: 'pending'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  assigned_staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  staff_confirmed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  staff_confirmed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  checked_in: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  checked_in_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  verified_at: {
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
  tableName: 'appointments',
  timestamps: false
});

// Associations
Appointment.associate = (models) => {
  Appointment.belongsTo(models.Customer, { foreignKey: 'customer_id' });
  Appointment.belongsTo(models.User, { foreignKey: 'assigned_staff_id', as: 'staff' });
  Appointment.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
};

module.exports = Appointment;

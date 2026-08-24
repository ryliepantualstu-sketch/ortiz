const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Schedule = sequelize.define('Schedule', {
  schedule_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  day_of_week: {
    type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
    allowNull: true
  },
  schedule_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  start_time: {
    type: DataTypes.TIME,
    allowNull: false
  },
  end_time: {
    type: DataTypes.TIME,
    allowNull: false
  },
  is_operational: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  max_appointments_per_slot: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  slot_duration_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 30
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
  tableName: 'schedules',
  timestamps: false
});

module.exports = Schedule;
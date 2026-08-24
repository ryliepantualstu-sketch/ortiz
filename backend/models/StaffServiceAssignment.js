const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StaffServiceAssignment = sequelize.define('StaffServiceAssignment', {
  assignment_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  service_type: {
    type: DataTypes.ENUM('Eye Checkup', 'Lens Fitting', 'Frame Adjustment', 'General Consultation'),
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
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
  tableName: 'staff_service_assignments',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['staff_id', 'service_type']
    }
  ]
});

// Associations
StaffServiceAssignment.associate = (models) => {
  StaffServiceAssignment.belongsTo(models.User, { foreignKey: 'staff_id', as: 'staff' });
};

module.exports = StaffServiceAssignment;
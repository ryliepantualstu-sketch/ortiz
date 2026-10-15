const { Op, col, fn, where } = require('sequelize');

function normalizeCustomerName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

async function findCustomerNameConflict(User, name, excludeUserId, transaction) {
  const normalizedName = normalizeCustomerName(name);
  if (!normalizedName) return null;

  const conditions = [
    where(fn('LOWER', fn('TRIM', col('full_name'))), normalizedName.toLowerCase())
  ];
  if (excludeUserId !== undefined && excludeUserId !== null) {
    conditions.push({ user_id: { [Op.ne]: excludeUserId } });
  }

  return User.findOne({
    attributes: ['user_id'],
    where: {
      role: 'customer',
      [Op.and]: conditions
    },
    ...(transaction ? { transaction } : {})
  });
}

module.exports = { normalizeCustomerName, findCustomerNameConflict };

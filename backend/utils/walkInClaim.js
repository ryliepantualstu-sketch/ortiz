const crypto = require('crypto');
const { Op } = require('sequelize');

const CLAIM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CLAIM_CODE_LENGTH = 12;
const CLAIM_CODE_PATTERN = new RegExp(`^[${CLAIM_CODE_ALPHABET}]{${CLAIM_CODE_LENGTH}}$`);

function createWalkInClaimCode() {
  const randomBytes = crypto.randomBytes(CLAIM_CODE_LENGTH);
  return Array.from(randomBytes, (byte) => CLAIM_CODE_ALPHABET[byte & 31]).join('');
}

function normalizeWalkInClaimCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return CLAIM_CODE_PATTERN.test(normalized) ? normalized : null;
}

function parseWalkInClaimCodes(value) {
  if (value == null || value === '') return [];
  if (typeof value !== 'string') return null;

  const entries = value.split(/[,\s]+/).filter(Boolean);
  if (entries.length === 0 || entries.length > 10) return null;

  const codes = entries.map(normalizeWalkInClaimCode);
  if (codes.some((code) => !code)) return null;
  return [...new Set(codes)];
}

async function claimWalkInOrder(Order, customerId, claimCode, transaction) {
  const normalizedCode = normalizeWalkInClaimCode(claimCode);
  if (!normalizedCode) return false;

  const alreadyClaimed = await Order.findOne({
    attributes: ['order_id'],
    where: {
      walk_in_claim_code: normalizedCode,
      is_walk_in: true,
      customer_id: { [Op.ne]: null }
    },
    transaction
  });
  if (alreadyClaimed) return false;

  const [claimedCount] = await Order.update(
    { customer_id: customerId },
    {
      where: {
        walk_in_claim_code: normalizedCode,
        is_walk_in: true,
        customer_id: null
      },
      transaction
    }
  );

  return claimedCount > 0;
}

async function findWalkInClaim(Order, claimCode, transaction) {
  const normalizedCode = normalizeWalkInClaimCode(claimCode);
  if (!normalizedCode) return null;

  const orders = await Order.findAll({
    attributes: ['customer_id'],
    where: {
      walk_in_claim_code: normalizedCode,
      is_walk_in: true
    },
    transaction
  });
  if (orders.length === 0) return null;

  const customerIds = [...new Set(
    orders
      .map((order) => Number(order.customer_id))
      .filter((customerId) => Number.isInteger(customerId) && customerId > 0)
  )];
  if (customerIds.length > 1) {
    throw Object.assign(new Error('This walk-in claim code is linked to inconsistent customer records'), { status: 409 });
  }
  if (customerIds.length === 1 && orders.some((order) => order.customer_id == null)) {
    throw Object.assign(new Error('This walk-in claim code has incomplete customer links'), { status: 409 });
  }

  return { customer_id: customerIds[0] || null };
}

module.exports = {
  CLAIM_CODE_LENGTH,
  createWalkInClaimCode,
  normalizeWalkInClaimCode,
  parseWalkInClaimCodes,
  claimWalkInOrder,
  findWalkInClaim
};

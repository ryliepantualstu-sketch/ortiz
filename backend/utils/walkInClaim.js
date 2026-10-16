const crypto = require('crypto');

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

async function claimWalkInOrder(Order, customerId, claimCode, transaction) {
  const normalizedCode = normalizeWalkInClaimCode(claimCode);
  if (!normalizedCode) return false;

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

  return claimedCount === 1;
}

module.exports = {
  CLAIM_CODE_LENGTH,
  createWalkInClaimCode,
  normalizeWalkInClaimCode,
  claimWalkInOrder
};

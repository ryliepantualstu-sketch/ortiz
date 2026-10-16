const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../models/Order');
const {
  CLAIM_CODE_LENGTH,
  createWalkInClaimCode,
  normalizeWalkInClaimCode,
  claimWalkInOrder
} = require('../utils/walkInClaim');

test('walk-in claim codes use the expected length and unambiguous alphabet', () => {
  const code = createWalkInClaimCode();

  assert.equal(code.length, CLAIM_CODE_LENGTH);
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
});

test('walk-in claim code normalization accepts case-insensitive receipt codes only', () => {
  assert.equal(normalizeWalkInClaimCode(' abcd2345efgh '), 'ABCD2345EFGH');
  assert.equal(normalizeWalkInClaimCode('ABCD-2345-EFGH'), null);
  assert.equal(normalizeWalkInClaimCode('ABCD2345EFG1'), null);
});

test('only unclaimed walk-in orders have a unique claim code field', () => {
  assert.equal(Order.rawAttributes.walk_in_claim_code.allowNull, true);
  assert.equal(Order.rawAttributes.walk_in_claim_code.unique, true);
});

test('claiming an order filters for an unclaimed walk-in order and updates one match', async () => {
  let updateArgs;
  const transaction = { id: 'registration' };
  const fakeOrder = {
    update: async (...args) => {
      updateArgs = args;
      return [1];
    }
  };

  const claimed = await claimWalkInOrder(fakeOrder, 42, 'abcd2345efgh', transaction);

  assert.equal(claimed, true);
  assert.deepEqual(updateArgs, [
    { customer_id: 42 },
    {
      where: {
        walk_in_claim_code: 'ABCD2345EFGH',
        is_walk_in: true,
        customer_id: null
      },
      transaction
    }
  ]);
});

test('claiming fails when the code has no available walk-in order', async () => {
  const fakeOrder = { update: async () => [0] };

  assert.equal(await claimWalkInOrder(fakeOrder, 42, 'ABCD2345EFGH', {}), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../models/Order');
const {
  CLAIM_CODE_LENGTH,
  createWalkInClaimCode,
  normalizeWalkInClaimCode,
  parseWalkInClaimCodes,
  claimWalkInOrder,
  findWalkInClaim
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

test('registration accepts multiple distinct receipt codes', () => {
  assert.deepEqual(
    parseWalkInClaimCodes('abcd2345efgh, WXYZ2345JKLM'),
    ['ABCD2345EFGH', 'WXYZ2345JKLM']
  );
  assert.deepEqual(parseWalkInClaimCodes('ABCD2345EFGH, ABCD2345EFGH'), ['ABCD2345EFGH']);
  assert.deepEqual(parseWalkInClaimCodes(''), []);
  assert.equal(parseWalkInClaimCodes('ABCD2345EFG1, invalid'), null);
});

test('walk-in orders can share claim codes for one customer', () => {
  assert.equal(Order.rawAttributes.walk_in_claim_code.allowNull, true);
  assert.equal(Order.rawAttributes.walk_in_claim_code.unique, undefined);
});

test('claiming a code links all matching unclaimed walk-in orders', async () => {
  let updateArgs;
  const transaction = { id: 'registration' };
  const fakeOrder = {
    findOne: async () => null,
    update: async (...args) => {
      updateArgs = args;
      return [2];
    }
  };

  const claimed = await claimWalkInOrder(fakeOrder, 42, 'abcd2345efgh', transaction);

  assert.equal(claimed, true);
  assert.deepEqual(updateArgs[0], { customer_id: 42 });
  assert.deepEqual(updateArgs[1].where, {
    walk_in_claim_code: 'ABCD2345EFGH',
    is_walk_in: true,
    customer_id: null
  });
  assert.equal(updateArgs[1].transaction, transaction);
});

test('claiming fails when the code has no available walk-in order', async () => {
  const fakeOrder = { findOne: async () => null, update: async () => [0] };

  assert.equal(await claimWalkInOrder(fakeOrder, 42, 'ABCD2345EFGH', {}), false);
});

test('a used walk-in code cannot be claimed by a second account', async () => {
  let updated = false;
  const fakeOrder = {
    findOne: async () => ({ order_id: 123 }),
    update: async () => { updated = true; return [1]; }
  };

  assert.equal(await claimWalkInOrder(fakeOrder, 42, 'ABCD2345EFGH', {}), false);
  assert.equal(updated, false);
});

test('existing walk-in code resolves to the whole unclaimed group', async () => {
  let query;
  const fakeOrder = {
    findAll: async (options) => {
      query = options;
      return [{ customer_id: null }, { customer_id: null }];
    }
  };

  assert.deepEqual(await findWalkInClaim(fakeOrder, 'abcd2345efgh', {}), { customer_id: null });
  assert.equal(query.where.walk_in_claim_code, 'ABCD2345EFGH');
  assert.equal(query.where.is_walk_in, true);
});

test('existing walk-in code resolves to its already linked customer', async () => {
  const fakeOrder = {
    findAll: async () => [{ customer_id: 42 }, { customer_id: 42 }]
  };

  assert.deepEqual(await findWalkInClaim(fakeOrder, 'ABCD2345EFGH', {}), { customer_id: 42 });
});

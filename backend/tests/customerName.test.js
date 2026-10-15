const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { normalizeCustomerName, findCustomerNameConflict } = require('../utils/customerName');

test('normalizeCustomerName trims and collapses whitespace', () => {
  assert.equal(normalizeCustomerName('  Maria   Santos  '), 'Maria Santos');
  assert.equal(normalizeCustomerName('   '), '');
});

test('findCustomerNameConflict checks customer names without case sensitivity', async () => {
  let query;
  const User = {
    findOne: async (options) => {
      query = options;
      return { user_id: 12 };
    }
  };

  const conflict = await findCustomerNameConflict(User, '  Maria Santos  ');

  assert.deepEqual(conflict, { user_id: 12 });
  assert.equal(query.where.role, 'customer');
  assert.equal(query.where[Op.and][0].logic, 'maria santos');
});

test('findCustomerNameConflict excludes the account being edited', async () => {
  let query;
  const User = {
    findOne: async (options) => {
      query = options;
      return null;
    }
  };
  const transaction = { id: 'transaction' };

  await findCustomerNameConflict(User, 'Maria Santos', 12, transaction);

  assert.deepEqual(query.where[Op.and][1], { user_id: { [Op.ne]: 12 } });
  assert.equal(query.transaction, transaction);
});

test('findCustomerNameConflict skips blank names', async () => {
  let queried = false;
  const User = { findOne: async () => { queried = true; } };

  assert.equal(await findCustomerNameConflict(User, '   '), null);
  assert.equal(queried, false);
});

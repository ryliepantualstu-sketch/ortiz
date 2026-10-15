const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveWalkInCustomerMatch } = require('../utils/walkInCustomerMatch');

test('walk-in order links to the one matching customer account', () => {
  assert.deepEqual(resolveWalkInCustomerMatch([{ Customer: { customer_id: 12 } }]), {
    customer_id: 12,
    ambiguous: false
  });
});

test('walk-in order stays staff-only when no customer account matches', () => {
  assert.deepEqual(resolveWalkInCustomerMatch([]), {
    customer_id: null,
    ambiguous: false
  });
});

test('walk-in order stays staff-only when multiple accounts match the name', () => {
  assert.deepEqual(resolveWalkInCustomerMatch([
    { Customer: { customer_id: 12 } },
    { Customer: { customer_id: 34 } }
  ]), {
    customer_id: null,
    ambiguous: true
  });
});

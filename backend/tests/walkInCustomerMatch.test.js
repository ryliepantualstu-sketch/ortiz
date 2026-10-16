const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhoneNumber, resolveWalkInCustomerMatch } = require('../utils/walkInCustomerMatch');

test('walk-in order links to the one matching customer account', () => {
  assert.deepEqual(resolveWalkInCustomerMatch([{
    phone: '09171234567',
    Customer: { customer_id: 12, phone: '09171234567' }
  }], '0917-123-4567'), {
    customer_id: 12,
    ambiguous: false
  });
});

test('walk-in order does not match an account with the same name and a different phone', () => {
  assert.deepEqual(resolveWalkInCustomerMatch([{
    phone: '09171234567',
    Customer: { customer_id: 12, phone: '09171234567' }
  }], '09981234567'), {
    customer_id: null,
    ambiguous: false
  });
});

test('walk-in order stays unlinked when multiple accounts match the name and phone', () => {
  assert.deepEqual(resolveWalkInCustomerMatch([
    { phone: '09171234567', Customer: { customer_id: 12 } },
    { phone: '09171234567', Customer: { customer_id: 34 } }
  ], '09171234567'), {
    customer_id: null,
    ambiguous: true
  });
});

test('phone normalization removes common formatting characters', () => {
  assert.equal(normalizePhoneNumber(' (0917) 123-4567 '), '09171234567');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../models/Order');

test('orders can be recorded without a customer account', () => {
  assert.equal(Order.rawAttributes.customer_id.allowNull, true);
});

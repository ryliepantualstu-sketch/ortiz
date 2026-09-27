const test = require('node:test');
const assert = require('node:assert/strict');
const { getManilaToday, isValidPickupDate } = require('../utils/orderPickup');

test('pickup date validation accepts today and future calendar dates', () => {
  assert.equal(isValidPickupDate('2026-09-27', '2026-09-27'), true);
  assert.equal(isValidPickupDate('2026-09-28', '2026-09-27'), true);
});

test('pickup date validation rejects past, malformed, and impossible dates', () => {
  assert.equal(isValidPickupDate('2026-09-26', '2026-09-27'), false);
  assert.equal(isValidPickupDate('2026-2-27', '2026-09-27'), false);
  assert.equal(isValidPickupDate('2026-02-30', '2026-01-01'), false);
  assert.equal(isValidPickupDate(null, '2026-09-27'), false);
});

test('Manila pickup date helper returns a valid ISO calendar date', () => {
  assert.match(getManilaToday(), /^\d{4}-\d{2}-\d{2}$/);
});
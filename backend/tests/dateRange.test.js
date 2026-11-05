const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidDateRange } = require('../utils/dateRange');

test('date range accepts matching dates and chronological ranges', () => {
  assert.equal(isValidDateRange('2026-11-05', '2026-11-05'), true);
  assert.equal(isValidDateRange('2026-11-04', '2026-11-05'), true);
});

test('date range rejects a from date later than the to date', () => {
  assert.equal(isValidDateRange('2026-11-06', '2026-11-05'), false);
});

test('date range accepts one-sided filters and rejects invalid dates', () => {
  assert.equal(isValidDateRange('2026-11-05', null), true);
  assert.equal(isValidDateRange(null, '2026-11-05'), true);
  assert.equal(isValidDateRange('not-a-date', '2026-11-05'), false);
});

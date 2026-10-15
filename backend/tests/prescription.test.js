const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePrescription } = require('../utils/prescription');

test('normalizePrescription accepts a complete prescription with no cylinder', () => {
  const result = normalizePrescription({
    right_sph: '-1.25',
    right_cyl: '0',
    right_axis: '',
    left_sph: '0.50',
    left_cyl: '0',
    left_axis: ''
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.prescription, {
    right_sph: -1.25,
    right_cyl: 0,
    right_axis: null,
    left_sph: 0.5,
    left_cyl: 0,
    left_axis: null
  });
});

test('normalizePrescription requires an axis for a non-zero cylinder', () => {
  const result = normalizePrescription({
    right_sph: '-1.25',
    right_cyl: '-0.50',
    right_axis: '',
    left_sph: '0.50',
    left_cyl: '0',
    left_axis: ''
  });

  assert.equal(result.prescription, null);
  assert.match(result.error, /OD axis is required/);
});

test('normalizePrescription rejects an axis outside the clinical range', () => {
  const result = normalizePrescription({
    right_sph: '-1.25',
    right_cyl: '-0.50',
    right_axis: '181',
    left_sph: '0.50',
    left_cyl: '0',
    left_axis: ''
  });

  assert.equal(result.prescription, null);
  assert.match(result.error, /OD axis must be a whole number from 1 to 180/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStaffConfirmationUpdate } = require('../utils/appointmentConfirmation');

test('buildStaffConfirmationUpdate confirms pending appointments', () => {
  const update = buildStaffConfirmationUpdate({ status: 'pending' }, 42);

  assert.equal(update.status, 'confirmed');
  assert.equal(update.assigned_staff_id, 42);
  assert.equal(update.staff_confirmed, true);
  assert.equal(update.staff_confirmed_by, 42);
  assert.equal(update.checked_in, true);
  assert.ok(update.checked_in_at instanceof Date);
  assert.ok(update.verified_at instanceof Date);
});

test('buildStaffConfirmationUpdate keeps completed appointments completed', () => {
  const update = buildStaffConfirmationUpdate({ status: 'completed' }, 7);

  assert.equal(update.status, 'completed');
  assert.equal(update.staff_confirmed, true);
  assert.equal(update.staff_confirmed_by, 7);
});

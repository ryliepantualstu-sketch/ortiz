const test = require('node:test');
const assert = require('node:assert/strict');
const { isTimeWithinSchedule, buildAvailableAppointmentSlots } = require('../utils/appointmentAvailability');

test('rejects times before the configured opening hour', () => {
  assert.equal(isTimeWithinSchedule('06:00', '08:00', '17:00'), false);
});

test('accepts times within the configured operating hours', () => {
  assert.equal(isTimeWithinSchedule('10:30', '08:00', '17:00'), true);
});

test('does not build a slot at the closing boundary', () => {
  const slots = buildAvailableAppointmentSlots('2026-08-03', {
    start_time: '08:00',
    end_time: '17:00',
    slot_duration_minutes: 60
  });

  assert.deepEqual(slots.map((slot) => slot.start_time), ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00']);
});

test('does not build slots during Ortiz lunch break', () => {
  const slots = buildAvailableAppointmentSlots('2026-08-03', {
    start_time: '08:00',
    end_time: '17:00',
    slot_duration_minutes: 30
  });

  assert.equal(slots.some((slot) => ['12:00', '12:30', '13:00'].includes(slot.start_time)), false);
});

test('marks appointments as booked when the database returns date and time values as Date-like objects', () => {
  const slots = buildAvailableAppointmentSlots('2026-08-03', {
    start_time: '08:00',
    end_time: '09:00',
    slot_duration_minutes: 60
  }, [], [{
    appointment_date: new Date('2026-08-03T00:00:00.000Z'),
    appointment_time: '08:00:00',
    status: 'confirmed'
  }]);

  assert.deepEqual(slots, []);
});

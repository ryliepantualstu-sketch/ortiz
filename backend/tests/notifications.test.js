const test = require('node:test');
const assert = require('node:assert/strict');
const { sendEmailNotification, sendSMSNotification, notifyAppointmentUpdate, notifyOrderUpdate } = require('../utils/notificationService');

test('sendEmailNotification handles simulation gracefully when credentials not set', async () => {
  const result = await sendEmailNotification({
    to: 'test@example.com',
    subject: 'Test Notification',
    html: '<p>Test Email Content</p>'
  });

  assert.equal(result.success, true);
});

test('sendSMSNotification handles simulation gracefully when keys not set', async () => {
  const result = await sendSMSNotification({
    to: '09123456789',
    message: 'Test SMS Notification'
  });

  assert.equal(result.success, true);
});

test('notifyAppointmentUpdate triggers without errors', async () => {
  await notifyAppointmentUpdate({
    user: { full_name: 'John Doe', email: 'john@example.com', phone: '09123456789' },
    appointment: { appointment_date: '2026-08-31', appointment_time: '10:00:00', service_type: 'Eye Checkup' },
    action: 'confirmed'
  });
  assert.equal(true, true);
});

test('notifyOrderUpdate triggers without errors', async () => {
  await notifyOrderUpdate({
    user: { full_name: 'John Doe', email: 'john@example.com', phone: '09123456789' },
    order: { order_id: 123, total_amount: 1500 },
    status: 'Ready for Pickup'
  });
  assert.equal(true, true);
});

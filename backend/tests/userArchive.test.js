const test = require('node:test');
const assert = require('node:assert/strict');
const { archiveUser, restoreUser, buildArchivedUserRecord } = require('../utils/userLifecycle');

test('archiveUser deactivates a user', async () => {
  const user = { is_active: true, update: async (updates) => Object.assign(user, updates) };

  const result = await archiveUser(user);

  assert.equal(result.success, true);
  assert.equal(result.message, 'User archived successfully');
  assert.equal(user.is_active, false);
});

test('restoreUser reactivates a user', async () => {
  const user = { is_active: false, update: async (updates) => Object.assign(user, updates) };

  const result = await restoreUser(user);

  assert.equal(result.success, true);
  assert.equal(result.message, 'User restored successfully');
  assert.equal(user.is_active, true);
});

test('buildArchivedUserRecord creates an archive entry for a deactivated user', () => {
  const user = {
    user_id: 42,
    full_name: 'Jane Doe',
    email: 'jane@example.com',
    updated_at: new Date('2026-08-07T10:00:00.000Z')
  };

  const record = buildArchivedUserRecord(user);

  assert.equal(record.type, 'user');
  assert.equal(record.record_id, 42);
  assert.equal(record.name, 'Jane Doe');
  assert.equal(record.archived_id, 'USR-42');
});

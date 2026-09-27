const test = require('node:test');
const assert = require('node:assert/strict');
const { getVerifiedGoogleIdentity } = require('../utils/googleIdentity');

test('accepts a verified Google identity for the configured OAuth client', () => {
  const identity = getVerifiedGoogleIdentity({
    aud: 'configured-client-id',
    email: 'User@Gmail.com',
    email_verified: 'true',
    name: 'Gmail User'
  }, 'configured-client-id');

  assert.deepEqual(identity, { email: 'user@gmail.com', name: 'Gmail User' });
});

test('rejects unverified identities and credentials issued to another client', () => {
  const basePayload = { email: 'user@gmail.com', email_verified: true, name: 'Gmail User' };

  assert.equal(getVerifiedGoogleIdentity({ ...basePayload, aud: 'other-client' }, 'configured-client-id'), null);
  assert.equal(getVerifiedGoogleIdentity({ ...basePayload, aud: 'configured-client-id', email_verified: false }, 'configured-client-id'), null);
  assert.equal(getVerifiedGoogleIdentity({ ...basePayload, aud: 'configured-client-id' }, null), null);
});

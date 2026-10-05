const test = require('node:test');
const assert = require('node:assert/strict');
const { isGmailAddress, issueOtp, verifyOtp, MAX_ATTEMPTS } = require('../utils/emailOtp');

test('isGmailAddress only accepts gmail.com addresses', () => {
  assert.equal(isGmailAddress('Juan.Cruz@gmail.com'), true);
  assert.equal(isGmailAddress('juan@yahoo.com'), false);
  assert.equal(isGmailAddress('juan@gmail.com.evil.com'), false);
  assert.equal(isGmailAddress(''), false);
});

test('issueOtp creates a 6-digit code that verifies once', () => {
  const issued = issueOtp('once@gmail.com');
  assert.match(issued.code, /^\d{6}$/);
  assert.equal(verifyOtp('once@gmail.com', issued.code).ok, true);
  assert.equal(verifyOtp('once@gmail.com', issued.code).ok, false);
});

test('verifyOtp rejects wrong codes and locks after too many attempts', () => {
  const issued = issueOtp('lock@gmail.com');
  const wrong = issued.code === '000000' ? '111111' : '000000';
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    assert.equal(verifyOtp('lock@gmail.com', wrong).reason, 'invalid');
  }
  assert.equal(verifyOtp('lock@gmail.com', issued.code).ok, false);
});

test('verifyOtp rejects expired codes and resend is rate limited', () => {
  const now = Date.now();
  const issued = issueOtp('expire@gmail.com', now);
  assert.equal(issueOtp('expire@gmail.com', now + 1000).ok, false);
  assert.equal(verifyOtp('expire@gmail.com', issued.code, now + 11 * 60 * 1000).reason, 'expired');
});

test('OTP is bound to the email it was issued for', () => {
  const issued = issueOtp('owner@gmail.com');
  assert.equal(verifyOtp('other@gmail.com', issued.code).ok, false);
});

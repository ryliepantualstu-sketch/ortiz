const crypto = require('crypto');

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

// Pending OTPs are kept in memory only; they are short-lived and cleared on restart.
const pendingOtps = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isGmailAddress(email) {
  return /^[a-z0-9._%+-]+@gmail\.com$/.test(normalizeEmail(email));
}

function hashOtp(email, code) {
  const secret = process.env.JWT_SECRET || 'otp-secret';
  return crypto.createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

function issueOtp(email, now = Date.now()) {
  const key = normalizeEmail(email);
  const existing = pendingOtps.get(key);
  if (existing && now - existing.issuedAt < RESEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.issuedAt)) / 1000);
    return { ok: false, retryAfter };
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  pendingOtps.set(key, {
    hash: hashOtp(key, code),
    issuedAt: now,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0
  });
  return { ok: true, code, expiresInMinutes: OTP_TTL_MS / 60000 };
}

function discardOtp(email) {
  pendingOtps.delete(normalizeEmail(email));
}

function verifyOtp(email, code, now = Date.now()) {
  const key = normalizeEmail(email);
  const entry = pendingOtps.get(key);
  if (!entry || now > entry.expiresAt) {
    pendingOtps.delete(key);
    return { ok: false, reason: 'expired' };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    pendingOtps.delete(key);
    return { ok: false, reason: 'too_many_attempts' };
  }

  entry.attempts += 1;
  const provided = Buffer.from(hashOtp(key, String(code || '').trim()));
  const expected = Buffer.from(entry.hash);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'invalid' };
  }

  pendingOtps.delete(key);
  return { ok: true };
}

module.exports = {
  normalizeEmail,
  isGmailAddress,
  issueOtp,
  verifyOtp,
  discardOtp,
  MAX_ATTEMPTS
};

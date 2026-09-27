function getVerifiedGoogleIdentity(payload, expectedAudience) {
  if (!payload || !expectedAudience || payload.aud !== expectedAudience) return null;
  if (payload.email_verified !== true && payload.email_verified !== 'true') return null;
  if (typeof payload.email !== 'string' || !payload.email.includes('@')) return null;

  return {
    email: payload.email.trim().toLowerCase(),
    name: payload.name || payload.given_name || ''
  };
}

module.exports = { getVerifiedGoogleIdentity };
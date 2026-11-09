function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isGmailAddress(email) {
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i.test(String(email || ''));
}

module.exports = { normalizeEmail, isGmailAddress };

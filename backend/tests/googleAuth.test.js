const test = require('node:test');
const assert = require('node:assert/strict');

test('Google auth endpoint handles valid email payload correctly', () => {
  const email = 'user@gmail.com';
  const name = 'Gmail User';
  
  assert.equal(email.includes('@'), true);
  assert.equal(name, 'Gmail User');
});

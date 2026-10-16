const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const customerRouter = require('../routes/customer');
const User = require('../models/User');

function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/customer', customerRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function requestJson(server, role, body) {
  const address = server.address();
  const token = jwt.sign(
    { user_id: 12, email: 'customer@gmail.com', role },
    process.env.JWT_SECRET
  );

  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: address.address,
      port: address.port,
      method: 'PUT',
      path: '/api/customer/password',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        body: JSON.parse(responseBody)
      }));
    });
    request.on('error', reject);
    request.write(JSON.stringify(body));
    request.end();
  });
}

test('customer password change validates input and is restricted to customers', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'customer-password-test-secret';
  const server = await startTestServer();

  try {
    const missing = await requestJson(server, 'customer', {});
    assert.equal(missing.statusCode, 400);
    assert.match(missing.body.message, /current password/i);

    const shortPassword = await requestJson(server, 'customer', {
      current_password: 'old-password',
      new_password: '123',
      confirm_password: '123'
    });
    assert.equal(shortPassword.statusCode, 400);
    assert.match(shortPassword.body.message, /at least 6 characters/i);

    const mismatch = await requestJson(server, 'customer', {
      current_password: 'old-password',
      new_password: 'new-password',
      confirm_password: 'different-password'
    });
    assert.equal(mismatch.statusCode, 400);
    assert.match(mismatch.body.message, /do not match/i);

    let updatedPassword;
    const originalFindByPk = User.findByPk;
    User.findByPk = async () => ({
      comparePassword: async (password) => password === 'old-password',
      update: async (updates) => { updatedPassword = updates.password; }
    });
    try {
      const changed = await requestJson(server, 'customer', {
        current_password: 'old-password',
        new_password: 'new-password',
        confirm_password: 'new-password'
      });
      assert.equal(changed.statusCode, 200);
      assert.equal(changed.body.success, true);
      assert.equal(updatedPassword, 'new-password');
    } finally {
      User.findByPk = originalFindByPk;
    }

    const staff = await requestJson(server, 'staff', {});
    assert.equal(staff.statusCode, 403);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});

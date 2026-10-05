const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const authRouter = require('../routes/auth');

function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function requestJson(server, method, path, body) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: address.address,
      port: address.port,
      method,
      path,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          body: JSON.parse(responseBody)
        });
      });
    });
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

test('Google auth endpoints report when sign-in is not configured', async () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  const server = await startTestServer();

  try {
    const config = await requestJson(server, 'GET', '/api/auth/google/config');
    const login = await requestJson(server, 'POST', '/api/auth/google', {});

    assert.deepEqual(config.body, { success: true, enabled: false, clientId: null });
    assert.equal(login.statusCode, 503);
    assert.equal(login.body.success, false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    if (originalClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    }
  }
});

test('Google auth requires an ID token credential', async () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  const server = await startTestServer();

  try {
    const login = await requestJson(server, 'POST', '/api/auth/google', {});

    assert.equal(login.statusCode, 400);
    assert.equal(login.body.message, 'A Google credential is required');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    if (originalClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    }
  }
});

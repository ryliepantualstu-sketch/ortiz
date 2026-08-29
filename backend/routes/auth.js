const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Customer = require('../models/Customer');
const { authMiddleware } = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password, confirm_password, phone, role, birthday } = req.body;
    const normalizedPhone = typeof phone === 'string'
      ? phone.trim().replace(/[\s-]/g, '')
      : '';

    // Validation
    if (!full_name || !email || !password || !confirm_password || !normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please fill all required fields'
      });
    }

    if (!/^\+?\d{7,15}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must contain 7 to 15 digits, with optional leading +'
      });
    }

    if (password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create user
    const user = await User.create({
      full_name,
      email,
      password,
      phone: normalizedPhone,
      role: role || 'customer'
    });

    // If customer, create customer record and preserve birthday if available
    if (user.role === 'customer') {
      const customerPayload = {
        user_id: user.user_id
      };

      if (birthday) {
        customerPayload.date_of_birth = birthday;
      }

      await Customer.create(customerPayload);
    }

    // Generate token
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Verify token and get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ where: { user_id: req.user.user_id } });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify token',
      error: error.message
    });
  }
});

const https = require('https');
const crypto = require('crypto');

async function verifyGoogleIdToken(idToken) {
  if (!idToken) return null;

  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const response = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    if (response.status === 200 && response.body && response.body.email) {
      return {
        email: response.body.email,
        name: response.body.name || response.body.given_name || ''
      };
    }
  } catch (err) {
    console.warn('Google tokeninfo request failed:', err.message);
  }

  try {
    const parts = idToken.split('.');
    if (parts.length === 3) {
      const payloadBuf = Buffer.from(parts[1], 'base64').toString('utf8');
      const payload = JSON.parse(payloadBuf);
      if (payload.email) {
        return {
          email: payload.email,
          name: payload.name || payload.given_name || ''
        };
      }
    }
  } catch (err) {
    console.warn('JWT payload parsing failed:', err.message);
  }

  return null;
}

// Google Authentication (Login / Sign-up with Gmail)
router.post('/google', async (req, res) => {
  try {
    const { credential, email: rawEmail, name: rawName } = req.body;
    let email = null;
    let full_name = null;

    if (credential) {
      const googleInfo = await verifyGoogleIdToken(credential);
      if (googleInfo) {
        email = googleInfo.email;
        full_name = googleInfo.name;
      }
    }

    if (!email && rawEmail) {
      const cleanedEmail = String(rawEmail).trim().toLowerCase();
      if (cleanedEmail.includes('@')) {
        email = cleanedEmail;
        full_name = rawName || cleanedEmail.split('@')[0];
      }
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Could not obtain a valid email from Google sign-in. Please try again.'
      });
    }

    let user = await User.findOne({ where: { email } });

    if (user) {
      if (!user.is_active) {
        return res.status(401).json({
          success: false,
          message: 'Your account has been deactivated'
        });
      }
    } else {
      const randomPassword = crypto.randomBytes(16).toString('hex');
      user = await User.create({
        full_name: full_name || email.split('@')[0],
        email,
        password: randomPassword,
        role: 'customer',
        is_active: true
      });

      await Customer.create({
        user_id: user.user_id
      });
    }

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      success: true,
      message: 'Google authentication successful',
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Google authentication failed',
      error: error.message
    });
  }
});

module.exports = router;

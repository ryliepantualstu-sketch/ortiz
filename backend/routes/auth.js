const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const sequelize = require('../config/database');
const User = require('../models/User');
const Customer = require('../models/Customer');
const { authMiddleware } = require('../middleware/auth');
const { sendEmailNotification } = require('../utils/notificationService');
const { normalizeEmail, isGmailAddress } = require('../utils/emailOtp');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function createAuthToken(user) {
  return jwt.sign(
    { user_id: user.user_id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

router.get('/google/config', (req, res) => {
  res.json({
    success: true,
    enabled: Boolean(process.env.GOOGLE_CLIENT_ID),
    clientId: process.env.GOOGLE_CLIENT_ID || null
  });
});

router.post('/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({
      success: false,
      message: 'Google sign-in is not configured'
    });
  }

  const credential = req.body && req.body.credential;
  if (typeof credential !== 'string' || !credential) {
    return res.status(400).json({
      success: false,
      message: 'A Google credential is required'
    });
  }

  let payload;
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    payload = ticket.getPayload();
  } catch (error) {
    console.warn('[GOOGLE AUTH] ID token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Google sign-in failed. Please try again.'
    });
  }

  if (!payload || !payload.email || (payload.email_verified !== true && payload.email_verified !== 'true')) {
    return res.status(401).json({
      success: false,
      message: 'The Google account email could not be verified'
    });
  }

  try {
    const email = payload.email.toLowerCase();

    const user = await sequelize.transaction(async (transaction) => {
      let existingUser = await User.findOne({ where: { email }, transaction });
      if (!existingUser) {
        existingUser = await User.create({
          full_name: payload.name || email.split('@')[0],
          email,
          password: crypto.randomBytes(32).toString('hex'),
          role: 'customer'
        }, { transaction });

        await Customer.create({ user_id: existingUser.user_id }, { transaction });
      } else if (existingUser.role === 'customer') {
        const customer = await Customer.findOne({
          where: { user_id: existingUser.user_id },
          transaction
        });
        if (!customer) {
          await Customer.create({ user_id: existingUser.user_id }, { transaction });
        }
      }

      return existingUser;
    });

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      token: createAuthToken(user),
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[GOOGLE AUTH ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Unable to sign in with Google right now'
    });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { full_name, password, confirm_password, phone, birthday, address } = req.body;
    const email = normalizeEmail(req.body.email);
    const role = 'customer';
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

    if (!isGmailAddress(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please use a valid Gmail address (example@gmail.com)'
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
      role
    });

    // If customer, create customer record and preserve birthday/address if available
    if (user.role === 'customer') {
      const customerPayload = {
        user_id: user.user_id,
        phone: normalizedPhone
      };

      if (birthday) {
        customerPayload.date_of_birth = birthday;
      }
      if (address) {
        customerPayload.address = address;
      }

      await Customer.create(customerPayload);
    }

    // Generate token
    const token = createAuthToken(user);

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
    const token = createAuthToken(user);

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

module.exports = router;

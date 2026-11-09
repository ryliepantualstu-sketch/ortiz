const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const sequelize = require('../config/database');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { normalizeCustomerName, findCustomerNameConflict } = require('../utils/customerName');
const { parseWalkInClaimCodes, claimWalkInOrder, claimWalkInOrdersByIdentity } = require('../utils/walkInClaim');
const { authMiddleware } = require('../middleware/auth');
const { sendEmailNotification } = require('../utils/notificationService');
const { normalizeEmail, isGmailAddress } = require('../utils/emailAddress');

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

function getAppUrl() {
  return String(process.env.APP_URL || 'http://localhost:' + (process.env.PORT || 3000)).replace(/\/+$/, '');
}

function createRegistrationApprovalToken(userId) {
  return jwt.sign(
    { user_id: userId, purpose: 'approve-customer-registration' },
    process.env.JWT_SECRET,
    { expiresIn: '48h' }
  );
}

async function notifyOwnerOfRegistration(user, customer, claimCodes = []) {
  const ownerEmail = process.env.OWNER_EMAIL || process.env.DEFAULT_ADMIN_EMAIL || process.env.GMAIL_USER || process.env.SMTP_USER;
  if (!ownerEmail) return { success: false, reason: 'Owner email is not configured' };

  const approvalToken = createRegistrationApprovalToken(user.user_id);
  const approvalUrl = getAppUrl() + '/pages/approve-registration.html?token=' + encodeURIComponent(approvalToken);
  const fullName = escapeHtml(user.full_name || 'N/A');
  const email = escapeHtml(user.email || 'N/A');
  const phone = escapeHtml(user.phone || customer?.phone || 'N/A');
  const birthday = escapeHtml(customer?.date_of_birth || 'Not provided');
  const address = escapeHtml(customer?.address || 'Not provided');
  const codes = claimCodes.length ? claimCodes.map(escapeHtml).join(', ') : 'None';
  const text = [
    'A customer account is waiting for owner approval.',
    'Name: ' + (user.full_name || 'N/A'),
    'Email: ' + (user.email || 'N/A'),
    'Phone: ' + (user.phone || customer?.phone || 'N/A'),
    'Birthday: ' + (customer?.date_of_birth || 'Not provided'),
    'Address: ' + (customer?.address || 'Not provided'),
    'Walk-in receipt claim code(s): ' + (claimCodes.join(', ') || 'None'),
    'Review and approve: ' + approvalUrl
  ].join('\n');

  return sendEmailNotification({
    to: ownerEmail,
    subject: 'Customer account approval: ' + (user.full_name || user.email),
    text,
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#243247"><h2>Customer registration awaiting approval</h2><p>A customer submitted an account request. Review the details before approving:</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Full name</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">' + fullName + '</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">' + email + '</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Phone</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">' + phone + '</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Birthday</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">' + birthday + '</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Address</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">' + address + '</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Walk-in claim code(s)</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">' + codes + '</td></tr></table><p style="margin:24px 0"><a href="' + approvalUrl + '" style="display:inline-block;background:#087f75;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Review and confirm account</a></p><p style="color:#64748b;font-size:13px">This secure approval link expires in 48 hours. Opening it will not approve the account until you press the confirmation button.</p></div>'
  });
}

async function sendCustomerApprovalEmail(user) {
  const loginUrl = getAppUrl() + '/index.html';
  return sendEmailNotification({
    to: user.email,
    subject: 'Congratulations! Your Ortiz Optical account is approved',
    text: 'Congratulations, ' + user.full_name + '! The owner has approved your Ortiz Optical account. You can now log in here: ' + loginUrl,
    html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#243247"><h2 style="color:#087f75">Congratulations, ' + escapeHtml(user.full_name) + '!</h2><p>The owner has approved your Ortiz Optical account. You can now sign in and use your account.</p><p style="margin:24px 0"><a href="' + loginUrl + '" style="display:inline-block;background:#087f75;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Go to Ortiz Optical</a></p><p>If you did not request this account, please contact Ortiz Optical.</p></div>'
  });
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

    const result = await sequelize.transaction(async (transaction) => {
      let existingUser = await User.findOne({ where: { email }, transaction });
      if (!existingUser) {
        const fullName = normalizeCustomerName(payload.name || email.split('@')[0]);
        const nameConflict = await findCustomerNameConflict(User, fullName, null, transaction);
        if (nameConflict) return { nameConflict: true };

        existingUser = await User.create({
          full_name: fullName,
          email,
          password: crypto.randomBytes(32).toString('hex'),
          role: 'customer',
          is_active: false,
          approval_status: 'pending'
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

      return { user: existingUser };
    });

    if (result.nameConflict) {
      return res.status(409).json({
        success: false,
        message: 'A customer account with this name already exists. Please use your existing account.'
      });
    }
    const user = result.user;

    if (user.role === 'customer' && user.approval_status === 'pending') {
      if (user.is_active) {
        user.is_active = false;
        await user.save();
      }
      const customer = await Customer.findOne({ where: { user_id: user.user_id } });
      const notice = await notifyOwnerOfRegistration(user, customer);
      return res.status(202).json({ success: false, approval_pending: true, message: notice.success
        ? 'Your account is waiting for owner approval. We will email you when it is approved.'
        : 'Your account is waiting for owner approval, but we could not notify the owner. Please contact the store.' });
    }

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

// New customer accounts remain inactive until the owner approves them.
router.post('/register', async (req, res) => {
  try {
    const { password, confirm_password, phone, birthday, address } = req.body;
    const rawClaimCodes = req.body.walk_in_claim_codes ?? req.body.walk_in_claim_code;
    const full_name = normalizeCustomerName(req.body.full_name);
    const email = normalizeEmail(req.body.email);
    const role = 'customer';
    const walkInClaimCodes = parseWalkInClaimCodes(rawClaimCodes);
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';

    // Validation
    if (!full_name || !email || !password || !confirm_password || !normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please fill all required fields'
      });
    }

    if (walkInClaimCodes === null) {
      return res.status(400).json({
        success: false,
        message: 'Enter up to 10 valid 12-character claim codes from walk-in receipts, separated by commas'
      });
    }

    const duplicateName = await findCustomerNameConflict(User, full_name);
    if (duplicateName) {
      return res.status(409).json({
        success: false,
        message: 'A customer account with this name already exists. Please use your existing account.'
      });
    }

    if (!/^\d{7,15}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must contain 7 to 15 digits only'
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

    const registration = await sequelize.transaction(async (transaction) => {
      const user = await User.create({
        full_name,
        email,
        password,
        phone: normalizedPhone,
        role,
        is_active: false,
        approval_status: 'pending'
      }, { transaction });

      const customerPayload = {
        user_id: user.user_id,
        phone: normalizedPhone
      };
      if (birthday) customerPayload.date_of_birth = birthday;
      if (address) customerPayload.address = address;
      const customer = await Customer.create(customerPayload, { transaction });

      for (const claimCode of walkInClaimCodes) {
        const claimed = await claimWalkInOrder(Order, customer.customer_id, claimCode, transaction);
        if (!claimed) {
          throw Object.assign(
            new Error(`Walk-in claim code ${claimCode} is invalid, already used, or is not for an unclaimed walk-in sale`),
            { status: 400 }
          );
        }
      }

      await claimWalkInOrdersByIdentity(
        Order,
        customer.customer_id,
        full_name,
        normalizedPhone,
        transaction,
        walkInClaimCodes.length > 0
      );

      return { user, customer };
    });
    const { user, customer } = registration;
    const ownerNotice = await notifyOwnerOfRegistration(user, customer, walkInClaimCodes);
    if (!ownerNotice.success) {
      console.error('[REGISTRATION OWNER EMAIL ERROR]', ownerNotice.error || ownerNotice.reason || 'Email delivery failed');
    }

    res.status(201).json({
      success: true,
      approval_pending: true,
      owner_notified: ownerNotice.success,
      message: ownerNotice.success
        ? 'Account request submitted. Please wait for owner approval; we will email you when you can log in.'
        : 'Account request saved, but the owner notification could not be sent. Please contact the store to complete approval.'
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Registration failed',
      ...(error.status ? {} : { error: error.message })
    });
  }
});

router.post('/register/approve', async (req, res) => {
  const token = req.body && req.body.token;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ success: false, message: 'Approval token is required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(400).json({ success: false, message: 'This approval link is invalid or has expired' });
  }
  if (decoded.purpose !== 'approve-customer-registration' || !Number.isInteger(Number(decoded.user_id))) {
    return res.status(400).json({ success: false, message: 'This approval link is invalid' });
  }

  try {
    const user = await User.findOne({ where: { user_id: Number(decoded.user_id), role: 'customer' } });
    if (!user) return res.status(404).json({ success: false, message: 'Customer account was not found' });
    if (user.approval_status === 'approved' && user.is_active) {
      return res.json({ success: true, already_approved: true, notification_sent: true, message: 'This customer account is already approved.' });
    }
    if (user.approval_status !== 'pending') {
      return res.status(409).json({ success: false, message: 'This account is not waiting for approval' });
    }

    user.approval_status = 'approved';
    user.is_active = true;
    await user.save();
    const notice = await sendCustomerApprovalEmail(user);
    res.json({ success: true, notification_sent: notice.success, message: notice.success
      ? 'Account approved. The customer has been sent a congratulations email.'
      : 'Account approved, but the congratulations email could not be sent.' });
  } catch (error) {
    console.error('[CUSTOMER APPROVAL ERROR]', error);
    res.status(500).json({ success: false, message: 'Unable to approve this account right now' });
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

    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (user.role === 'customer' && user.approval_status === 'pending') {
      return res.status(403).json({ success: false, approval_pending: true, message: 'Your account is waiting for owner approval. We will email you when it is approved.' });
    }
    if (!user.is_active) {
      return res.status(401).json({ success: false, message: 'Your account has been deactivated' });
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

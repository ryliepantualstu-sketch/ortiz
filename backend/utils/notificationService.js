const nodemailer = require('nodemailer');
const https = require('https');

// Initialize Nodemailer transporter for Gmail / SMTP
function createEmailTransporter() {
  const user = process.env.GMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.GMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user,
      pass: pass
    }
  });
}

/**
  * Send Email notification via Gmail / SMTP
  */
async function sendEmailNotification({ to, subject, html, text }) {
  if (!to) return { success: false, reason: 'No recipient email' };

  try {
    const transporter = createEmailTransporter();
    if (!transporter) {
      console.log(`[EMAIL SIMULATION] To: ${to} | Subject: ${subject}`);
      return { success: true, simulated: true };
    }

    const mailOptions = {
      from: `"Ortiz Optical" <${process.env.GMAIL_USER || process.env.SMTP_USER}>`,
      to,
      subject,
      text: text || html.replace(/<[^>]*>?/gm, ''),
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SENT] MessageId: ${info.messageId} to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL ERROR]', error.message || error);
    return { success: false, error: error.message };
  }
}

/**
  * Send SMS notification via Semaphore API or Twilio API
  */
async function sendSMSNotification({ to, message }) {
  if (!to) return { success: false, reason: 'No phone number' };

  const cleanPhone = String(to).replace(/[\s-]/g, '');

  // 1. Semaphore API (Philippine SMS Provider)
  const semaphoreApiKey = process.env.SEMAPHORE_API_KEY;
  if (semaphoreApiKey) {
    try {
      const postData = new URLSearchParams({
        apikey: semaphoreApiKey,
        number: cleanPhone,
        message: message,
        sendername: process.env.SEMAPHORE_SENDER_NAME || 'OrtizOptic'
      }).toString();

      const options = {
        hostname: 'api.semaphore.co',
        path: '/api/v4/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const result = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
          });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      console.log(`[SMS SENT VIA SEMAPHORE] to ${cleanPhone}:`, result);
      return { success: true, provider: 'semaphore', result };
    } catch (err) {
      console.error('[SMS ERROR SEMAPHORE]', err.message);
    }
  }

  // 2. Twilio API Fallback
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

  if (twilioSid && twilioAuthToken && twilioFrom) {
    try {
      const postData = new URLSearchParams({
        From: twilioFrom,
        To: cleanPhone.startsWith('+') ? cleanPhone : `+63${cleanPhone.replace(/^0/, '')}`,
        Body: message
      }).toString();

      const auth = Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');
      const options = {
        hostname: 'api.twilio.com',
        path: `/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const result = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
          });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      console.log(`[SMS SENT VIA TWILIO] to ${cleanPhone}:`, result);
      return { success: true, provider: 'twilio', result };
    } catch (err) {
      console.error('[SMS ERROR TWILIO]', err.message);
    }
  }

  // 3. Fallback / Simulation
  console.log(`[SMS SIMULATION] To: ${cleanPhone} | Message: ${message}`);
  return { success: true, simulated: true };
}

/**
  * Send Appointment Notification (Email + SMS)
  */
async function notifyAppointmentUpdate({ user, appointment, action }) {
  if (!user) return;

  const email = user.email;
  const phone = user.phone;
  const date = appointment.appointment_date;
  const time = appointment.appointment_time;
  const service = appointment.service_type || 'Eye Checkup';

  let subject = `Ortiz Optical - Appointment Notification`;
  let smsText = `Ortiz Optical: Your appointment for ${service} on ${date} at ${time} is now ${action}.`;
  let emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #0d8f83; margin-top: 0;">Ortiz Optical Clinic</h2>
      <p>Hello <strong>${user.full_name || 'Valued Customer'}</strong>,</p>
      <p>Your appointment details have been updated:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
        <tr style="background: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Service</strong></td><td style="padding: 10px; border: 1px solid #e2e8f0;">${service}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Date & Time</strong></td><td style="padding: 10px; border: 1px solid #e2e8f0;">${date} at ${time}</td></tr>
        <tr style="background: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Status</strong></td><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #0d8f83;">${action.toUpperCase()}</td></tr>
      </table>
      <p>Thank you for choosing Ortiz Optical!</p>
    </div>
  `;

  if (email) {
    sendEmailNotification({ to: email, subject, html: emailHtml }).catch(e => console.error(e));
  }
  if (phone) {
    sendSMSNotification({ to: phone, message: smsText }).catch(e => console.error(e));
  }
}

/**
  * Send Order Notification (Email + SMS)
  */
async function notifyOrderUpdate({ user, order, status }) {
  if (!user) return;

  const email = user.email;
  const phone = user.phone;
  const orderId = order.order_id;
  const total = order.total_amount ? `₱${parseFloat(order.total_amount).toFixed(2)}` : '';

  let subject = `Ortiz Optical - Order #${orderId} Update`;
  let smsText = `Ortiz Optical: Order #${orderId} status has been updated to "${status}". ${total ? `Total: ${total}` : ''}`;
  let emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #0d8f83; margin-top: 0;">Ortiz Optical</h2>
      <p>Hello <strong>${user.full_name || 'Valued Customer'}</strong>,</p>
      <p>The status of your order <strong>#${orderId}</strong> has been updated:</p>
      <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #0d8f83;">
        <p style="margin: 0; font-size: 1.1em;">Status: <strong>${status.toUpperCase()}</strong></p>
        ${total ? `<p style="margin: 5px 0 0 0; color: #475569;">Total Amount: <strong>${total}</strong></p>` : ''}
      </div>
      <p>Thank you for shopping at Ortiz Optical!</p>
    </div>
  `;

  if (email) {
    sendEmailNotification({ to: email, subject, html: emailHtml }).catch(e => console.error(e));
  }
  if (phone) {
    sendSMSNotification({ to: phone, message: smsText }).catch(e => console.error(e));
  }
}

module.exports = {
  sendEmailNotification,
  sendSMSNotification,
  notifyAppointmentUpdate,
  notifyOrderUpdate
};

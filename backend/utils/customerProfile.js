const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const CUSTOMER_DISCOUNT_CARD_DIRECTORY = path.resolve(__dirname, '../../frontend/public/images/discount-cards');
const CUSTOMER_DISCOUNT_CARD_URL_PREFIX = 'images/discount-cards';
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

async function persistCustomerDiscountCardImage(imageData, originalFileName, targetDirectory = CUSTOMER_DISCOUNT_CARD_DIRECTORY) {
  if (!imageData) {
    return null;
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageData);
  if (!match) {
    throw new Error('Invalid discount card image format');
  }

  const mimeType = match[1].toLowerCase();
  const extension = ALLOWED_IMAGE_TYPES[mimeType];
  if (!extension) {
    throw new Error('Unsupported image type. Use JPG, PNG, WEBP, or GIF');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Discount card image must be 5MB or smaller');
  }

  const baseName = path.basename(originalFileName || `discount-card.${extension}`, path.extname(originalFileName || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'discount-card';
  const fileName = `${baseName}-${crypto.randomBytes(6).toString('hex')}.${extension}`;

  await fs.mkdir(targetDirectory, { recursive: true });
  await fs.writeFile(path.join(targetDirectory, fileName), buffer);

  return `${CUSTOMER_DISCOUNT_CARD_URL_PREFIX}/${fileName}`;
}

async function getOrCreateCustomerRecord(customerRepository, userId, phone = null) {
  const existingCustomer = await customerRepository.findOne({ where: { user_id: userId } });
  if (existingCustomer) {
    return existingCustomer;
  }

  return customerRepository.create({
    user_id: userId,
    phone: phone || null
  });
}

module.exports = {
  persistCustomerDiscountCardImage,
  getOrCreateCustomerRecord,
  CUSTOMER_DISCOUNT_CARD_DIRECTORY,
  CUSTOMER_DISCOUNT_CARD_URL_PREFIX
};

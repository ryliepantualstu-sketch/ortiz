const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { persistCustomerDiscountCardImage } = require('../utils/customerProfile');

test('persistCustomerDiscountCardImage writes the uploaded card image to disk', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'discount-card-'));
  const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQABAA4WJgAAAABJRU5ErkJggg==';
  const imageData = `data:image/png;base64,${base64Data}`;

  const result = await persistCustomerDiscountCardImage(imageData, 'discount-card.png', tempDir);

  assert.equal(result.startsWith('images/discount-cards/'), true);
  const fileName = path.basename(result);
  const filePath = path.join(tempDir, fileName);
  const exists = await fs.stat(filePath).then(() => true).catch(() => false);
  assert.equal(exists, true);
});

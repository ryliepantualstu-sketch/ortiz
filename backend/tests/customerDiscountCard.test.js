const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { persistCustomerDiscountCardImage } = require('../utils/customerProfile');

test('persistCustomerDiscountCardImage writes the uploaded card image to disk and returns persistent data URI', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'discount-card-'));
  const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQABAA4WJgAAAABJRU5ErkJggg==';
  const imageData = `data:image/png;base64,${base64Data}`;

  const result = await persistCustomerDiscountCardImage(imageData, 'discount-card.png', tempDir);

  assert.equal(result.startsWith('data:image/png;base64,'), true);
  const files = await fs.readdir(tempDir);
  assert.equal(files.length > 0, true);
});

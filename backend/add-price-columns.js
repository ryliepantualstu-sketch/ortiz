const sequelize = require('./config/database');

async function addPriceColumns() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connected successfully!');

    console.log('Adding frame_only_price column...');
    await sequelize.query('ALTER TABLE products ADD COLUMN frame_only_price DECIMAL(10, 2) AFTER price');
    console.log('✓ frame_only_price added');

    console.log('Adding regular_lens_price column...');
    await sequelize.query('ALTER TABLE products ADD COLUMN regular_lens_price DECIMAL(10, 2) AFTER frame_only_price');
    console.log('✓ regular_lens_price added');

    console.log('Adding photochromic_price column...');
    await sequelize.query('ALTER TABLE products ADD COLUMN photochromic_price DECIMAL(10, 2) AFTER regular_lens_price');
    console.log('✓ photochromic_price added');

    console.log('\n✓ All columns added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

addPriceColumns();

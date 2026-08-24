const Product = require('./models/Product');

async function updateProductPrices() {
  try {
    // Update the "Urban" product (product_id: 110) with different lens prices
    const product = await Product.update(
      {
        frame_only_price: 1200,        // 300 cheaper than base price
        regular_lens_price: 1500,       // Same as base price
        photochromic_price: 1800        // 300 more than base price
      },
      { where: { product_id: 110 } }
    );

    console.log('✓ Product updated with lens-specific prices:');
    console.log('  Frame Only:   ₱1,200.00');
    console.log('  Regular Lens: ₱1,500.00 (base)');
    console.log('  Photochromic: ₱1,800.00');
    console.log('\nNow test the price change in the modal!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateProductPrices();

const sequelize = require('./config/database');
const Product = require('./models/Product');

async function checkPriceColumns() {
  try {
    // Check if a sample product has the price columns
    const product = await Product.findOne();
    
    if (!product) {
      console.log('No products in database yet.');
      process.exit(0);
    }

    const hasFrameOnly = product.dataValues.hasOwnProperty('frame_only_price');
    const hasRegularLens = product.dataValues.hasOwnProperty('regular_lens_price');
    const hasPhotochromic = product.dataValues.hasOwnProperty('photochromic_price');

    console.log('Product columns check:');
    console.log('  frame_only_price:', hasFrameOnly ? '✓' : '✗');
    console.log('  regular_lens_price:', hasRegularLens ? '✓' : '✗');
    console.log('  photochromic_price:', hasPhotochromic ? '✓' : '✗');
    
    console.log('\nSample product data:');
    console.log(JSON.stringify(product.dataValues, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkPriceColumns();

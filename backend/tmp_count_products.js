require('dotenv').config({ path: __dirname + '/.env' });
const sequelize = require('./config/database');
const Product = require('./models/Product');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('DB connected for inspection.');

    const total = await Product.count();
    const active = await Product.count({ where: { is_active: true } });
    const inactive = await Product.count({ where: { is_active: false } });

    console.log(`total=${total}, active=${active}, inactive=${inactive}`);

    const samples = await Product.findAll({ limit: 10, order: [['product_id', 'ASC']] });
    console.log('Samples:');
    samples.forEach(p => console.log(p.product_id, p.product_name, 'is_active=', p.is_active, 'stock=', p.stock_quantity));

    await sequelize.close();
  } catch (e) {
    console.error('ERR', e.message);
    try { await sequelize.close(); } catch (err) {}
    process.exit(1);
  }
})();

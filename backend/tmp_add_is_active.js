const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: __dirname + '/.env' });

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ortiz_optical_db'
    });

    // Add is_active column if missing
    try {
      await conn.query("ALTER TABLE products ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;");
      console.log('ALTER TABLE executed: is_active added.');
    } catch (e) {
      console.error('ALTER TABLE failed:', e.message);
    }

    // Show columns
    const [cols] = await conn.query("SHOW COLUMNS FROM products;");
    console.log('COLUMNS:', cols.map(c => c.Field + ' ' + c.Type).join(', '));

    await conn.end();
  } catch (err) {
    console.error(err.message, err.code);
    process.exit(1);
  }
})();

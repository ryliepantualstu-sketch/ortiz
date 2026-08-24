const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
 dotenv.config();
(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ortiz_optical_db'
    });

    const [rows] = await conn.query("SHOW VARIABLES LIKE 'datadir';");
    console.log('datadir:', rows);

    const [tbl] = await conn.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'stock_audit_logs';",
      [process.env.DB_NAME || 'ortiz_optical_db']
    );
    console.log('table rows:', tbl);

    try {
      const [cr] = await conn.query('SHOW CREATE TABLE stock_audit_logs');
      console.log('show create:', cr);
    } catch (showErr) {
      console.error('show create failed:', showErr.message);
    }

    await conn.end();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

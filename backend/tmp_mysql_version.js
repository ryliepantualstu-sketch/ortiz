const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: './backend/.env' });

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ortiz_optical_db'
    });
    const [ver] = await conn.query('SELECT VERSION() as version');
    console.log('VERSION:', JSON.stringify(ver, null, 2));
    const [vars] = await conn.query("SHOW VARIABLES LIKE 'datadir'");
    console.log('DATADIR:', JSON.stringify(vars, null, 2));
    await conn.end();
  } catch (err) {
    console.error(err.message, err.code);
    process.exit(1);
  }
})();

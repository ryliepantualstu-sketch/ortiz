const mysql = require('mysql2/promise');
require('dotenv').config();
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ortiz_optical_db'
  });

  const queries = [
    'DROP TABLESPACE stock_audit_logs',
    'DROP TABLESPACE `stock_audit_logs`',
    'DROP TABLESPACE "stock_audit_logs"',
    'DROP TABLESPACE orthiz_optical_db/stock_audit_logs',
    'DROP TABLESPACE `ortiz_optical_db/stock_audit_logs`',
    'DROP TABLESPACE "ortiz_optical_db/stock_audit_logs"'
  ];

  for (const q of queries) {
    try {
      await conn.query(q);
      console.log('OK:', q);
    } catch (e) {
      console.log('ERR:', q, e.code, e.sqlMessage);
    }
  }

  await conn.end();
})();

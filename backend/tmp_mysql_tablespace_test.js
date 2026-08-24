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
    const commands = [
      'DROP TABLESPACE stock_audit_log_entries;',
      'DROP TABLESPACE stock_audit_logs;',
      'DROP TABLESPACE `ortiz_optical_db/stock_audit_log_entries`;',
      'DROP TABLESPACE `ortiz_optical_db/stock_audit_logs`;'
    ];
    for (const sql of commands) {
      try {
        await conn.query(sql);
        console.log('OK:', sql);
      } catch (err) {
        console.error('ERR:', sql, err.message, err.code);
      }
    }
    await conn.end();
  } catch (err) {
    console.error(err.message, err.code);
    process.exit(1);
  }
})();

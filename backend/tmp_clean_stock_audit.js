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
    const q = async (sql) => {
      try {
        const [res] = await conn.query(sql);
        console.log('OK:', sql, JSON.stringify(res, null, 2));
      } catch (err) {
        console.error('ERR:', sql, err.message, err.code);
      }
    };
    await q('DROP TABLE IF EXISTS `stock_audit_log_entries`;');
    await q('DROP TABLE IF EXISTS `stock_audit_logs`;');
    await q('DROP TABLESPACE `stock_audit_log_entries`;');
    await q('DROP TABLESPACE `stock_audit_logs`;');
    await q('DROP TABLESPACE `ortiz_optical_db/stock_audit_log_entries`;');
    await q('DROP TABLESPACE `ortiz_optical_db/stock_audit_logs`;');
    await q("SELECT TABLE_NAME, ENGINE, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '" + (process.env.DB_NAME || 'ortiz_optical_db') + "' AND TABLE_NAME LIKE 'stock_audit%';");
    await q("SELECT NAME, SPACE, FLAG FROM INFORMATION_SCHEMA.INNODB_SYS_TABLESPACES WHERE NAME LIKE '%stock_audit%';");
    await q("SELECT NAME, SPACE, FLAG FROM INFORMATION_SCHEMA.INNODB_SYS_TABLES WHERE NAME LIKE '%stock_audit%';");
    await conn.end();
  } catch (err) {
    console.error(err.message, err.code);
    process.exit(1);
  }
})();

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

  const [tbl] = await conn.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'stock_audit_logs'", [process.env.DB_NAME || 'ortiz_optical_db']);
  console.log('table rows', tbl.length);

  const [ts] = await conn.query("SELECT NAME FROM INFORMATION_SCHEMA.INNODB_SYS_TABLESPACES WHERE NAME LIKE ?", ['%stock_audit_logs%']);
  console.log('tablespaces', ts.map(r => r.NAME));

  try {
    await conn.query('DROP TABLE IF EXISTS `stock_audit_logs`');
    console.log('drop table ok');
  } catch (e) {
    console.error('drop table err', e.code, e.sqlMessage);
  }

  try {
    await conn.query('DROP TABLESPACE `ortiz_optical_db/stock_audit_logs`');
    console.log('drop tablespace ok');
  } catch (e) {
    console.error('drop tablespace err', e.code, e.sqlMessage);
  }

  await conn.end();
})();

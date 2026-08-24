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

  const [tables] = await conn.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'stock_audit_logs'", [process.env.DB_NAME || 'ortiz_optical_db']);
  console.log('TABLE rows', tables.length);

  const [innodbTables] = await conn.query("SELECT NAME FROM INFORMATION_SCHEMA.INNODB_SYS_TABLES WHERE NAME LIKE ?", ['%stock_audit_logs%']);
  console.log('INNODB_SYS_TABLES', innodbTables.length, innodbTables.map(r => r.NAME));

  const [innodbSpaces] = await conn.query("SELECT NAME FROM INFORMATION_SCHEMA.INNODB_SYS_TABLESPACES WHERE NAME LIKE ?", ['%stock_audit_logs%']);
  console.log('INNODB_SYS_TABLESPACES', innodbSpaces.length, innodbSpaces.map(r => r.NAME));

  await conn.end();
})();

const mysql = require('mysql2/promise');
require('dotenv').config();
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: 'information_schema'
  });

  const [spaces] = await conn.query("SELECT * FROM INNODB_SYS_TABLESPACES WHERE NAME LIKE ?", ['%stock_audit_logs%']);
  console.log('spaces count', spaces.length);
  console.log(JSON.stringify(spaces, null, 2));

  const [tables] = await conn.query("SELECT * FROM INNODB_SYS_TABLES WHERE NAME LIKE ?", ['%stock_audit_logs%']);
  console.log('tables count', tables.length);
  console.log(JSON.stringify(tables, null, 2));

  await conn.end();
})();

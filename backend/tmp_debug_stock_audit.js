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
    const [cols] = await conn.query("SHOW COLUMNS FROM INFORMATION_SCHEMA.INNODB_SYS_TABLESPACES");
    console.log('COLUMNS INNODB_SYS_TABLESPACES:', JSON.stringify(cols, null, 2));
    const [spaces] = await conn.query("SELECT * FROM INFORMATION_SCHEMA.INNODB_SYS_TABLESPACES WHERE NAME LIKE ?;", ['%stock_audit%']);
    console.log('INNODB_SYS_TABLESPACES:', JSON.stringify(spaces, null, 2));
    const [cols2] = await conn.query("SHOW COLUMNS FROM INFORMATION_SCHEMA.INNODB_SYS_TABLES");
    console.log('COLUMNS INNODB_SYS_TABLES:', JSON.stringify(cols2, null, 2));
    const [innodbTables] = await conn.query("SELECT * FROM INFORMATION_SCHEMA.INNODB_SYS_TABLES WHERE NAME LIKE ?;", ['%stock_audit%']);
    console.log('INNODB_SYS_TABLES:', JSON.stringify(innodbTables, null, 2));
    await conn.end();
  } catch (err) {
    console.error(err.message, err.code);
    process.exit(1);
  }
})();

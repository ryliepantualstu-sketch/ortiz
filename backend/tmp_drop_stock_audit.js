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

    try {
      await conn.query('DROP TABLE `stock_audit_logs`;');
      console.log('DROP TABLE succeeded');
    } catch (dropErr) {
      console.error('DROP TABLE failed', dropErr.code, dropErr.sqlMessage);
      try {
        await conn.query("DROP TABLESPACE `ortiz_optical_db/stock_audit_logs`;"
        );
        console.log('DROP TABLESPACE succeeded');
      } catch (dropTablespaceErr) {
        console.error('DROP TABLESPACE failed', dropTablespaceErr.code, dropTablespaceErr.sqlMessage);
      }
    }

    const [tbl] = await conn.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'stock_audit_logs';", [process.env.DB_NAME || 'ortiz_optical_db']);
    console.log('information_schema row count', tbl.length);

    const [ts] = await conn.query("SELECT * FROM information_schema.innodb_sys_tablespaces WHERE NAME LIKE ?", ['%stock_audit_logs%']);
    console.log('innodb_sys_tablespaces', ts.length);

    const [tt] = await conn.query("SELECT * FROM information_schema.innodb_sys_tables WHERE NAME LIKE ?", ['%stock_audit_logs%']);
    console.log('innodb_sys_tables', tt.length);

    await conn.end();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

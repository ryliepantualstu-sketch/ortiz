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

    await conn.query('DROP TABLE IF EXISTS `stock_audit_logs`;');
    console.log('Dropped stock_audit_logs if existed.');
    const sql = `CREATE TABLE IF NOT EXISTS \`stock_audit_logs\` (
      \`audit_id\` INTEGER auto_increment,
      \`product_id\` INTEGER NOT NULL,
      \`admin_id\` INTEGER NOT NULL,
      \`previous_stock\` INTEGER NOT NULL,
      \`new_stock\` INTEGER NOT NULL,
      \`quantity_added\` INTEGER NOT NULL COMMENT 'new_stock - previous_stock',
      \`change_type\` ENUM('add', 'remove', 'adjustment') NOT NULL DEFAULT 'add',
      \`reason\` VARCHAR(255) COMMENT 'Optional reason for stock change (e.g., "Restock shipment", "Damaged goods", etc.)',
      \`created_at\` DATETIME NOT NULL,
      PRIMARY KEY (\`audit_id\`),
      FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`product_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (\`admin_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB;`;
    console.log('Running create table...');
    const [res] = await conn.query(sql);
    console.log('Create table result:', res);
    await conn.end();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();

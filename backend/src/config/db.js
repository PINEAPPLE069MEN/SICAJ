const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

// Aiven (y otros proveedores gratuitos) exigen conexión cifrada.
// - DB_SSL=true            -> cifra la conexión sin verificar el certificado (suficiente y simple)
// - DB_SSL_CA_PATH=ruta    -> si además quieres validar contra el certificado CA real
let sslConfig;
if (process.env.DB_SSL_CA_PATH) {
  sslConfig = { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH) };
} else if (process.env.DB_SSL === 'true') {
  sslConfig = { rejectUnauthorized: false };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sice',
  charset: 'utf8mb4',
  ssl: sslConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;

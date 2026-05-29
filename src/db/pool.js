import 'dotenv/config';
import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;

const baseConfig = databaseUrl
  ? { uri: databaseUrl }
  : {
      host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
      user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
      password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
      database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'sistema_choferes',
    };

export const pool = mysql.createPool({
  ...baseConfig,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  decimalNumbers: false,
});

pool.on?.('connection', (connection) => {
  connection.on('error', (err) => {
    console.error('Error en conexión MySQL:', err.code || err.message);
  });
});

function isTransientMysqlError(err) {
  return ['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'EPIPE', 'ETIMEDOUT'].includes(err?.code);
}

export async function query(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (isTransientMysqlError(err)) {
      console.warn('Conexión MySQL reiniciada. Reintentando query una vez...', {
        code: err.code,
        fatal: err.fatal,
      });
      return await pool.query(sql, params);
    }

    throw err;
  }
}

export async function execute(sql, params = []) {
  try {
    return await pool.execute(sql, params);
  } catch (err) {
    if (isTransientMysqlError(err)) {
      console.warn('Conexión MySQL reiniciada. Reintentando execute una vez...', {
        code: err.code,
        fatal: err.fatal,
      });
      return await pool.execute(sql, params);
    }

    throw err;
  }
}

export async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    return true;
  } finally {
    connection.release();
  }
}

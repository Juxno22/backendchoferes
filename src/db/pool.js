import 'dotenv/config';
import mysql from 'mysql2/promise';

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL en variables de entorno');
}

export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  multipleStatements: true,
  decimalNumbers: true,
  dateStrings: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

function normalizeParams(params = []) {
  return params.map((param) => (param === undefined ? null : param));
}

function isConnectionResetError(err) {
  return (
    err?.code === 'ECONNRESET' ||
    err?.code === 'PROTOCOL_CONNECTION_LOST' ||
    err?.code === 'EPIPE' ||
    err?.fatal === true
  );
}

export async function query(sql, params = []) {
  const safeParams = normalizeParams(params);

  try {
    const start = Date.now();
    const [rows, fields] = await pool.execute(sql, safeParams);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development' && duration > 200) {
      console.log('Query lenta:', {
        sql: sql.substring(0, 120),
        duration,
        rows: Array.isArray(rows) ? rows.length : rows?.affectedRows,
      });
    }

    return [rows, fields];
  } catch (err) {
    if (isConnectionResetError(err)) {
      console.warn('Conexión MySQL reiniciada. Reintentando query una vez...', {
        code: err.code,
        fatal: err.fatal,
      });

      const [rows, fields] = await pool.execute(sql, safeParams);
      return [rows, fields];
    }

    throw err;
  }
}

export async function rawQuery(sql, params = []) {
  const safeParams = normalizeParams(params);

  try {
    const start = Date.now();
    const [rows, fields] = await pool.query(sql, safeParams);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development' && duration > 200) {
      console.log('Raw query lenta:', {
        sql: sql.substring(0, 120),
        duration,
      });
    }

    return [rows, fields];
  } catch (err) {
    if (isConnectionResetError(err)) {
      console.warn('Conexión MySQL reiniciada. Reintentando rawQuery una vez...', {
        code: err.code,
        fatal: err.fatal,
      });

      const [rows, fields] = await pool.query(sql, safeParams);
      return [rows, fields];
    }

    throw err;
  }
}
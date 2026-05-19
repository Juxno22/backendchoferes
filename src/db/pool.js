import 'dotenv/config';
import mysql from 'mysql2/promise';

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL en variables de entorno');
}

export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 20),
  queueLimit: 0,
  multipleStatements: true,
  decimalNumbers: true,
  dateStrings: true,
});

pool.on('connection', () => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Nueva conexion MySQL creada');
  }
});

export async function query(sql, params = []) {
  const safeParams = params.map((param) => param === undefined ? null : param);

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
}

export async function rawQuery(sql, params = []) {
  const safeParams = params.map((param) => param === undefined ? null : param);

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
}
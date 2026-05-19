import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function splitSqlStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let buffer = '';
  const lines = sql.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    // DELIMITER es comando del cliente MySQL, no del servidor.
    // Aquí solo lo usamos para saber cómo separar statements.
    if (/^DELIMITER\s+/i.test(trimmed)) {
      delimiter = trimmed.split(/\s+/)[1];
      continue;
    }
    buffer += line + '\n';
    const bufferTrimmed = buffer.trimEnd();
    if (bufferTrimmed.endsWith(delimiter)) {
      const statement = bufferTrimmed.slice(0, -delimiter.length).trim();
      if (statement.length > 0) {
        statements.push(statement);
      }
      buffer = '';
    }
  }
  const last = buffer.trim();
  if (last.length > 0) {
    statements.push(last);
  }
  return statements;
}
async function migrate() {
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const statements = splitSqlStatements(sql);
  let connection;
  try {
    console.log('Ejecutando schema.sql en MySQL/MariaDB...');
    connection = await pool.getConnection();

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      try {
        await connection.query(statement);
      } catch (err) {
        console.error(`Error en statement #${i + 1}:`);
        console.error(statement.substring(0, 500));
        console.error('\nMensaje:', err.message);
        console.error('Código:', err.code);
        console.error('SQL State:', err.sqlState);
        throw err;
      }
    }
    console.log(`Schema aplicado correctamente. Statements ejecutados: ${statements.length}`);
  } catch (err) {
    console.error('Error aplicando schema:', err.message);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

migrate();
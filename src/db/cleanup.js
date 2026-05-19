// Limpieza programada: elimina chequeos de unidad mayores a 60 días.
//   0 3 * * * cd /ruta/backend && npm run cleanup:checks
import 'dotenv/config';
import { query, pool } from './pool.js';
async function cleanup() {
  try {
    const [rows] = await query('SELECT limpiar_chequeos_antiguos() AS eliminados');
    const eliminados = rows?.[0]?.eliminados ?? 0;
    console.log(`Chequeos eliminados (>60 días): ${eliminados}`);
  } catch (err) {
    console.error('Error en cleanup:', err.message);
    console.error('Código:', err.code);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanup();

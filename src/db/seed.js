import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from './pool.js';

const SALT_ROUNDS = 10;

const RUTAS = [
  { nombre: 'Orizaba', factor: 8.124 },
  { nombre: 'Puebla', factor: 10.984 },
  { nombre: 'Xalapa', factor: 9.747 },
  { nombre: 'Cordoba', factor: 10.378 },
  { nombre: 'Putla/Ixq', factor: 9.485 },
  { nombre: 'Oaxaca', factor: 9.346 },
  { nombre: 'Teziutlan', factor: 9.388 },
  { nombre: 'Huautla', factor: 9.0 },
  { nombre: 'Juchitan', factor: 9.0 },
  { nombre: 'Veracruz', factor: 9.0 },
];

const UNIDADES = [
  { nombre: 'TRANSIT 2022', placas: 'SN22433', km: 844868 },
  { nombre: 'FOTON', placas: 'SP78184', km: 250920 },
  { nombre: 'TRANSIT GRIS', placas: 'SN18173', km: 682702 },
  { nombre: 'TRANSIT 2023', placas: 'SP80914', km: 363489 },
  { nombre: 'TORNADO N.', placas: 'SR23544', km: 47548 },
  { nombre: 'CRAFTER', placas: 'SP82779', km: 380615 },
  { nombre: 'H100', placas: 'SN75770', km: 776653 },
  { nombre: 'CRAFTER NUE', placas: 'SR08534', km: 182238 },
  { nombre: 'HONDA', placas: 'TNB889B', km: 242560 },
  { nombre: 'L200', placas: 'SP92484', km: 113366 },
  { nombre: 'RAM', placas: 'SP83444', km: 251597 },
];

const CHOFERES = [
  { nombre: 'Jesus Maldonado Villalobos', username: 'jmaldonado', ruta: 'Orizaba' },
  { nombre: 'Eliseo Juarez Luengas', username: 'ejuarez', ruta: 'Puebla' },
  { nombre: 'Ulises Valdivia Izucar', username: 'uvaldivia', ruta: 'Xalapa' },
  { nombre: 'Rodolfo Cordero Hernandez', username: 'rcordero', ruta: 'Cordoba' },
  { nombre: 'Humberto Morales Ramirez', username: 'hmorales', ruta: 'Putla/Ixq' },
  { nombre: 'Romario Alvarez Diaz', username: 'ralvarez', ruta: 'Oaxaca' },
  { nombre: 'Juan Manuel Alvarado', username: 'jalvarado', ruta: 'Teziutlan' },
  { nombre: 'Julio Godoy Arenas', username: 'jgodoy', ruta: 'Huautla' },
  { nombre: 'Isaias Duarte Rivera', username: 'iduarte', ruta: 'Juchitan' },
  { nombre: 'Carlos Martinez Urbano', username: 'cmartinez', ruta: 'Veracruz' },
];

async function seed() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    console.log('🌱 Iniciando seed MySQL...');

    const supHash = await bcrypt.hash('supervisor123', SALT_ROUNDS);
    const chkHash = await bcrypt.hash('checador123', SALT_ROUNDS);
    const chofHash = await bcrypt.hash('chofer123', SALT_ROUNDS);

    // 1. Usuarios principales
    await connection.execute(
      `INSERT INTO usuarios 
        (username, password_hash, rol, nombre_completo, activo)
       VALUES 
        (?, ?, 'supervisor', 'Supervisor Principal', TRUE)
       ON DUPLICATE KEY UPDATE 
        password_hash = VALUES(password_hash),
        rol = VALUES(rol),
        nombre_completo = VALUES(nombre_completo),
        activo = TRUE`,
      ['supervisor', supHash]
    );

    await connection.execute(
      `INSERT INTO usuarios 
        (username, password_hash, rol, nombre_completo, activo)
       VALUES 
        (?, ?, 'checador_unidad', 'Checador de Unidades', TRUE)
       ON DUPLICATE KEY UPDATE 
        password_hash = VALUES(password_hash),
        rol = VALUES(rol),
        nombre_completo = VALUES(nombre_completo),
        activo = TRUE`,
      ['checador', chkHash]
    );

    console.log('✓ Usuarios supervisor y checador');

    // 2. Rutas y factores
    const rutaIds = {};

    for (const ruta of RUTAS) {
      await connection.execute(
        `INSERT INTO rutas (nombre, activa)
         VALUES (?, TRUE)
         ON DUPLICATE KEY UPDATE
          nombre = VALUES(nombre),
          activa = TRUE`,
        [ruta.nombre]
      );

      const [rutaRows] = await connection.execute(
        `SELECT id FROM rutas WHERE nombre = ? LIMIT 1`,
        [ruta.nombre]
      );

      const rutaId = rutaRows[0].id;
      rutaIds[ruta.nombre] = rutaId;

      await connection.execute(
        `INSERT INTO factores_rendimiento 
          (ruta_id, km_por_litro_objetivo)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
          km_por_litro_objetivo = VALUES(km_por_litro_objetivo)`,
        [rutaId, ruta.factor]
      );
    }

    console.log(`✓ ${RUTAS.length} rutas + factores`);

    // 3. Unidades
    for (const unidad of UNIDADES) {
      await connection.execute(
        `INSERT INTO unidades 
          (nombre, placas, kilometraje_actual, activa)
         VALUES (?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE
          nombre = VALUES(nombre),
          kilometraje_actual = VALUES(kilometraje_actual),
          activa = TRUE`,
        [unidad.nombre, unidad.placas, unidad.km]
      );
    }

    console.log(`✓ ${UNIDADES.length} unidades`);

    // 4. Choferes y usuarios de chofer
    for (const chofer of CHOFERES) {
      await connection.execute(
        `INSERT INTO usuarios 
          (username, password_hash, rol, nombre_completo, activo)
         VALUES (?, ?, 'chofer', ?, TRUE)
         ON DUPLICATE KEY UPDATE
          password_hash = VALUES(password_hash),
          rol = VALUES(rol),
          nombre_completo = VALUES(nombre_completo),
          activo = TRUE`,
        [chofer.username, chofHash, chofer.nombre]
      );

      const [usuarioRows] = await connection.execute(
        `SELECT id FROM usuarios WHERE username = ? LIMIT 1`,
        [chofer.username]
      );

      const usuarioId = usuarioRows[0].id;
      const rutaId = rutaIds[chofer.ruta] || null;

      await connection.execute(
        `INSERT INTO choferes 
          (usuario_id, nombre, ruta_asignada_id, activo)
         VALUES (?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE
          nombre = VALUES(nombre),
          ruta_asignada_id = VALUES(ruta_asignada_id),
          activo = TRUE`,
        [usuarioId, chofer.nombre, rutaId]
      );
    }

    console.log(`✓ ${CHOFERES.length} choferes`);

    // 5. Horarios default para próximos 7 días
    const hoy = new Date();

    for (let d = 0; d < 7; d++) {
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() + d);

      const fechaStr = fecha.toISOString().split('T')[0];

      for (const rutaId of Object.values(rutaIds)) {
        await connection.execute(
          `INSERT INTO horarios_ruta 
            (ruta_id, fecha, hora_salida, tolerancia_minutos)
           VALUES (?, ?, '06:00:00', 20)
           ON DUPLICATE KEY UPDATE
            hora_salida = VALUES(hora_salida),
            tolerancia_minutos = VALUES(tolerancia_minutos)`,
          [rutaId, fechaStr]
        );
      }
    }

    console.log('✓ Horarios default creados');

    await connection.commit();

    console.log('\n✅ Seed completado.\n');
    console.log('Credenciales:');
    console.log('  supervisor / supervisor123');
    console.log('  checador / checador123');
    console.log('  jmaldonado / chofer123');
    console.log('  ejuarez / chofer123');
    console.log('  uvaldivia / chofer123');
  } catch (err) {
    await connection.rollback();

    console.error('❌ Error en seed:', err.message);
    console.error('Código:', err.code);
    console.error('SQL State:', err.sqlState);

    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

seed();
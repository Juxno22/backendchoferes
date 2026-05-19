import bcrypt from 'bcrypt';
import { query, pool } from '../db/pool.js';
import { uploadBuffer } from '../config/cloudinary.js';

// ======================================================
// HELPERS
// ======================================================

async function obtenerRutasChofer(choferId) {
  const [rows] = await query(
    `SELECT 
        cr.id,
        cr.chofer_id,
        cr.ruta_id,
        cr.es_principal,
        cr.activo,
        r.nombre AS ruta_nombre,
        fr.km_por_litro_objetivo
     FROM chofer_rutas cr
     JOIN rutas r ON r.id = cr.ruta_id
     LEFT JOIN factores_rendimiento fr ON fr.ruta_id = r.id
     WHERE cr.chofer_id = ?
       AND cr.activo = TRUE
       AND r.activa = TRUE
     ORDER BY cr.es_principal DESC, r.nombre ASC`,
    [choferId]
  );

  return rows;
}

function limpiarRutasIds(rutasIds = []) {
  if (!Array.isArray(rutasIds)) return [];

  return [...new Set(
    rutasIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )].slice(0, 3);
}

async function sincronizarRutasChofer(connection, choferId, rutasIds = []) {
  const rutasLimpias = limpiarRutasIds(rutasIds);

  if (rutasLimpias.length === 0) {
    await connection.execute(
      `UPDATE chofer_rutas 
       SET activo = FALSE,
           es_principal = FALSE
       WHERE chofer_id = ?`,
      [choferId]
    );

    await connection.execute(
      `UPDATE choferes 
       SET ruta_asignada_id = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [choferId]
    );

    return;
  }

  await connection.execute(
    `UPDATE chofer_rutas 
     SET activo = FALSE,
         es_principal = FALSE
     WHERE chofer_id = ?`,
    [choferId]
  );

  for (let i = 0; i < rutasLimpias.length; i++) {
    const rutaId = rutasLimpias[i];

    await connection.execute(
      `INSERT INTO chofer_rutas
        (
          chofer_id,
          ruta_id,
          es_principal,
          activo
        )
       VALUES (?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
        es_principal = VALUES(es_principal),
        activo = TRUE`,
      [choferId, rutaId, i === 0]
    );
  }

  // Campo legacy para compatibilidad con código anterior.
  await connection.execute(
    `UPDATE choferes 
     SET ruta_asignada_id = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [rutasLimpias[0], choferId]
  );
}

function mapearChoferConRutas(chofer, rutas) {
  return {
    ...chofer,
    rutas,
    rutas_ids: rutas.map((ruta) => ruta.ruta_id),
    ruta_nombre: rutas.map((ruta) => ruta.ruta_nombre).join(', '),
  };
}

// ======================================================
// LISTAR
// ======================================================

export async function listar(req, res) {
  const [rows] = await query(
    `SELECT 
        c.id,
        c.nombre,
        c.numero_licencia,
        c.tipo_licencia,
        c.vigencia_licencia,
        c.telefono,
        c.foto_url,
        c.fecha_ingreso,
        c.activo,
        c.notas,
        c.ruta_asignada_id,
        u.username
     FROM choferes c
     LEFT JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.activo = TRUE
     ORDER BY c.nombre ASC`
  );

  const choferes = [];

  for (const chofer of rows) {
    const rutas = await obtenerRutasChofer(chofer.id);
    choferes.push(mapearChoferConRutas(chofer, rutas));
  }

  res.json(choferes);
}

// ======================================================
// OBTENER
// ======================================================

export async function obtener(req, res) {
  const { id } = req.params;

  const [rows] = await query(
    `SELECT 
        c.*,
        u.username,
        u.rol,
        u.activo AS usuario_activo
     FROM choferes c
     LEFT JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Chofer no encontrado' });
  }

  const rutas = await obtenerRutasChofer(id);

  res.json(mapearChoferConRutas(rows[0], rutas));
}

// ======================================================
// CREAR
// ======================================================

export async function crear(req, res) {
  const {
    nombre,
    username,
    password = 'chofer123',
    numero_licencia,
    tipo_licencia,
    vigencia_licencia,
    telefono,
    ruta_asignada_id,
    rutas_ids = [],
    notas,
  } = req.body;

  if (!nombre || !username) {
    return res.status(400).json({
      error: 'Nombre y username requeridos',
    });
  }

  const rutasFinales = Array.isArray(rutas_ids) && rutas_ids.length > 0
    ? limpiarRutasIds(rutas_ids)
    : ruta_asignada_id
      ? limpiarRutasIds([ruta_asignada_id])
      : [];

  if (rutasFinales.length > 3) {
    return res.status(400).json({
      error: 'Un chofer solo puede tener máximo 3 rutas asignadas',
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const hash = await bcrypt.hash(password || 'chofer123', 10);

    const [userResult] = await connection.execute(
      `INSERT INTO usuarios 
        (
          username,
          password_hash,
          rol,
          nombre_completo,
          activo
        )
       VALUES (?, ?, 'chofer', ?, TRUE)`,
      [username, hash, nombre]
    );

    const usuarioId = userResult.insertId;

    const [choferResult] = await connection.execute(
      `INSERT INTO choferes
        (
          usuario_id,
          nombre,
          numero_licencia,
          tipo_licencia,
          vigencia_licencia,
          telefono,
          ruta_asignada_id,
          notas,
          activo
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        usuarioId,
        nombre,
        numero_licencia || null,
        tipo_licencia || null,
        vigencia_licencia || null,
        telefono || null,
        rutasFinales[0] || null,
        notas || null,
      ]
    );

    const choferId = choferResult.insertId;

    await sincronizarRutasChofer(connection, choferId, rutasFinales);

    await connection.commit();

    const [rows] = await query(
      `SELECT 
          c.*,
          u.username
       FROM choferes c
       LEFT JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.id = ?
       LIMIT 1`,
      [choferId]
    );

    const rutas = await obtenerRutasChofer(choferId);

    res.status(201).json(mapearChoferConRutas(rows[0], rutas));
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// ======================================================
// ACTUALIZAR
// ======================================================

export async function actualizar(req, res) {
  const { id } = req.params;

  const {
    nombre,
    numero_licencia,
    tipo_licencia,
    vigencia_licencia,
    telefono,
    ruta_asignada_id,
    rutas_ids,
    notas,
    activo,
  } = req.body;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `UPDATE choferes SET
         nombre = COALESCE(?, nombre),
         numero_licencia = COALESCE(?, numero_licencia),
         tipo_licencia = COALESCE(?, tipo_licencia),
         vigencia_licencia = COALESCE(?, vigencia_licencia),
         telefono = COALESCE(?, telefono),
         notas = COALESCE(?, notas),
         activo = COALESCE(?, activo),
         updated_at = NOW()
       WHERE id = ?`,
      [
        nombre ?? null,
        numero_licencia ?? null,
        tipo_licencia ?? null,
        vigencia_licencia ?? null,
        telefono ?? null,
        notas ?? null,
        activo ?? null,
        id,
      ]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: 'Chofer no encontrado',
      });
    }

    if (Array.isArray(rutas_ids)) {
      const rutasFinales = limpiarRutasIds(rutas_ids);

      await sincronizarRutasChofer(connection, id, rutasFinales);
    } else if (ruta_asignada_id !== undefined && ruta_asignada_id !== null && ruta_asignada_id !== '') {
      await sincronizarRutasChofer(connection, id, [ruta_asignada_id]);
    }

    await connection.commit();

    const [rows] = await query(
      `SELECT 
          c.*,
          u.username
       FROM choferes c
       LEFT JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.id = ?
       LIMIT 1`,
      [id]
    );

    const rutas = await obtenerRutasChofer(id);

    res.json(mapearChoferConRutas(rows[0], rutas));
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// ======================================================
// ELIMINAR
// ======================================================

export async function eliminar(req, res) {
  const { id } = req.params;

  const [result] = await query(
    `UPDATE choferes 
     SET activo = FALSE,
         updated_at = NOW()
     WHERE id = ?`,
    [id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({
      error: 'Chofer no encontrado',
    });
  }

  res.json({ ok: true });
}

// ======================================================
// SUBIR FOTO
// ======================================================

export async function subirFoto(req, res) {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({
      error: 'Archivo requerido',
    });
  }

  const [existente] = await query(
    `SELECT id
     FROM choferes
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (existente.length === 0) {
    return res.status(404).json({
      error: 'Chofer no encontrado',
    });
  }

  const { url } = await uploadBuffer(req.file.buffer, `choferes/${id}`);

  await query(
    `UPDATE choferes 
     SET foto_url = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [url, id]
  );

  const [rows] = await query(
    `SELECT *
     FROM choferes
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  const rutas = await obtenerRutasChofer(id);

  res.json(mapearChoferConRutas(rows[0], rutas));
}

// ======================================================
// RESUMEN
// ======================================================

export async function resumen(req, res) {
  const { id } = req.params;

  const anio = parseInt(req.query.anio, 10) || new Date().getFullYear();
  const mes = parseInt(req.query.mes, 10) || new Date().getMonth() + 1;

  const [
    [choferRows],
    [rendimiento],
    [puntualidad],
    [servicio],
    [limpieza],
    [incentivo],
    [chequeos],
  ] = await Promise.all([
    query(
      `SELECT 
          c.*,
          u.username
       FROM choferes c
       LEFT JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.id = ?
       LIMIT 1`,
      [id]
    ),
    query(
      `SELECT 
          rd.*,
          u.nombre AS unidad_nombre,
          u.placas,
          r.nombre AS ruta_nombre
       FROM rendimiento_diario rd
       LEFT JOIN unidades u ON u.id = rd.unidad_id
       LEFT JOIN rutas r ON r.id = rd.ruta_id
       WHERE rd.chofer_id = ?
         AND YEAR(rd.fecha) = ?
         AND MONTH(rd.fecha) = ?
       ORDER BY rd.fecha DESC`,
      [id, anio, mes]
    ),
    query(
      `SELECT 
          p.*,
          r.nombre AS ruta_nombre
       FROM puntualidad p
       LEFT JOIN rutas r ON r.id = p.ruta_id
       WHERE p.chofer_id = ?
         AND YEAR(p.fecha) = ?
         AND MONTH(p.fecha) = ?
       ORDER BY p.fecha DESC`,
      [id, anio, mes]
    ),
    query(
      `SELECT 
          s.*,
          r.nombre AS ruta_nombre
       FROM servicio_clientes s
       LEFT JOIN rutas r ON r.id = s.ruta_id
       WHERE s.chofer_id = ?
         AND YEAR(s.fecha) = ?
         AND MONTH(s.fecha) = ?
       ORDER BY s.fecha DESC`,
      [id, anio, mes]
    ),
    query(
      `SELECT 
          l.*,
          u.nombre AS unidad_nombre,
          u.placas
       FROM limpieza_cuidado l
       LEFT JOIN unidades u ON u.id = l.unidad_id
       WHERE l.chofer_id = ?
         AND YEAR(l.fecha) = ?
         AND MONTH(l.fecha) = ?
       ORDER BY l.fecha DESC`,
      [id, anio, mes]
    ),
    query(
      `SELECT *
       FROM incentivos
       WHERE chofer_id = ?
         AND anio = ?
         AND mes = ?
       LIMIT 1`,
      [id, anio, mes]
    ),
    query(
      `SELECT 
          cu.id,
          cu.fecha,
          cu.hora,
          cu.tipo,
          cu.kilometraje,
          u.nombre AS unidad_nombre,
          u.placas
       FROM check_unidad cu
       LEFT JOIN unidades u ON u.id = cu.unidad_id
       WHERE cu.chofer_id = ?
       ORDER BY cu.fecha DESC, cu.hora DESC, cu.id DESC
       LIMIT 20`,
      [id]
    ),
  ]);

  if (choferRows.length === 0) {
    return res.status(404).json({
      error: 'Chofer no encontrado',
    });
  }

  const rutas = await obtenerRutasChofer(id);
  const chofer = mapearChoferConRutas(choferRows[0], rutas);

  res.json({
    chofer,
    periodo: { anio, mes },
    rendimiento,
    puntualidad,
    servicio,
    limpieza,
    incentivo: incentivo[0] || null,
    chequeos_recientes: chequeos,
  });
}
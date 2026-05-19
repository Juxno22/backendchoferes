import { query } from '../db/pool.js';
//unidades
export async function listarUnidades(req, res) {
  const [rows] = await query(
    `SELECT 
        u.*,
        (
          SELECT v.fecha_verificacion
          FROM verificaciones v
          WHERE v.unidad_id = u.id
          ORDER BY v.fecha_verificacion DESC
          LIMIT 1
        ) AS ultima_verif,
        (
          SELECT v.proxima_verificacion
          FROM verificaciones v
          WHERE v.unidad_id = u.id
          ORDER BY v.fecha_verificacion DESC
          LIMIT 1
        ) AS prox_verif
     FROM unidades u
     WHERE u.activa = TRUE
     ORDER BY u.nombre`
  );

  res.json(rows);
}

export async function obtenerUnidad(req, res) {
  const { id } = req.params;

  const [rows] = await query(
    `SELECT *
     FROM unidades
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Unidad no encontrada' });
  }

  res.json(rows[0]);
}

export async function crearUnidad(req, res) {
  const {
    nombre,
    placas,
    numero_economico,
    kilometraje_actual = 0,
    notas,
  } = req.body;

  if (!nombre || !placas) {
    return res.status(400).json({ error: 'Nombre y placas requeridos' });
  }

  const [result] = await query(
    `INSERT INTO unidades
      (
        nombre,
        placas,
        numero_economico,
        kilometraje_actual,
        notas,
        activa
      )
     VALUES (?, ?, ?, ?, ?, TRUE)`,
    [
      nombre,
      placas,
      numero_economico || null,
      kilometraje_actual ?? 0,
      notas || null,
    ]
  );

  const [rows] = await query(
    `SELECT *
     FROM unidades
     WHERE id = ?
     LIMIT 1`,
    [result.insertId]
  );

  res.status(201).json(rows[0]);
}

export async function actualizarUnidad(req, res) {
  const { id } = req.params;

  const {
    nombre,
    placas,
    numero_economico,
    kilometraje_actual,
    notas,
    activa,
  } = req.body;

  const [result] = await query(
    `UPDATE unidades SET
       nombre = COALESCE(?, nombre),
       placas = COALESCE(?, placas),
       numero_economico = COALESCE(?, numero_economico),
       kilometraje_actual = COALESCE(?, kilometraje_actual),
       notas = COALESCE(?, notas),
       activa = COALESCE(?, activa),
       updated_at = NOW()
     WHERE id = ?`,
    [
      nombre ?? null,
      placas ?? null,
      numero_economico ?? null,
      kilometraje_actual ?? null,
      notas ?? null,
      activa ?? null,
      id,
    ]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Unidad no encontrada' });
  }

  const [rows] = await query(
    `SELECT *
     FROM unidades
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  res.json(rows[0]);
}

export async function eliminarUnidad(req, res) {
  const { id } = req.params;

  const [result] = await query(
    `UPDATE unidades
     SET activa = FALSE, updated_at = NOW()
     WHERE id = ?`,
    [id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Unidad no encontrada' });
  }

  res.json({ ok: true });
}

export async function ultimoKm(req, res) {
  const { id } = req.params;

  const [rows] = await query(
    `SELECT kilometraje_actual
     FROM unidades
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Unidad no encontrada' });
  }

  res.json({
    kilometraje: rows[0].kilometraje_actual,
  });
}
//rutas
export async function listarRutas(req, res) {
  const [rows] = await query(
    `SELECT 
        r.*,
        fr.km_por_litro_objetivo
     FROM rutas r
     LEFT JOIN factores_rendimiento fr ON fr.ruta_id = r.id
     WHERE r.activa = TRUE
     ORDER BY r.nombre`
  );

  res.json(rows);
}

export async function actualizarFactorRuta(req, res) {
  const { id } = req.params;
  const { km_por_litro_objetivo } = req.body;

  if (
    km_por_litro_objetivo === undefined ||
    km_por_litro_objetivo === null ||
    Number(km_por_litro_objetivo) <= 0
  ) {
    return res.status(400).json({
      error: 'km_por_litro_objetivo requerido y debe ser mayor a 0',
    });
  }

  await query(
    `INSERT INTO factores_rendimiento
      (ruta_id, km_por_litro_objetivo)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE
      km_por_litro_objetivo = VALUES(km_por_litro_objetivo)`,
    [id, km_por_litro_objetivo]
  );

  const [rows] = await query(
    `SELECT *
     FROM factores_rendimiento
     WHERE ruta_id = ?
     LIMIT 1`,
    [id]
  );

  res.json(rows[0]);
}
//horarios
export async function listarHorarios(req, res) {
  const { fecha } = req.query;

  const params = [];
  let where = '';

  if (fecha) {
    where = 'WHERE h.fecha = ?';
    params.push(fecha);
  }

  const [rows] = await query(
    `SELECT 
        h.*,
        r.nombre AS ruta_nombre
     FROM horarios_ruta h
     JOIN rutas r ON r.id = h.ruta_id
     ${where}
     ORDER BY h.fecha DESC, r.nombre`,
    params
  );

  res.json(rows);
}

export async function setHorario(req, res) {
  const {
    ruta_id,
    fecha,
    hora_salida,
    tolerancia_minutos = 20,
  } = req.body;

  if (!ruta_id || !fecha || !hora_salida) {
    return res.status(400).json({
      error: 'ruta_id, fecha y hora_salida requeridos',
    });
  }

  await query(
    `INSERT INTO horarios_ruta
      (ruta_id, fecha, hora_salida, tolerancia_minutos)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      hora_salida = VALUES(hora_salida),
      tolerancia_minutos = VALUES(tolerancia_minutos)`,
    [
      ruta_id,
      fecha,
      hora_salida,
      tolerancia_minutos ?? 20,
    ]
  );

  const [rows] = await query(
    `SELECT 
        h.*,
        r.nombre AS ruta_nombre
     FROM horarios_ruta h
     JOIN rutas r ON r.id = h.ruta_id
     WHERE h.ruta_id = ?
       AND h.fecha = ?
     LIMIT 1`,
    [ruta_id, fecha]
  );

  res.status(201).json(rows[0]);
}
//verificaciones
export async function listarVerificaciones(req, res) {
  const [rows] = await query(
    `SELECT 
        v.*,
        u.nombre AS unidad_nombre,
        u.placas
     FROM verificaciones v
     JOIN unidades u ON u.id = v.unidad_id
     ORDER BY v.proxima_verificacion ASC`
  );

  res.json(rows);
}

export async function proximasVerificaciones(req, res) {
  const dias = parseInt(req.query.dias, 10) || 30;

  const [rows] = await query(
    `SELECT 
        u.id AS unidad_id,
        u.nombre AS unidad_nombre,
        u.placas,
        v.id AS verificacion_id,
        v.fecha_verificacion,
        v.proxima_verificacion,
        CASE
          WHEN v.proxima_verificacion IS NULL THEN NULL
          ELSE DATEDIFF(v.proxima_verificacion, CURDATE())
        END AS dias_restantes
     FROM unidades u
     LEFT JOIN verificaciones v 
       ON v.id = (
          SELECT v2.id
          FROM verificaciones v2
          WHERE v2.unidad_id = u.id
          ORDER BY v2.proxima_verificacion DESC
          LIMIT 1
       )
     WHERE u.activa = TRUE
       AND (
          v.proxima_verificacion IS NULL
          OR DATEDIFF(v.proxima_verificacion, CURDATE()) <= ?
       )
     ORDER BY 
       CASE 
         WHEN v.proxima_verificacion IS NULL THEN 0
         ELSE 1
       END,
       v.proxima_verificacion ASC,
       u.nombre ASC`,
    [dias]
  );

  res.json(rows);
}

export async function crearVerificacion(req, res) {
  const {
    unidad_id,
    fecha_verificacion,
    proxima_verificacion,
    folio,
    costo,
    notas,
  } = req.body;

  if (!unidad_id || !fecha_verificacion || !proxima_verificacion) {
    return res.status(400).json({
      error: 'unidad_id, fecha_verificacion y proxima_verificacion requeridos',
    });
  }

  const [result] = await query(
    `INSERT INTO verificaciones
      (
        unidad_id,
        fecha_verificacion,
        proxima_verificacion,
        folio,
        costo,
        notas
      )
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      unidad_id,
      fecha_verificacion,
      proxima_verificacion,
      folio || null,
      costo ?? null,
      notas || null,
    ]
  );

  await query(
    `UPDATE unidades
     SET 
       fecha_ultima_verificacion = ?,
       proxima_verificacion = ?,
       updated_at = NOW()
     WHERE id = ?`,
    [
      fecha_verificacion,
      proxima_verificacion,
      unidad_id,
    ]
  );

  const [rows] = await query(
    `SELECT 
        v.*,
        u.nombre AS unidad_nombre,
        u.placas
     FROM verificaciones v
     JOIN unidades u ON u.id = v.unidad_id
     WHERE v.id = ?
     LIMIT 1`,
    [result.insertId]
  );

  res.status(201).json(rows[0]);
}

export async function actualizarVerificacion(req, res) {
  const { id } = req.params;

  const {
    fecha_verificacion,
    proxima_verificacion,
    folio,
    costo,
    notas,
  } = req.body;

  const [result] = await query(
    `UPDATE verificaciones SET
       fecha_verificacion = COALESCE(?, fecha_verificacion),
       proxima_verificacion = COALESCE(?, proxima_verificacion),
       folio = COALESCE(?, folio),
       costo = COALESCE(?, costo),
       notas = COALESCE(?, notas)
     WHERE id = ?`,
    [
      fecha_verificacion ?? null,
      proxima_verificacion ?? null,
      folio ?? null,
      costo ?? null,
      notas ?? null,
      id,
    ]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Verificación no encontrada' });
  }

  const [rows] = await query(
    `SELECT *
     FROM verificaciones
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  const verificacion = rows[0];

  await query(
    `UPDATE unidades
     SET
       fecha_ultima_verificacion = ?,
       proxima_verificacion = ?,
       updated_at = NOW()
     WHERE id = ?`,
    [
      verificacion.fecha_verificacion,
      verificacion.proxima_verificacion,
      verificacion.unidad_id,
    ]
  );

  const [updatedRows] = await query(
    `SELECT 
        v.*,
        u.nombre AS unidad_nombre,
        u.placas
     FROM verificaciones v
     JOIN unidades u ON u.id = v.unidad_id
     WHERE v.id = ?
     LIMIT 1`,
    [id]
  );

  res.json(updatedRows[0]);
}

export async function eliminarVerificacion(req, res) {
  const { id } = req.params;

  const [result] = await query(
    `DELETE FROM verificaciones
     WHERE id = ?`,
    [id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Verificación no encontrada' });
  }

  res.json({ ok: true });
}
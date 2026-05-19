import { query } from '../db/pool.js';

function normalizarRutasIds(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(Number).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export async function obtenerCatalogos(req, res) {
  const [
    [choferes],
    [unidades],
    [rutas],
    [horarios],
    [verificacionesProximas],
  ] = await Promise.all([
    query(
      `SELECT 
          c.id,
          c.nombre,
          c.foto_url,
          c.ruta_asignada_id,
          (
            SELECT GROUP_CONCAT(r.nombre ORDER BY cr.es_principal DESC, r.nombre SEPARATOR ', ')
            FROM chofer_rutas cr
            JOIN rutas r ON r.id = cr.ruta_id
            WHERE cr.chofer_id = c.id
              AND cr.activo = TRUE
              AND r.activa = TRUE
          ) AS ruta_nombre,
          (
            SELECT GROUP_CONCAT(cr.ruta_id ORDER BY cr.es_principal DESC, cr.ruta_id SEPARATOR ',')
            FROM chofer_rutas cr
            JOIN rutas r ON r.id = cr.ruta_id
            WHERE cr.chofer_id = c.id
              AND cr.activo = TRUE
              AND r.activa = TRUE
          ) AS rutas_ids_csv
       FROM choferes c
       WHERE c.activo = TRUE
       ORDER BY c.nombre ASC`
    ),

    query(
      `SELECT 
          id,
          nombre,
          placas,
          numero_economico,
          kilometraje_actual,
          fecha_ultima_verificacion,
          proxima_verificacion
       FROM unidades
       WHERE activa = TRUE
       ORDER BY nombre ASC`
    ),

    query(
      `SELECT 
          r.id,
          r.nombre,
          fr.km_por_litro_objetivo
       FROM rutas r
       LEFT JOIN factores_rendimiento fr ON fr.ruta_id = r.id
       WHERE r.activa = TRUE
       ORDER BY r.nombre ASC`
    ),

    query(
      `SELECT 
          h.id,
          h.ruta_id,
          h.fecha,
          h.hora_salida,
          h.tolerancia_minutos,
          r.nombre AS ruta_nombre
       FROM horarios_ruta h
       JOIN rutas r ON r.id = h.ruta_id
       WHERE h.fecha >= CURDATE()
       ORDER BY h.fecha ASC, r.nombre ASC
       LIMIT 100`
    ),

    query(
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
            OR DATEDIFF(v.proxima_verificacion, CURDATE()) <= 30
         )
       ORDER BY 
         CASE 
           WHEN v.proxima_verificacion IS NULL THEN 0
           ELSE 1
         END,
         v.proxima_verificacion ASC,
         u.nombre ASC`
    ),
  ]);

  const choferesNormalizados = choferes.map((chofer) => ({
    ...chofer,
    rutas_ids: normalizarRutasIds(chofer.rutas_ids_csv),
    ruta_nombre: chofer.ruta_nombre || 'Sin ruta',
  }));

  res.json({
    choferes: choferesNormalizados,
    unidades,
    rutas,
    horarios,
    verificaciones_proximas: verificacionesProximas,
  });
}
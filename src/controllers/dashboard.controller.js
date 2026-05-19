import { query } from '../db/pool.js';

function periodoActual(req) {
  return {
    anio: parseInt(req.query.anio, 10) || new Date().getFullYear(),
    mes: parseInt(req.query.mes, 10) || new Date().getMonth() + 1,
  };
}

export async function resumenDashboard(req, res) {
  const { anio, mes } = periodoActual(req);

  const [
    [totalesChoferes],
    [totalesUnidades],
    [verificaciones],
    [chequeosHoy],
    [registrosMes],
    [incentivos],
    [topIncentivos],
  ] = await Promise.all([
    query(
      `SELECT 
          COUNT(*) AS total_choferes
       FROM choferes
       WHERE activo = TRUE`
    ),
    query(
      `SELECT 
          COUNT(*) AS total_unidades
       FROM unidades
       WHERE activa = TRUE`
    ),
    query(
      `SELECT 
          COUNT(*) AS total_proximas
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
         )`
    ),
    query(
      `SELECT 
          COUNT(*) AS total_chequeos_hoy
       FROM check_unidad
       WHERE fecha = CURDATE()`
    ),
    query(
      `SELECT
          (SELECT COUNT(*) FROM rendimiento_diario WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?) AS rendimiento,
          (SELECT COUNT(*) FROM puntualidad WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?) AS puntualidad,
          (SELECT COUNT(*) FROM servicio_clientes WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?) AS servicio,
          (SELECT COUNT(*) FROM limpieza_cuidado WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?) AS limpieza`,
      [anio, mes, anio, mes, anio, mes, anio, mes]
    ),
    query(
      `SELECT
          COUNT(*) AS total_calculados,
          COALESCE(AVG(score_total), 0) AS score_promedio,
          COALESCE(SUM(monto), 0) AS monto_total
       FROM incentivos
       WHERE anio = ?
         AND mes = ?`,
      [anio, mes]
    ),
    query(
      `SELECT 
          i.chofer_id,
          c.nombre AS chofer_nombre,
          c.foto_url,
          r.nombre AS ruta_nombre,
          i.score_total,
          ROUND(i.score_total * 100, 2) AS porcentaje,
          i.monto
       FROM incentivos i
       LEFT JOIN choferes c ON c.id = i.chofer_id
       LEFT JOIN rutas r ON r.id = i.ruta_id
       WHERE i.anio = ?
         AND i.mes = ?
       ORDER BY i.score_total DESC
       LIMIT 5`,
      [anio, mes]
    ),
  ]);

  res.json({
    periodo: { anio, mes },
    totales: {
      choferes: Number(totalesChoferes[0]?.total_choferes || 0),
      unidades: Number(totalesUnidades[0]?.total_unidades || 0),
      verificaciones_proximas: Number(verificaciones[0]?.total_proximas || 0),
      chequeos_hoy: Number(chequeosHoy[0]?.total_chequeos_hoy || 0),
    },
    registros_mes: {
      rendimiento: Number(registrosMes[0]?.rendimiento || 0),
      puntualidad: Number(registrosMes[0]?.puntualidad || 0),
      servicio: Number(registrosMes[0]?.servicio || 0),
      limpieza: Number(registrosMes[0]?.limpieza || 0),
    },
    incentivos: {
      total_calculados: Number(incentivos[0]?.total_calculados || 0),
      score_promedio: Number(incentivos[0]?.score_promedio || 0),
      porcentaje_promedio: Number(((incentivos[0]?.score_promedio || 0) * 100).toFixed(2)),
      monto_total: Number(incentivos[0]?.monto_total || 0),
      top: topIncentivos,
    },
  });
}
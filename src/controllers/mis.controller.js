import { query } from '../db/pool.js';

export async function misChequeos(req, res) {
  if (req.user.rol !== 'chofer' || !req.user.chofer_id) {
    return res.status(403).json({
      error: 'Esta consulta es solo para usuarios con perfil de chofer',
    });
  }

  const {
    unidad_id,
    fecha_desde,
    fecha_hasta,
    limit = 50,
  } = req.query;

  const params = [req.user.chofer_id];
  const cond = ['c.chofer_id = ?'];

  if (unidad_id) {
    cond.push('c.unidad_id = ?');
    params.push(unidad_id);
  }

  if (fecha_desde) {
    cond.push('c.fecha >= ?');
    params.push(String(fecha_desde).slice(0, 10));
  }

  if (fecha_hasta) {
    cond.push('c.fecha <= ?');
    params.push(String(fecha_hasta).slice(0, 10));
  }

  const limite = Math.min(Number(limit) || 50, 200);

  const [rows] = await query(
    `SELECT 
        c.*,
        u.nombre AS unidad_nombre,
        u.placas,
        (
          SELECT COUNT(*)
          FROM check_unidad_fotos f
          WHERE f.check_id = c.id
        ) AS fotos_count
     FROM check_unidad c
     LEFT JOIN unidades u ON u.id = c.unidad_id
     WHERE ${cond.join(' AND ')}
     ORDER BY c.fecha DESC, c.hora DESC, c.id DESC
     LIMIT ${limite}`,
    params
  );

  res.json(rows);
}

export async function miUltimoChequeo(req, res) {
  if (req.user.rol !== 'chofer' || !req.user.chofer_id) {
    return res.status(403).json({
      error: 'Esta consulta es solo para usuarios con perfil de chofer',
    });
  }

  const [checkRows] = await query(
    `SELECT 
        c.*,
        u.nombre AS unidad_nombre,
        u.placas
     FROM check_unidad c
     LEFT JOIN unidades u ON u.id = c.unidad_id
     WHERE c.chofer_id = ?
     ORDER BY c.fecha DESC, c.hora DESC, c.id DESC
     LIMIT 1`,
    [req.user.chofer_id]
  );

  if (checkRows.length === 0) {
    return res.json(null);
  }

  const check = checkRows[0];

  const [[items], [fotos]] = await Promise.all([
    query(
      `SELECT *
       FROM check_unidad_items
       WHERE check_id = ?
       ORDER BY categoria ASC, item ASC`,
      [check.id]
    ),
    query(
      `SELECT *
       FROM check_unidad_fotos
       WHERE check_id = ?
       ORDER BY id ASC`,
      [check.id]
    ),
  ]);

  res.json({
    ...check,
    items,
    fotos,
  });
}
import { query } from '../db/pool.js';

//Helpers
function normalizarFecha(fecha) {
  if (!fecha) return null;
  return String(fecha).slice(0, 10);
}

function calcularATiempo(horaProgramada, horaReal, toleranciaMinutos = 20) {
  if (!horaProgramada || !horaReal) return false;

  const [hpH, hpM] = String(horaProgramada).split(':').map(Number);
  const [hrH, hrM] = String(horaReal).split(':').map(Number);

  const programadaMin = hpH * 60 + hpM;
  const realMin = hrH * 60 + hrM;

  return realMin <= programadaMin + Number(toleranciaMinutos || 20);
}

//Rendimiento
export async function listarRendimiento(req, res) {
  const { fecha, chofer_id, ruta_id, unidad_id } = req.query;

  const params = [];
  const cond = [];

  if (fecha) {
    cond.push('rd.fecha = ?');
    params.push(fecha);
  }

  if (chofer_id) {
    cond.push('rd.chofer_id = ?');
    params.push(chofer_id);
  }

  if (ruta_id) {
    cond.push('rd.ruta_id = ?');
    params.push(ruta_id);
  }

  if (unidad_id) {
    cond.push('rd.unidad_id = ?');
    params.push(unidad_id);
  }

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

  const [rows] = await query(
    `SELECT 
        rd.*,
        c.nombre AS chofer_nombre,
        u.nombre AS unidad_nombre,
        u.placas,
        r.nombre AS ruta_nombre,
        fr.km_por_litro_objetivo
     FROM rendimiento_diario rd
     LEFT JOIN choferes c ON c.id = rd.chofer_id
     LEFT JOIN unidades u ON u.id = rd.unidad_id
     LEFT JOIN rutas r ON r.id = rd.ruta_id
     LEFT JOIN factores_rendimiento fr ON fr.ruta_id = rd.ruta_id
     ${where}
     ORDER BY rd.fecha DESC, c.nombre ASC
     LIMIT 500`,
    params
  );

  res.json(rows);
}

export async function crearRendimiento(req, res) {
  const {
    fecha,
    chofer_id,
    unidad_id,
    ruta_id,
    km_inicial,
    km_final,
    litros,
    precio_litro,
    total_mercancia = 0,
    casetas = 0,
    notas,
  } = req.body;

  if (!fecha || !chofer_id || !unidad_id || !ruta_id) {
    return res.status(400).json({
      error: 'fecha, chofer_id, unidad_id y ruta_id son requeridos',
    });
  }

  if (km_inicial === undefined || km_final === undefined) {
    return res.status(400).json({
      error: 'km_inicial y km_final son requeridos',
    });
  }

  if (Number(km_final) < Number(km_inicial)) {
    return res.status(400).json({
      error: 'km_final no puede ser menor a km_inicial',
    });
  }

  const [factorRows] = await query(
    `SELECT km_por_litro_objetivo
     FROM factores_rendimiento
     WHERE ruta_id = ?
     LIMIT 1`,
    [ruta_id]
  );

  const objetivo = Number(factorRows[0]?.km_por_litro_objetivo || 0);
  const litrosNum = Number(litros || 0);
  const kmRecorridos = Number(km_final) - Number(km_inicial);
  const rendimiento = litrosNum > 0 ? kmRecorridos / litrosNum : 0;
  const cumpleObjetivo = objetivo > 0 ? rendimiento >= objetivo : false;

  await query(
    `INSERT INTO rendimiento_diario
      (
        fecha,
        chofer_id,
        unidad_id,
        ruta_id,
        km_inicial,
        km_final,
        litros,
        precio_litro,
        total_mercancia,
        casetas,
        cumple_objetivo,
        notas,
        registrado_por
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        ruta_id = VALUES(ruta_id),
        km_inicial = VALUES(km_inicial),
        km_final = VALUES(km_final),
        litros = VALUES(litros),
        precio_litro = VALUES(precio_litro),
        total_mercancia = VALUES(total_mercancia),
        casetas = VALUES(casetas),
        cumple_objetivo = VALUES(cumple_objetivo),
        notas = VALUES(notas),
        registrado_por = VALUES(registrado_por)`,
    [
      normalizarFecha(fecha),
      chofer_id,
      unidad_id,
      ruta_id,
      km_inicial,
      km_final,
      litrosNum,
      precio_litro ?? null,
      total_mercancia ?? 0,
      casetas ?? 0,
      cumpleObjetivo,
      notas || null,
      req.user.id,
    ]
  );

  await query(
    `UPDATE unidades
     SET kilometraje_actual = ?, updated_at = NOW()
     WHERE id = ?`,
    [km_final, unidad_id]
  );

  const [rows] = await query(
    `SELECT 
        rd.*,
        c.nombre AS chofer_nombre,
        u.nombre AS unidad_nombre,
        u.placas,
        r.nombre AS ruta_nombre,
        fr.km_por_litro_objetivo
     FROM rendimiento_diario rd
     LEFT JOIN choferes c ON c.id = rd.chofer_id
     LEFT JOIN unidades u ON u.id = rd.unidad_id
     LEFT JOIN rutas r ON r.id = rd.ruta_id
     LEFT JOIN factores_rendimiento fr ON fr.ruta_id = rd.ruta_id
     WHERE rd.fecha = ?
       AND rd.chofer_id = ?
       AND rd.unidad_id = ?
     LIMIT 1`,
    [normalizarFecha(fecha), chofer_id, unidad_id]
  );

  res.status(201).json(rows[0]);
}

export async function eliminarRendimiento(req, res) {
  const { id } = req.params;

  const [result] = await query(
    `DELETE FROM rendimiento_diario
     WHERE id = ?`,
    [id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Registro de rendimiento no encontrado' });
  }

  res.json({ ok: true });
}

//Puntualidad
export async function listarPuntualidad(req, res) {
  const { fecha, chofer_id, ruta_id } = req.query;

  const params = [];
  const cond = [];

  if (fecha) {
    cond.push('p.fecha = ?');
    params.push(fecha);
  }

  if (chofer_id) {
    cond.push('p.chofer_id = ?');
    params.push(chofer_id);
  }

  if (ruta_id) {
    cond.push('p.ruta_id = ?');
    params.push(ruta_id);
  }

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

  const [rows] = await query(
    `SELECT 
        p.*,
        c.nombre AS chofer_nombre,
        r.nombre AS ruta_nombre
     FROM puntualidad p
     LEFT JOIN choferes c ON c.id = p.chofer_id
     LEFT JOIN rutas r ON r.id = p.ruta_id
     ${where}
     ORDER BY p.fecha DESC, c.nombre ASC
     LIMIT 500`,
    params
  );

  res.json(rows);
}

export async function crearPuntualidad(req, res) {
  const {
    fecha,
    chofer_id,
    ruta_id,
    hora_programada,
    hora_salida_real,
    tolerancia_minutos = 20,
    notas,
  } = req.body;

  if (!fecha || !chofer_id || !ruta_id || !hora_programada || !hora_salida_real) {
    return res.status(400).json({
      error: 'fecha, chofer_id, ruta_id, hora_programada y hora_salida_real son requeridos',
    });
  }

  const aTiempo = calcularATiempo(
    hora_programada,
    hora_salida_real,
    tolerancia_minutos
  );

  await query(
    `INSERT INTO puntualidad
      (
        fecha,
        chofer_id,
        ruta_id,
        hora_programada,
        hora_salida_real,
        tolerancia_minutos,
        a_tiempo,
        notas,
        registrado_por
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        ruta_id = VALUES(ruta_id),
        hora_programada = VALUES(hora_programada),
        hora_salida_real = VALUES(hora_salida_real),
        tolerancia_minutos = VALUES(tolerancia_minutos),
        a_tiempo = VALUES(a_tiempo),
        notas = VALUES(notas),
        registrado_por = VALUES(registrado_por)`,
    [
      normalizarFecha(fecha),
      chofer_id,
      ruta_id,
      hora_programada,
      hora_salida_real,
      tolerancia_minutos ?? 20,
      aTiempo,
      notas || null,
      req.user.id,
    ]
  );

  const [rows] = await query(
    `SELECT 
        p.*,
        c.nombre AS chofer_nombre,
        r.nombre AS ruta_nombre
     FROM puntualidad p
     LEFT JOIN choferes c ON c.id = p.chofer_id
     LEFT JOIN rutas r ON r.id = p.ruta_id
     WHERE p.fecha = ?
       AND p.chofer_id = ?
     LIMIT 1`,
    [normalizarFecha(fecha), chofer_id]
  );

  res.status(201).json(rows[0]);
}

//Servicio
export async function listarServicio(req, res) {
  const { fecha, chofer_id, ruta_id } = req.query;

  const params = [];
  const cond = [];

  if (fecha) {
    cond.push('s.fecha = ?');
    params.push(fecha);
  }

  if (chofer_id) {
    cond.push('s.chofer_id = ?');
    params.push(chofer_id);
  }

  if (ruta_id) {
    cond.push('s.ruta_id = ?');
    params.push(ruta_id);
  }

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

  const [rows] = await query(
    `SELECT 
        s.*,
        c.nombre AS chofer_nombre,
        r.nombre AS ruta_nombre
     FROM servicio_clientes s
     LEFT JOIN choferes c ON c.id = s.chofer_id
     LEFT JOIN rutas r ON r.id = s.ruta_id
     ${where}
     ORDER BY s.fecha DESC, c.nombre ASC
     LIMIT 500`,
    params
  );

  res.json(rows);
}

export async function crearServicio(req, res) {
  const {
    fecha,
    chofer_id,
    ruta_id,
    clientes_esperados,
    clientes_visitados,
    incidencias = 0,
    comentarios,
  } = req.body;

  if (!fecha || !chofer_id || !ruta_id) {
    return res.status(400).json({
      error: 'fecha, chofer_id y ruta_id son requeridos',
    });
  }

  await query(
    `INSERT INTO servicio_clientes
      (
        fecha,
        chofer_id,
        ruta_id,
        clientes_esperados,
        clientes_visitados,
        incidencias,
        comentarios,
        registrado_por
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        ruta_id = VALUES(ruta_id),
        clientes_esperados = VALUES(clientes_esperados),
        clientes_visitados = VALUES(clientes_visitados),
        incidencias = VALUES(incidencias),
        comentarios = VALUES(comentarios),
        registrado_por = VALUES(registrado_por)`,
    [
      normalizarFecha(fecha),
      chofer_id,
      ruta_id,
      clientes_esperados ?? 0,
      clientes_visitados ?? 0,
      incidencias ?? 0,
      comentarios || null,
      req.user.id,
    ]
  );

  const [rows] = await query(
    `SELECT 
        s.*,
        c.nombre AS chofer_nombre,
        r.nombre AS ruta_nombre
     FROM servicio_clientes s
     LEFT JOIN choferes c ON c.id = s.chofer_id
     LEFT JOIN rutas r ON r.id = s.ruta_id
     WHERE s.fecha = ?
       AND s.chofer_id = ?
     LIMIT 1`,
    [normalizarFecha(fecha), chofer_id]
  );

  res.status(201).json(rows[0]);
}

//Limpieza y ccuidado
export async function listarLimpieza(req, res) {
  const { fecha, chofer_id, unidad_id } = req.query;

  const params = [];
  const cond = [];

  if (fecha) {
    cond.push('l.fecha = ?');
    params.push(fecha);
  }

  if (chofer_id) {
    cond.push('l.chofer_id = ?');
    params.push(chofer_id);
  }

  if (unidad_id) {
    cond.push('l.unidad_id = ?');
    params.push(unidad_id);
  }

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

  const [rows] = await query(
    `SELECT 
        l.*,
        c.nombre AS chofer_nombre,
        u.nombre AS unidad_nombre,
        u.placas
     FROM limpieza_cuidado l
     LEFT JOIN choferes c ON c.id = l.chofer_id
     LEFT JOIN unidades u ON u.id = l.unidad_id
     ${where}
     ORDER BY l.fecha DESC, c.nombre ASC
     LIMIT 500`,
    params
  );

  res.json(rows);
}

export async function crearLimpieza(req, res) {
  const {
    fecha,
    chofer_id,
    unidad_id,
    lavada_semana = false,
    reporto_falla = false,
    detalle_falla,
    mantenimiento_realizado = true,
    mantenimiento_a_tiempo = true,
    notas,
  } = req.body;

  if (!fecha || !chofer_id || !unidad_id) {
    return res.status(400).json({
      error: 'fecha, chofer_id y unidad_id son requeridos',
    });
  }

  const [preventivoRows] = await query(
    `SELECT COUNT(*) AS n
     FROM check_unidad
     WHERE chofer_id = ?
       AND tipo = 'chofer'
       AND reporta_servicio_preventivo = TRUE
       AND fecha >= DATE_SUB(?, INTERVAL 7 DAY)
       AND fecha <= ?`,
    [
      chofer_id,
      normalizarFecha(fecha),
      normalizarFecha(fecha),
    ]
  );

  const choferReportoPreventivo = Number(preventivoRows[0]?.n || 0) > 0;

  await query(
    `INSERT INTO limpieza_cuidado
      (
        fecha,
        chofer_id,
        unidad_id,
        lavada_semana,
        reporto_falla,
        detalle_falla,
        mantenimiento_realizado,
        mantenimiento_a_tiempo,
        chofer_reporto_preventivo,
        notas,
        registrado_por
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        lavada_semana = VALUES(lavada_semana),
        reporto_falla = VALUES(reporto_falla),
        detalle_falla = VALUES(detalle_falla),
        mantenimiento_realizado = VALUES(mantenimiento_realizado),
        mantenimiento_a_tiempo = VALUES(mantenimiento_a_tiempo),
        chofer_reporto_preventivo = VALUES(chofer_reporto_preventivo),
        notas = VALUES(notas),
        registrado_por = VALUES(registrado_por)`,
    [
      normalizarFecha(fecha),
      chofer_id,
      unidad_id,
      Boolean(lavada_semana),
      Boolean(reporto_falla),
      detalle_falla || null,
      Boolean(mantenimiento_realizado),
      Boolean(mantenimiento_a_tiempo),
      choferReportoPreventivo,
      notas || null,
      req.user.id,
    ]
  );

  const [rows] = await query(
    `SELECT 
        l.*,
        c.nombre AS chofer_nombre,
        u.nombre AS unidad_nombre,
        u.placas
     FROM limpieza_cuidado l
     LEFT JOIN choferes c ON c.id = l.chofer_id
     LEFT JOIN unidades u ON u.id = l.unidad_id
     WHERE l.fecha = ?
       AND l.chofer_id = ?
       AND l.unidad_id = ?
     LIMIT 1`,
    [normalizarFecha(fecha), chofer_id, unidad_id]
  );

  res.status(201).json(rows[0]);
}
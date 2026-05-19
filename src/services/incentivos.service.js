import { query } from '../db/pool.js';
// Motor de cálculo de incentivos:
// Rendimiento: 50%
// Puntualidad: 12.5%
// Servicio: 12.5%
// Limpieza/Cuidado: 25%
// Total bloque Puntualidad + Servicio = 25%
// Monto máximo default: $4,000 MXN
const PESOS = {
  rendimiento: 0.50,
  puntualidad: 0.125,
  servicio: 0.125,
  limpieza: 0.25,
};

const MONTO_MAX_DEFAULT = 4000;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, decimals = 4) {
  return Number(Number(value || 0).toFixed(decimals));
}

// RENDIMIENTO 50%
// Score = días que cumplieron objetivo / días con registro
async function scoreRendimiento(choferId, anio, mes) {
  const [rows] = await query(
    `SELECT 
        rd.rendimiento,
        rd.cumple_objetivo,
        fr.km_por_litro_objetivo
     FROM rendimiento_diario rd
     LEFT JOIN factores_rendimiento fr ON fr.ruta_id = rd.ruta_id
     WHERE rd.chofer_id = ?
       AND YEAR(rd.fecha) = ?
       AND MONTH(rd.fecha) = ?`,
    [choferId, anio, mes]
  );

  if (rows.length === 0) {
    return {
      score: 0,
      dias: 0,
      cumplidos: 0,
    };
  }

  let cumplidos = 0;

  for (const row of rows) {
    const objetivo = toNumber(row.km_por_litro_objetivo);
    const rendimiento = toNumber(row.rendimiento);

    if (row.cumple_objetivo === 1 || row.cumple_objetivo === true) {
      cumplidos++;
    } else if (objetivo > 0 && rendimiento >= objetivo) {
      cumplidos++;
    }
  }

  return {
    score: cumplidos / rows.length,
    dias: rows.length,
    cumplidos,
  };
}

// PUNTUALIDAD 12.5%
// Score = salidas a tiempo / registros de puntualidad
async function scorePuntualidad(choferId, anio, mes) {
  const [rows] = await query(
    `SELECT a_tiempo
     FROM puntualidad
     WHERE chofer_id = ?
       AND YEAR(fecha) = ?
       AND MONTH(fecha) = ?`,
    [choferId, anio, mes]
  );

  if (rows.length === 0) {
    return {
      score: 0,
      dias: 0,
      a_tiempo: 0,
    };
  }

  const aTiempo = rows.filter((row) => row.a_tiempo === 1 || row.a_tiempo === true).length;

  return {
    score: aTiempo / rows.length,
    dias: rows.length,
    a_tiempo: aTiempo,
  };
}

// SERVICIO 12.5%
// Por día:
// 0 incidencias = 100%
// 1 incidencia  = 50%
// 2 incidencias = 25%
// 3+ incidencias = 0%
function factorIncidencias(n) {
  const incidencias = Number(n || 0);

  if (incidencias <= 0) return 1;
  if (incidencias === 1) return 0.5;
  if (incidencias === 2) return 0.25;

  return 0;
}

async function scoreServicio(choferId, anio, mes) {
  const [rows] = await query(
    `SELECT 
        clientes_esperados,
        clientes_visitados,
        incidencias
     FROM servicio_clientes
     WHERE chofer_id = ?
       AND YEAR(fecha) = ?
       AND MONTH(fecha) = ?`,
    [choferId, anio, mes]
  );

  if (rows.length === 0) {
    return {
      score: 0,
      dias: 0,
      incidencias_total: 0,
    };
  }

  let suma = 0;
  let incidenciasTotal = 0;

  for (const row of rows) {
    const esperados = toNumber(row.clientes_esperados);
    const visitados = toNumber(row.clientes_visitados);
    const incidencias = toNumber(row.incidencias);

    incidenciasTotal += incidencias;

    const cumplimientoClientes = esperados > 0
      ? Math.min(1, visitados / esperados)
      : 1;

    suma += cumplimientoClientes * factorIncidencias(incidencias);
  }

  return {
    score: suma / rows.length,
    dias: rows.length,
    incidencias_total: incidenciasTotal,
  };
}

// LIMPIEZA / CUIDADO 25%
// Regla base por día:
// - lavada_semana vale 33%
// - mantenimiento a tiempo vale 34%
// - reportar falla cuando aplica vale 33%
//
// Regla estricta:
// si mantenimiento NO se realizó y el chofer NO reportó falla/preventivo,
// el día de limpieza queda en 0.
async function scoreLimpieza(choferId, anio, mes) {
  const [rows] = await query(
    `SELECT 
        lavada_semana,
        reporto_falla,
        mantenimiento_realizado,
        mantenimiento_a_tiempo,
        chofer_reporto_preventivo
     FROM limpieza_cuidado
     WHERE chofer_id = ?
       AND YEAR(fecha) = ?
       AND MONTH(fecha) = ?`,
    [choferId, anio, mes]
  );

  if (rows.length === 0) {
    return {
      score: 0,
      dias: 0,
      dias_penalizados_total: 0,
    };
  }

  let suma = 0;
  let diasPenalizadosTotal = 0;

  for (const row of rows) {
    const lavada = row.lavada_semana === 1 || row.lavada_semana === true;
    const reportoFalla = row.reporto_falla === 1 || row.reporto_falla === true;
    const mantenimientoRealizado = row.mantenimiento_realizado === 1 || row.mantenimiento_realizado === true;
    const mantenimientoATiempo = row.mantenimiento_a_tiempo === 1 || row.mantenimiento_a_tiempo === true;
    const reportoPreventivo = row.chofer_reporto_preventivo === 1 || row.chofer_reporto_preventivo === true;

    // Penalización total del día:
    // Si había problema/mantenimiento no realizado y el chofer no avisó por falla ni preventivo.
    if (!mantenimientoRealizado && !reportoFalla && !reportoPreventivo) {
      suma += 0;
      diasPenalizadosTotal++;
      continue;
    }

    let dia = 1;

    if (!lavada) {
      dia -= 0.33;
    }

    // Si no estuvo a tiempo, se exime si el chofer reportó preventivo.
    if (!mantenimientoATiempo && !reportoPreventivo) {
      dia -= 0.34;
    }

    // Si no se realizó mantenimiento y no reportó falla, se descuenta.
    // Aquí ya no entra el caso grave porque fue cubierto arriba.
    if (!mantenimientoRealizado && !reportoFalla && !reportoPreventivo) {
      dia -= 0.33;
    }

    suma += Math.max(0, dia);
  }

  return {
    score: suma / rows.length,
    dias: rows.length,
    dias_penalizados_total: diasPenalizadosTotal,
  };
}

// CÁLCULO TOTAL
export async function calcularIncentivoChofer(choferId, anio, mes, opts = {}) {
  const {
    montoMax = MONTO_MAX_DEFAULT,
    persistir = true,
  } = opts;

  const [[choferRows], rendimiento, puntualidad, servicio, limpieza] = await Promise.all([
    query(
      `SELECT 
          c.id,
          c.nombre,
          c.ruta_asignada_id,
          r.nombre AS ruta_nombre
       FROM choferes c
       LEFT JOIN rutas r ON r.id = c.ruta_asignada_id
       WHERE c.id = ?
       LIMIT 1`,
      [choferId]
    ),
    scoreRendimiento(choferId, anio, mes),
    scorePuntualidad(choferId, anio, mes),
    scoreServicio(choferId, anio, mes),
    scoreLimpieza(choferId, anio, mes),
  ]);

  if (choferRows.length === 0) {
    const error = new Error('Chofer no encontrado');
    error.status = 404;
    throw error;
  }

  const chofer = choferRows[0];

  const aporteRendimiento = rendimiento.score * PESOS.rendimiento;
  const aportePuntualidad = puntualidad.score * PESOS.puntualidad;
  const aporteServicio = servicio.score * PESOS.servicio;
  const aporteLimpieza = limpieza.score * PESOS.limpieza;

  const total =
    aporteRendimiento +
    aportePuntualidad +
    aporteServicio +
    aporteLimpieza;

  const scoreTotal = round(total, 4);
  const monto = round(scoreTotal * montoMax, 2);

  const diasTrabajados = Math.max(
    rendimiento.dias,
    puntualidad.dias,
    servicio.dias,
    limpieza.dias
  );

  const result = {
    chofer_id: Number(choferId),
    chofer_nombre: chofer.nombre,
    ruta_id: chofer.ruta_asignada_id,
    ruta_nombre: chofer.ruta_nombre,
    anio,
    mes,
    dias_trabajados: diasTrabajados,
    rendimiento: {
      ...rendimiento,
      score: round(rendimiento.score, 4),
      peso: PESOS.rendimiento,
      aporte: round(aporteRendimiento, 4),
    },
    puntualidad: {
      ...puntualidad,
      score: round(puntualidad.score, 4),
      peso: PESOS.puntualidad,
      aporte: round(aportePuntualidad, 4),
    },
    servicio: {
      ...servicio,
      score: round(servicio.score, 4),
      peso: PESOS.servicio,
      aporte: round(aporteServicio, 4),
    },
    limpieza: {
      ...limpieza,
      score: round(limpieza.score, 4),
      peso: PESOS.limpieza,
      aporte: round(aporteLimpieza, 4),
    },
    score_total: scoreTotal,
    porcentaje: round(scoreTotal * 100, 2),
    monto,
    monto_maximo: montoMax,
  };

  if (persistir) {
    await query(
      `INSERT INTO incentivos
        (
          anio,
          mes,
          chofer_id,
          ruta_id,
          dias_trabajados,
          score_rendimiento,
          score_puntualidad,
          score_servicio,
          score_limpieza,
          score_total,
          monto,
          monto_maximo,
          calculado_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
          ruta_id = VALUES(ruta_id),
          dias_trabajados = VALUES(dias_trabajados),
          score_rendimiento = VALUES(score_rendimiento),
          score_puntualidad = VALUES(score_puntualidad),
          score_servicio = VALUES(score_servicio),
          score_limpieza = VALUES(score_limpieza),
          score_total = VALUES(score_total),
          monto = VALUES(monto),
          monto_maximo = VALUES(monto_maximo),
          calculado_at = NOW()`,
      [
        anio,
        mes,
        choferId,
        chofer.ruta_asignada_id || null,
        diasTrabajados,
        round(rendimiento.score, 4),
        round(puntualidad.score, 4),
        round(servicio.score, 4),
        round(limpieza.score, 4),
        scoreTotal,
        monto,
        montoMax,
      ]
    );
  }

  return result;
}

export async function calcularIncentivosMes(anio, mes, opts = {}) {
  const [choferes] = await query(
    `SELECT id, nombre
     FROM choferes
     WHERE activo = TRUE
     ORDER BY nombre ASC`
  );

  const resultados = [];

  for (const chofer of choferes) {
    const resultado = await calcularIncentivoChofer(chofer.id, anio, mes, opts);
    resultados.push(resultado);
  }

  return resultados;
}

export { PESOS, MONTO_MAX_DEFAULT };
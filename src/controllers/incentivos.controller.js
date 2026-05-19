import { query } from '../db/pool.js';
import {
  calcularIncentivoChofer,
  calcularIncentivosMes,
  MONTO_MAX_DEFAULT,
} from '../services/incentivos.service.js';

function periodoDesdeRequest(req) {
  return {
    anio: parseInt(req.query.anio || req.body?.anio, 10) || new Date().getFullYear(),
    mes: parseInt(req.query.mes || req.body?.mes, 10) || new Date().getMonth() + 1,
  };
}

function montoMaxDesdeRequest(req) {
  const value = req.query.monto_maximo || req.body?.monto_maximo;
  const monto = Number(value);

  if (!Number.isFinite(monto) || monto <= 0) {
    return MONTO_MAX_DEFAULT;
  }

  return monto;
}

// LISTAR INCENTIVOS PERSISTIDOS
export async function listarIncentivos(req, res) {
  const { anio, mes } = periodoDesdeRequest(req);

  const [rows] = await query(
    `SELECT 
        i.*,
        c.nombre AS chofer_nombre,
        c.foto_url,
        r.nombre AS ruta_nombre,
        ROUND(i.score_total * 100, 2) AS porcentaje
     FROM incentivos i
     LEFT JOIN choferes c ON c.id = i.chofer_id
     LEFT JOIN rutas r ON r.id = i.ruta_id
     WHERE i.anio = ?
       AND i.mes = ?
     ORDER BY i.score_total DESC, c.nombre ASC`,
    [anio, mes]
  );

  res.json({
    periodo: { anio, mes },
    total: rows.length,
    incentivos: rows,
  });
}

// RECALCULAR TODOS LOS CHOFERES
export async function recalcular(req, res) {
  const { anio, mes } = periodoDesdeRequest(req);
  const montoMax = montoMaxDesdeRequest(req);

  const resultados = await calcularIncentivosMes(anio, mes, {
    montoMax,
    persistir: true,
  });

  res.json({
    periodo: { anio, mes },
    monto_maximo: montoMax,
    total: resultados.length,
    resultados,
  });
}

// PREVIEW DE UN CHOFER SIN GUARDAR
export async function previewChofer(req, res) {
  const { chofer_id } = req.params;
  const { anio, mes } = periodoDesdeRequest(req);
  const montoMax = montoMaxDesdeRequest(req);

  const resultado = await calcularIncentivoChofer(
    parseInt(chofer_id, 10),
    anio,
    mes,
    {
      montoMax,
      persistir: false,
    }
  );

  res.json(resultado);
}
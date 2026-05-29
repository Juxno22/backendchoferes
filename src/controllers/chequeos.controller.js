import { query, pool } from '../db/pool.js';
import { uploadBuffer, deleteImage } from '../config/cloudinary.js';

// Catálogo de items del check de unidad.
// Basado en el formato manual de CHECK DE UNIDADES.
export const CATALOGO_ITEMS = [
  // Documentos
  { categoria: 'documentos', item: 'LICENCIA' },
  { categoria: 'documentos', item: 'TARJETA DE CIRCULACION' },
  { categoria: 'documentos', item: 'TARJETON DE CARGA' },
  { categoria: 'documentos', item: 'POLIZA DE SEGURO' },

  // Sistema de luces
  { categoria: 'sistema_luces', item: 'LUZ ALTA' },
  { categoria: 'sistema_luces', item: 'LUZ BAJA' },
  { categoria: 'sistema_luces', item: 'DIRECCIONALES' },
  { categoria: 'sistema_luces', item: 'INTERMITENTES' },
  { categoria: 'sistema_luces', item: 'STOP' },
  { categoria: 'sistema_luces', item: 'LUZ INTERIOR' },
  { categoria: 'sistema_luces', item: 'CUARTOS DEL-TRAS' },

  // Neumáticos
  { categoria: 'estado_neumaticos', item: 'DELANTERO DER' },
  { categoria: 'estado_neumaticos', item: 'DELANTERO IZQ' },
  { categoria: 'estado_neumaticos', item: 'TRASERO DER' },
  { categoria: 'estado_neumaticos', item: 'TRASERO IZQ' },
  { categoria: 'estado_neumaticos', item: 'LLANTA DE REFACCION' },

  // Accesorios
  { categoria: 'accesorios_seguridad', item: 'GATO HIDRAULICO DE BOTELLA' },
  { categoria: 'accesorios_seguridad', item: 'LLAVE DE CRUZ' },
  { categoria: 'accesorios_seguridad', item: 'DESARMADOR' },
  { categoria: 'accesorios_seguridad', item: 'FANTASMAS / CONO DE SEGURIDAD' },
  { categoria: 'accesorios_seguridad', item: 'EXTINGUIDOR' },

  // Parte interna
  { categoria: 'parte_interna', item: 'INDICADOR ENC. TABLERO' },
  { categoria: 'parte_interna', item: 'FRENO DE MANO' },
  { categoria: 'parte_interna', item: 'CINTURON SEG. CHOFER' },
  { categoria: 'parte_interna', item: 'CINTURON SEG. COPILOTO' },
  { categoria: 'parte_interna', item: 'ESPEJO RETROVISOR' },
  { categoria: 'parte_interna', item: 'ESTEREO' },
  { categoria: 'parte_interna', item: 'AIRE ACONDICIONADO' },

  // Parte externa
  { categoria: 'parte_externa', item: 'ESPEJOS LATERALES' },
  { categoria: 'parte_externa', item: 'PARABRISAS' },
  { categoria: 'parte_externa', item: 'LIMPIA PARABRISAS' },
  { categoria: 'parte_externa', item: 'CHISGUETERO' },
  { categoria: 'parte_externa', item: 'GOLPES EN CARROCERIA' },
  { categoria: 'parte_externa', item: 'FAROS' },
  { categoria: 'parte_externa', item: 'CALAVERAS' },
];

function normalizarFecha(fecha) {
  if (!fecha) return null;
  return String(fecha).slice(0, 10);
}

function normalizarEstadoItem(estado) {
  const value = String(estado || '').toLowerCase().trim();

  if (['bueno', 'regular', 'malo', 'na'].includes(value)) {
    return value;
  }

  if (['ok', 'bien', 'correcto', 'Bueno', 'BUENO', 'Okay', 'okay', 'OKAY'].includes(value)) return 'bueno';
  if (['n/a', 'no_aplica', 'no aplica'].includes(value)) return 'na';
  if (['falla', 'mal', 'malo', 'MAL', 'defectuoso'].includes(value)) return 'malo';

  return 'bueno';
}

function normalizarItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && item.categoria && item.item)
    .map((item) => ({
      categoria: String(item.categoria).trim(),
      item: String(item.item).trim(),
      estado: normalizarEstadoItem(item.estado),
      comentario: item.comentario ? String(item.comentario).trim() : null,
    }));
}

function normalizarTiposFotos(tipos) {
  if (!tipos) return [];

  if (Array.isArray(tipos)) {
    return tipos;
  }

  return [tipos];
}

export async function obtenerCatalogo(req, res) {
  res.json(CATALOGO_ITEMS);
}

// CREAR CHEQUEO
export async function crearChequeo(req, res) {
  const {
    tipo,
    unidad_id,
    chofer_id,
    kilometraje,
    reporta_servicio_preventivo = false,
    detalle_servicio_preventivo,
    observaciones,
    observaciones_unidad,
    items = [],
  } = req.body;

  if (!tipo || !['chofer', 'checador'].includes(tipo)) {
    return res.status(400).json({
      error: 'tipo inválido. Usa chofer o checador',
    });
  }

  if (!unidad_id) {
    return res.status(400).json({
      error: 'unidad_id requerida',
    });
  }

  let choferIdFinal = chofer_id || null;

  // Si el usuario autenticado es chofer, siempre usamos su chofer_id del token.
  // Así evitamos que pueda registrar un check a nombre de otro chofer.
  if (tipo === 'chofer' && req.user.rol === 'chofer') {
    choferIdFinal = req.user.chofer_id || null;
  }

  if (tipo === 'chofer' && !choferIdFinal) {
    return res.status(400).json({
      error: 'No se pudo determinar el chofer del chequeo',
    });
  }

  const itemsNormalizados = normalizarItems(items);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [checkResult] = await connection.execute(
      `INSERT INTO check_unidad
        (
          tipo,
          unidad_id,
          chofer_id,
          usuario_id,
          kilometraje,
          reporta_servicio_preventivo,
          detalle_servicio_preventivo,
          observaciones,
          observaciones_unidad
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tipo,
        unidad_id,
        choferIdFinal,
        req.user.id,
        kilometraje ?? null,
        Boolean(reporta_servicio_preventivo),
        detalle_servicio_preventivo || null,
        observaciones || null,
        observaciones_unidad || null,
      ]
    );

    const checkId = checkResult.insertId;

    if (itemsNormalizados.length > 0) {
      for (const item of itemsNormalizados) {
        await connection.execute(
          `INSERT INTO check_unidad_items
            (
              check_id,
              categoria,
              item,
              estado,
              comentario
            )
           VALUES (?, ?, ?, ?, ?)`,
          [
            checkId,
            item.categoria,
            item.item,
            item.estado,
            item.comentario,
          ]
        );
      }
    }

    // Si el chequeo trae kilometraje, actualizamos la unidad.
    if (kilometraje !== undefined && kilometraje !== null && Number(kilometraje) >= 0) {
      await connection.execute(
        `UPDATE unidades
         SET kilometraje_actual = ?, updated_at = NOW()
         WHERE id = ?`,
        [kilometraje, unidad_id]
      );
    }

    await connection.commit();

    const [rows] = await query(
      `SELECT 
          c.*,
          u.nombre AS unidad_nombre,
          u.placas,
          ch.nombre AS chofer_nombre
       FROM check_unidad c
       LEFT JOIN unidades u ON u.id = c.unidad_id
       LEFT JOIN choferes ch ON ch.id = c.chofer_id
       WHERE c.id = ?
       LIMIT 1`,
      [checkId]
    );

    res.status(201).json({
      ...rows[0],
      items_count: itemsNormalizados.length,
    });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// SUBIR FOTOS
export async function subirFotos(req, res) {
  const { id } = req.params;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: 'Se requiere al menos una foto',
    });
  }

  const [checkRows] = await query(
    `SELECT 
        id,
        fecha,
        tipo,
        chofer_id,
        usuario_id
    FROM check_unidad
    WHERE id = ?
    LIMIT 1`,
    [id]
  );

  if (checkRows.length === 0) {
    return res.status(404).json({
      error: 'Chequeo no encontrado',
    });
  }
  const check = checkRows[0];

  if (req.user.rol === 'chofer') {
    const tokenChoferId = Number(req.user.chofer_id);
    const checkChoferId = Number(check.chofer_id);

    if (!tokenChoferId || tokenChoferId !== checkChoferId) {
      return res.status(403).json({
        error: 'No puedes subir fotos a un chequeo que no es tuyo',
      });
    }
  }

  const tipos = normalizarTiposFotos(req.body.tipos);
  const fechaCheck = check.fecha || new Date().toISOString().slice(0, 10);
  const ym = String(fechaCheck).slice(0, 7);
  const subfolder = `checks/${ym}/${id}`;

  const fotos = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const tipo = tipos[i] || 'incidente';

    const { url, public_id } = await uploadBuffer(file.buffer, subfolder);

    const [result] = await query(
      `INSERT INTO check_unidad_fotos
        (
          check_id,
          tipo,
          url,
          public_id,
          descripcion
        )
       VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        tipo,
        url,
        public_id,
        null,
      ]
    );

    const [fotoRows] = await query(
      `SELECT *
       FROM check_unidad_fotos
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    );

    fotos.push(fotoRows[0]);
  }

  res.status(201).json(fotos);
}

// LISTAR CHEQUEOS
export async function listarChequeos(req, res) {
  const {
    chofer_id,
    unidad_id,
    tipo,
    fecha_desde,
    fecha_hasta,
    limit = 50,
  } = req.query;

  const params = [];
  const cond = [];

  if (chofer_id) {
    cond.push('c.chofer_id = ?');
    params.push(chofer_id);
  }

  if (unidad_id) {
    cond.push('c.unidad_id = ?');
    params.push(unidad_id);
  }

  if (tipo) {
    cond.push('c.tipo = ?');
    params.push(tipo);
  }

  if (fecha_desde) {
    cond.push('c.fecha >= ?');
    params.push(normalizarFecha(fecha_desde));
  }

  if (fecha_hasta) {
    cond.push('c.fecha <= ?');
    params.push(normalizarFecha(fecha_hasta));
  }

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const limite = Math.min(Number(limit) || 50, 500);

  const [rows] = await query(
    `SELECT 
        c.*,
        u.nombre AS unidad_nombre,
        u.placas,
        ch.nombre AS chofer_nombre,
        (
          SELECT COUNT(*)
          FROM check_unidad_fotos f
          WHERE f.check_id = c.id
        ) AS fotos_count
     FROM check_unidad c
     LEFT JOIN unidades u ON u.id = c.unidad_id
     LEFT JOIN choferes ch ON ch.id = c.chofer_id
     ${where}
     ORDER BY c.fecha DESC, c.hora DESC, c.id DESC
     LIMIT ${limite}`,
    params
  );

  res.json(rows);
}

// OBTENER DETALLE
export async function obtenerChequeo(req, res) {
  const { id } = req.params;

  const [[checkRows], [items], [fotos]] = await Promise.all([
    query(
      `SELECT 
          c.*,
          u.nombre AS unidad_nombre,
          u.placas,
          ch.nombre AS chofer_nombre
       FROM check_unidad c
       LEFT JOIN unidades u ON u.id = c.unidad_id
       LEFT JOIN choferes ch ON ch.id = c.chofer_id
       WHERE c.id = ?
       LIMIT 1`,
      [id]
    ),
    query(
      `SELECT *
       FROM check_unidad_items
       WHERE check_id = ?
       ORDER BY categoria ASC, item ASC`,
      [id]
    ),
    query(
      `SELECT *
       FROM check_unidad_fotos
       WHERE check_id = ?
       ORDER BY id ASC`,
      [id]
    ),
  ]);

  if (checkRows.length === 0) {
    return res.status(404).json({
      error: 'Chequeo no encontrado',
    });
  }

  res.json({
    ...checkRows[0],
    items,
    fotos,
  });
}

// ÚLTIMO CHEQUEO DEL CHOFER PARA CHEQUEO ESPEJO
export async function ultimoChequeoChofer(req, res) {
  const { unidad_id, chofer_id } = req.query;

  if (!unidad_id) {
    return res.status(400).json({
      error: 'unidad_id requerido',
    });
  }

  const params = [unidad_id];
  const cond = [
    `c.tipo = 'chofer'`,
    `c.unidad_id = ?`,
  ];

  if (chofer_id) {
    cond.push('c.chofer_id = ?');
    params.push(chofer_id);
  }

  const [checkRows] = await query(
    `SELECT 
        c.*,
        u.nombre AS unidad_nombre,
        u.placas,
        ch.nombre AS chofer_nombre
     FROM check_unidad c
     LEFT JOIN unidades u ON u.id = c.unidad_id
     LEFT JOIN choferes ch ON ch.id = c.chofer_id
     WHERE ${cond.join(' AND ')}
     ORDER BY c.fecha DESC, c.hora DESC, c.id DESC
     LIMIT 1`,
    params
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

//Eliminar chequeo
export async function eliminarChequeo(req, res) {
  const { id } = req.params;

  const [checkRows] = await query(
    `SELECT id
     FROM check_unidad
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (checkRows.length === 0) {
    return res.status(404).json({
      error: 'Chequeo no encontrado',
    });
  }

  const [fotos] = await query(
    `SELECT public_id
     FROM check_unidad_fotos
     WHERE check_id = ?`,
    [id]
  );

  for (const foto of fotos) {
    if (foto.public_id) {
      await deleteImage(foto.public_id);
    }
  }

  const [result] = await query(
    `DELETE FROM check_unidad
     WHERE id = ?`,
    [id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({
      error: 'Chequeo no encontrado',
    });
  }

  res.json({ ok: true });
}
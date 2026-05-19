export function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  if (res.headersSent) return next(err);
  // MySQL: entrada duplicada
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: 'Registro duplicado',
      detalle: err.sqlMessage || err.message,
    });
  }
  // MySQL: llave foránea inválida
  if (
    err.code === 'ER_NO_REFERENCED_ROW_2' ||
    err.code === 'ER_ROW_IS_REFERENCED_2' ||
    err.errno === 1452 ||
    err.errno === 1451
  ) {
    return res.status(400).json({
      error: 'Referencia inválida (FK)',
      detalle: err.sqlMessage || err.message,
    });
  }
  // MySQL: campo requerido faltante
  if (err.code === 'ER_BAD_NULL_ERROR') {
    return res.status(400).json({
      error: 'Campo requerido faltante',
      detalle: err.sqlMessage || err.message,
    });
  }
  // MySQL: valor inválido / dato truncado
  if (err.code === 'WARN_DATA_TRUNCATED' || err.code === 'ER_TRUNCATED_WRONG_VALUE') {
    return res.status(400).json({
      error: 'Valor inválido',
      detalle: err.sqlMessage || err.message,
    });
  }
  // Multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'Archivo demasiado grande (máx 10 MB)',
    });
  }
  if (err.message === 'Solo se permiten imágenes') {
    return res.status(400).json({
      error: 'Solo se permiten imágenes',
    });
  }
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
  });
}
export function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}
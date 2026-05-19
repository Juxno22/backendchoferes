import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';
import { generateToken } from '../middleware/auth.js';

export async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const [rows] = await query(
    `SELECT 
        u.id,
        u.username,
        u.password_hash,
        u.rol,
        u.nombre_completo,
        u.activo,
        c.id AS chofer_id,
        c.foto_url
     FROM usuarios u
     LEFT JOIN choferes c ON c.usuario_id = u.id
     WHERE u.username = ?
     LIMIT 1`,
    [username]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const usuario = rows[0];

  if (!usuario.activo) {
    return res.status(403).json({ error: 'Usuario inactivo' });
  }

  const passwordCorrecta = await bcrypt.compare(password, usuario.password_hash);

  if (!passwordCorrecta) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = generateToken({
    id: usuario.id,
    username: usuario.username,
    rol: usuario.rol,
    chofer_id: usuario.chofer_id || null,
  });

  res.json({
    token,
    usuario: {
      id: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      nombre_completo: usuario.nombre_completo,
      chofer_id: usuario.chofer_id,
      foto_url: usuario.foto_url,
    },
  });
}

export async function me(req, res) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Token inválido: falta id de usuario' });
  }

  const [rows] = await query(
    `SELECT 
        u.id,
        u.username,
        u.rol,
        u.nombre_completo,
        u.activo,
        c.id AS chofer_id,
        c.foto_url,
        c.numero_licencia,
        c.tipo_licencia,
        c.vigencia_licencia,
        c.ruta_asignada_id,
        r.nombre AS ruta_nombre
     FROM usuarios u
     LEFT JOIN choferes c ON c.usuario_id = u.id
     LEFT JOIN rutas r ON r.id = c.ruta_asignada_id
     WHERE u.id = ?
     LIMIT 1`,
    [req.user.id]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json(rows[0]);
}

export async function cambiarPassword(req, res) {
  const { actual, nueva } = req.body;

  if (!req.user?.id) {
    return res.status(401).json({ error: 'Token inválido: falta id de usuario' });
  }

  if (!actual || !nueva || nueva.length < 6) {
    return res.status(400).json({
      error: 'Contraseña actual y nueva requeridas. La nueva debe tener mínimo 6 caracteres',
    });
  }

  const [rows] = await query(
    `SELECT password_hash 
     FROM usuarios 
     WHERE id = ?
     LIMIT 1`,
    [req.user.id]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const passwordCorrecta = await bcrypt.compare(actual, rows[0].password_hash);

  if (!passwordCorrecta) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }

  const hash = await bcrypt.hash(nueva, 10);

  await query(
    `UPDATE usuarios 
     SET password_hash = ?, updated_at = NOW()
     WHERE id = ?`,
    [hash, req.user.id]
  );

  res.json({ ok: true });
}
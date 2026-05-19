import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secreto-dev-cambiar';

/**
 * Verifica token JWT y agrega:
 * req.user = { id, rol, username, chofer_id }
 */
export function authRequired(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Permite acceso solo a los roles indicados.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado para tu rol' });
    }

    next();
  };
}

/**
 * Permite:
 * - roles administrativos indicados
 * - o al chofer dueño del recurso
 *
 * Útil para rutas tipo:
 * /choferes/:id/resumen
 * /incentivos/preview/:chofer_id
 */
export function requireSelfChoferOrRole(paramName = 'id', ...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (roles.includes(req.user.rol)) {
      return next();
    }

    if (req.user.rol === 'chofer') {
      const paramChoferId = Number(req.params[paramName]);
      const tokenChoferId = Number(req.user.chofer_id);

      if (tokenChoferId && paramChoferId === tokenChoferId) {
        return next();
      }
    }

    return res.status(403).json({ error: 'Acceso denegado para este recurso' });
  };
}

/**
 * Permite solo si el usuario es chofer y tiene chofer_id.
 */
export function requireChoferWithProfile(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (req.user.rol !== 'chofer') {
    return res.status(403).json({ error: 'Esta acción es solo para choferes' });
  }

  if (!req.user.chofer_id) {
    return res.status(403).json({
      error: 'Tu usuario no tiene un perfil de chofer vinculado',
    });
  }

  next();
}

export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}
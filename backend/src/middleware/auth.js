const jwt = require('jsonwebtoken');
const { permisosEfectivos } = require('../utils/permisos');

/**
 * Verifica que la petición traiga un token JWT válido en el header:
 * Authorization: Bearer <token>
 * Si es válido, deja la info del usuario en req.user
 */
function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id_usuario, identificador, id_rol, nombre_rol }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Middleware de fábrica flexible: permite variaciones de nombres de roles
 * (Director / Subdirector / Directivo) para evitar bloqueos involuntarios.
 */
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const rolUsuario = req.user.nombre_rol || req.user.rol;

    // Expandir alias de roles (ej. si la ruta pide 'Directivo', acepta 'Director' o 'Subdirector')
    const rolesExpandidos = rolesPermitidos.flatMap(r => {
      if (r === 'Directivo') return ['Director', 'Subdirector', 'Directivo', 'Administrador'];
      return [r];
    });

    // El Administrador siempre tiene acceso global
    if (rolUsuario === 'Administrador' || rolesExpandidos.includes(rolUsuario)) {
      return next();
    }

    return res.status(403).json({ error: 'No tiene permisos para realizar esta acción' });
  };
}

/**
 * Exige que el usuario tenga AL MENOS UNO de los permisos indicados
 * (los del rol + los ajustes individuales). El Administrador siempre pasa.
 */
function requirePermission(...claves) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    try {
      const permisos = await permisosEfectivos(req.user);
      if (claves.some(c => permisos.has(c))) return next();
      return res.status(403).json({ error: 'No tiene permisos para realizar esta acción' });
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Rol ESTRICTO: solo entra quien tenga exactamente uno de estos roles. No hay excepción para el
 * Administrador ni alias de roles. Se usa para el registro de asistencia por QR.
 */
function requireRoleEstricto(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    const rol = req.user.nombre_rol || req.user.rol;
    if (roles.includes(rol)) return next();
    return res.status(403).json({ error: `Solo el personal con rol ${roles.join(' o ')} puede registrar asistencia` });
  };
}

/** Pasa si el usuario tiene alguno de los roles indicados O alguno de los permisos indicados. */
function requireRolOPermiso(roles, permisos) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    try {
      const rol = req.user.nombre_rol || req.user.rol;
      if (roles.includes(rol)) return next();
      const efectivos = await permisosEfectivos(req.user);
      if (permisos.some(p => efectivos.has(p))) return next();
      return res.status(403).json({ error: 'No tiene permisos para realizar esta acción' });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { verifyToken, requireRole, requirePermission, requireRoleEstricto, requireRolOPermiso };
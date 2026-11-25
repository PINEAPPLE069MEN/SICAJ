const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { permisosEfectivos } = require('../utils/permisos');
const { registrarBitacora } = require('../middleware/bitacora');

// Bloqueo temporal en memoria tras 3 intentos fallidos (por identificador)
const intentosFallidos = new Map();
const MAX_INTENTOS = 3;
const BLOQUEO_MS = 5 * 60 * 1000;

function estaBloqueado(identificador) {
  const registro = intentosFallidos.get(identificador);
  if (!registro) return false;
  if (registro.bloqueadoHasta && Date.now() < registro.bloqueadoHasta) return true;
  if (registro.bloqueadoHasta && Date.now() >= registro.bloqueadoHasta) intentosFallidos.delete(identificador);
  return false;
}
function registrarFallo(identificador) {
  const registro = intentosFallidos.get(identificador) || { conteo: 0 };
  registro.conteo += 1;
  if (registro.conteo >= MAX_INTENTOS) registro.bloqueadoHasta = Date.now() + BLOQUEO_MS;
  intentosFallidos.set(identificador, registro);
}
function limpiarFallos(identificador) {
  intentosFallidos.delete(identificador);
}

async function login(req, res) {
  const { identificador, password } = req.body;
  if (!identificador || !password) {
    return res.status(400).json({ error: 'Ingrese su usuario y contraseña' });
  }
  if (estaBloqueado(identificador)) {
    return res.status(429).json({ error: 'Cuenta bloqueada temporalmente, intente más tarde' });
  }

  const [rows] = await pool.query(
    `SELECT u.id_usuario, u.identificador, u.password_hash, u.password_temporal, u.id_rol, r.nombre_rol
     FROM usuario u
     JOIN rol r ON r.id_rol = u.id_rol
     WHERE u.identificador = ?`,
    [identificador]
  );

  // Mensaje genérico a propósito: no revelar si el usuario existe o no.
  if (rows.length === 0) {
    registrarFallo(identificador);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  const usuario = rows[0];
  const passwordOk = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordOk) {
    registrarFallo(identificador);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  limpiarFallos(identificador);

  // Trae el nombre para mostrar en el sidebar, según a qué tabla de detalle pertenezca
  let perfil = null;
  if (['Administrador', 'Director', 'Subdirector', 'Docente', 'Administrativo'].includes(usuario.nombre_rol)) {
    const [p] = await pool.query(
      'SELECT id_personal, nombres, apellido_paterno FROM personal WHERE id_usuario = ?',
      [usuario.id_usuario]
    );
    perfil = p[0] || null;
  } else if (usuario.nombre_rol === 'Alumno') {
    const [a] = await pool.query(
      'SELECT id_alumno, nombres, apellido_paterno, numero_control FROM alumno WHERE id_usuario = ?',
      [usuario.id_usuario]
    );
    perfil = a[0] || null;
  } else if (usuario.nombre_rol === 'Padre_Tutor') {
    const [pt] = await pool.query(
      'SELECT id_padre, nombres, apellido_paterno FROM padre_tutor WHERE id_usuario = ?',
      [usuario.id_usuario]
    );
    perfil = pt[0] || null;
  }

  const token = jwt.sign(
    {
      id_usuario: usuario.id_usuario,
      identificador: usuario.identificador,
      id_rol: usuario.id_rol,
      nombre_rol: usuario.nombre_rol,
      id_personal: perfil && perfil.id_personal ? perfil.id_personal : null
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  await registrarBitacora(usuario.id_usuario, 'LOGIN', `Inicio de sesión de ${usuario.identificador}`);

  res.json({
    token,
    usuario: {
      id_usuario: usuario.id_usuario,
      identificador: usuario.identificador,
      rol: usuario.nombre_rol,
      password_temporal: !!usuario.password_temporal,
      id_personal: perfil && perfil.id_personal ? perfil.id_personal : null,
      permisos: [...await permisosEfectivos(usuario)],
      perfil
    }
  });
}

async function me(req, res) {
  const permisos = [...await permisosEfectivos(req.user)];
  res.json({ usuario: { ...req.user, rol: req.user.nombre_rol, permisos } });
}

async function cambiarPassword(req, res) {
  const password_actual = req.body.password_actual || req.body.passwordActual;
  const password_nueva = req.body.password_nueva || req.body.password_nuevo || req.body.nuevaPassword;
  const password_confirmar = req.body.password_confirmar || req.body.confirmarPassword || password_nueva;

  if (!password_actual || !password_nueva || !password_confirmar) {
    return res.status(400).json({ error: 'Ingrese su contraseña actual correctamente y la nueva contraseña' });
  }
  if (password_confirmar !== password_nueva) {
    return res.status(400).json({ error: 'Las contraseñas no coinciden' });
  }
  if (password_nueva.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const [rows] = await pool.query('SELECT password_hash FROM usuario WHERE id_usuario = ?', [req.user.id_usuario]);
  if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

  const passwordOk = await bcrypt.compare(password_actual, rows[0].password_hash);
  if (!passwordOk) return res.status(401).json({ error: 'Ingrese su contraseña actual correctamente' });

  const nuevoHash = await bcrypt.hash(password_nueva, 10);
  await pool.query(
    'UPDATE usuario SET password_hash = ?, password_temporal = 0 WHERE id_usuario = ?',
    [nuevoHash, req.user.id_usuario]
  );

  await registrarBitacora(req.user.id_usuario, 'CAMBIO_PASSWORD', 'El usuario cambió su contraseña');
  res.json({ mensaje: 'Contraseña actualizada correctamente' });
}

module.exports = { login, me, cambiarPassword, limpiarFallos };

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { enviarCorreo } = require('../utils/correo');
const { validarCorreo } = require('../utils/validators');
const { registrarBitacora } = require('../middleware/bitacora');
const { limpiarFallos } = require('./authController');

/**
 * Recuperación de contraseña con código de 6 dígitos enviado por correo.
 *  - El código vale 15 minutos, se guarda cifrado (HMAC) y solo sirve una vez.
 *  - Máximo 5 intentos por código y 3 códigos por usuario cada hora.
 *  - Las respuestas NO revelan si el usuario o el correo existen.
 *  - Personal / Padre-Tutor: el código va a su correo registrado. Alumno: al correo de su tutor.
 */
const VIGENCIA_MIN = 15;
const MAX_INTENTOS_CODIGO = 5;
const MAX_CODIGOS_HORA = 3;
const MSG_GENERICO = `Si los datos coinciden con un usuario registrado, te enviamos un código de 6 dígitos al correo. Revisa tu bandeja (y spam). Vale ${VIGENCIA_MIN} minutos.`;
const MSG_CODIGO_MAL = 'El código no es válido o ya venció. Solicita uno nuevo.';

// Límite por IP (en memoria): 30 peticiones cada 15 minutos entre ambas rutas (la escuela suele compartir una sola IP; la protección fuerte es por usuario y por código)
const porIp = new Map();
function limitePorIp(ip) {
  const ahora = Date.now();
  const lista = (porIp.get(ip) || []).filter(t => ahora - t < 15 * 60 * 1000);
  lista.push(ahora);
  porIp.set(ip, lista);
  return lista.length > 30;
}

async function asegurarEsquemaRecuperacion() {
  await pool.query(`CREATE TABLE IF NOT EXISTS recuperacion_password (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    codigo_hash CHAR(64) NOT NULL,
    expira_en DATETIME NOT NULL,
    intentos TINYINT NOT NULL DEFAULT 0,
    usado TINYINT(1) NOT NULL DEFAULT 0,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_recuperacion_usuario (id_usuario, usado),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
  )`);
}

const hashCodigo = (idUsuario, codigo) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET || 'sice').update(`${idUsuario}:${codigo}`).digest('hex');

async function buscarUsuario(identificador) {
  const [rows] = await pool.query(
    `SELECT u.id_usuario, u.identificador, r.nombre_rol FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.identificador = ?`,
    [identificador]
  );
  return rows[0] || null;
}

/** Correos válidos para recuperar la cuenta de este usuario. */
async function correosDe(usuario) {
  let rows;
  if (usuario.nombre_rol === 'Padre_Tutor') {
    [rows] = await pool.query('SELECT correo_electronico AS c FROM padre_tutor WHERE id_usuario = ?', [usuario.id_usuario]);
  } else if (usuario.nombre_rol === 'Alumno') {
    [rows] = await pool.query(
      `SELECT pt.correo_electronico AS c FROM alumno a
       JOIN alumno_padre ap ON ap.id_alumno = a.id_alumno
       JOIN padre_tutor pt ON pt.id_padre = ap.id_padre WHERE a.id_usuario = ?`, [usuario.id_usuario]);
  } else {
    [rows] = await pool.query('SELECT correo_electronico AS c FROM personal WHERE id_usuario = ?', [usuario.id_usuario]);
  }
  return rows.map(r => String(r.c || '').trim().toLowerCase()).filter(Boolean);
}

/** POST /api/auth/recuperar/solicitar  { identificador, correo } */
async function solicitar(req, res) {
  if (limitePorIp(req.ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' });
  const identificador = String(req.body.identificador || '').trim();
  const correo = String(req.body.correo || '').trim().toLowerCase();
  if (!identificador || !correo || identificador.length > 20) {
    return res.status(400).json({ error: 'Escribe tu usuario y el correo electrónico registrado.' });
  }
  if (!validarCorreo(correo)) return res.status(400).json({ error: 'El correo electrónico no tiene un formato válido.' });

  const usuario = await buscarUsuario(identificador);
  if (!usuario || !(await correosDe(usuario)).includes(correo)) return res.json({ mensaje: MSG_GENERICO });

  const [[{ recientes }]] = await pool.query(
    'SELECT COUNT(*) AS recientes FROM recuperacion_password WHERE id_usuario = ? AND creado_en > DATE_SUB(NOW(), INTERVAL 1 HOUR)',
    [usuario.id_usuario]);
  if (recientes >= MAX_CODIGOS_HORA) return res.json({ mensaje: MSG_GENERICO });

  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await pool.query('UPDATE recuperacion_password SET usado = 1 WHERE id_usuario = ? AND usado = 0', [usuario.id_usuario]);
  await pool.query(
    'INSERT INTO recuperacion_password (id_usuario, codigo_hash, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
    [usuario.id_usuario, hashCodigo(usuario.id_usuario, codigo), VIGENCIA_MIN]
  );

  try {
    await enviarCorreo({
      para: correo,
      asunto: 'SICAJ - Código para recuperar tu contraseña',
      texto: `Escuela Secundaria Técnica Núm. 9 - SICAJ\n\nTu código de recuperación es: ${codigo}\n\nVale ${VIGENCIA_MIN} minutos y solo se puede usar una vez.\nSi tú no lo solicitaste, ignora este mensaje: tu contraseña no cambiará.`
    });
  } catch (err) {
    console.error('No se pudo enviar el correo de recuperación:', err.message);
  }
  await registrarBitacora(usuario.id_usuario, 'RECUPERACION_SOLICITADA', 'Solicitó un código de recuperación de contraseña');
  res.json({ mensaje: MSG_GENERICO });
}

/** POST /api/auth/recuperar/confirmar  { identificador, codigo, password } */
async function confirmar(req, res) {
  if (limitePorIp(req.ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' });
  const identificador = String(req.body.identificador || '').trim();
  const codigo = String(req.body.codigo || '').trim();
  const password = String(req.body.password || '');
  if (!identificador || !/^\d{6}$/.test(codigo)) return res.status(400).json({ error: MSG_CODIGO_MAL });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  if (password.length > 100) return res.status(400).json({ error: 'La contraseña es demasiado larga' });

  const usuario = await buscarUsuario(identificador);
  if (!usuario) return res.status(400).json({ error: MSG_CODIGO_MAL });

  const [rows] = await pool.query(
    `SELECT id, codigo_hash, intentos FROM recuperacion_password
     WHERE id_usuario = ? AND usado = 0 AND expira_en > NOW() ORDER BY id DESC LIMIT 1`, [usuario.id_usuario]);
  if (rows.length === 0) return res.status(400).json({ error: MSG_CODIGO_MAL });

  const esperado = Buffer.from(rows[0].codigo_hash, 'hex');
  const recibido = Buffer.from(hashCodigo(usuario.id_usuario, codigo), 'hex');
  if (esperado.length !== recibido.length || !crypto.timingSafeEqual(esperado, recibido)) {
    const intentos = rows[0].intentos + 1;
    await pool.query('UPDATE recuperacion_password SET intentos = ?, usado = ? WHERE id = ?',
      [intentos, intentos >= MAX_INTENTOS_CODIGO ? 1 : 0, rows[0].id]);
    return res.status(400).json({ error: MSG_CODIGO_MAL });
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE usuario SET password_hash = ?, password_temporal = 0 WHERE id_usuario = ?', [hash, usuario.id_usuario]);
  await pool.query('UPDATE recuperacion_password SET usado = 1 WHERE id_usuario = ?', [usuario.id_usuario]);
  limpiarFallos(identificador);
  await registrarBitacora(usuario.id_usuario, 'RECUPERACION_PASSWORD', 'Restableció su contraseña con un código enviado al correo');
  res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión con tu contraseña nueva.' });
}

module.exports = { solicitar, confirmar, asegurarEsquemaRecuperacion };

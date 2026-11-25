const crypto = require('crypto');
const EventEmitter = require('events');
const pool = require('../config/db');

/**
 * Gestión del código QR del monitor.
 *  - Siempre hay UN solo token activo (vigente, sin usar).
 *  - Un token solo sirve una vez: al registrarse una asistencia se invalida y se crea otro al instante.
 *  - Si nadie lo usa, expira solo (QR_VIGENCIA_SEG, 60 s por defecto) y se genera uno nuevo.
 * El estado vive en la tabla qr_tokens_activos (sobrevive reinicios); el aviso en tiempo real
 * (SSE) usa un EventEmitter en memoria.
 */
const VIGENCIA_SEG = Number(process.env.QR_VIGENCIA_SEG) || 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const emisor = new EventEmitter();
emisor.setMaxListeners(0);

let temporizador = null;
let creando = null; // evita crear dos tokens a la vez dentro del mismo proceso

async function asegurarEsquemaQR() {
  await pool.query(`CREATE TABLE IF NOT EXISTS qr_tokens_activos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token CHAR(36) NOT NULL UNIQUE,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en DATETIME NOT NULL,
    usado TINYINT(1) NOT NULL DEFAULT 0,
    usado_por INT NULL,
    usado_en DATETIME NULL,
    INDEX idx_qr_estado (usado, expira_en)
  )`);

  const existe = async (tabla, columna) => {
    const [r] = await pool.query(
      `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [tabla, columna]);
    return r[0] || null;
  };

  // Talleres de los alumnos: el código de alumnos y materias ya los usa (el esquema original no los traía)
  await pool.query(`CREATE TABLE IF NOT EXISTS alumno_talleres (
    id_alumno INT NOT NULL,
    id_materia INT NOT NULL,
    PRIMARY KEY (id_alumno, id_materia),
    FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno) ON DELETE CASCADE,
    FOREIGN KEY (id_materia) REFERENCES materia(id_materia) ON DELETE CASCADE
  )`);
  if (!await existe('materia', 'es_taller')) {
    await pool.query('ALTER TABLE materia ADD COLUMN es_taller TINYINT(1) NOT NULL DEFAULT 0');
  }

  // Resultado de la salida (solo si falta)
  if (!await existe('asistencia_docente', 'estatus_salida')) {
    await pool.query("ALTER TABLE asistencia_docente ADD COLUMN estatus_salida ENUM('CUMPLIDA','ANTICIPADA') NULL");
  }
  // Una jornada administrativa no tiene materia ni grupo
  for (const col of ['id_materia', 'id_grupo']) {
    const c = await existe('horario_clase', col);
    if (c && c.IS_NULLABLE === 'NO') await pool.query(`ALTER TABLE horario_clase MODIFY ${col} INT NULL`);
  }
  // Desde cuándo existe cada horario: evita contar inasistencias de días anteriores a que se asignara
  if (!await existe('horario_clase', 'fecha_creacion')) {
    await pool.query('ALTER TABLE horario_clase ADD COLUMN fecha_creacion TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP');
    // Los horarios que ya existían se consideran vigentes desde que se dio de alta a la persona
    await pool.query(
      `UPDATE horario_clase h JOIN personal p ON p.id_personal = h.id_docente
       JOIN usuario u ON u.id_usuario = p.id_usuario SET h.fecha_creacion = u.fecha_creacion`);
  }
}

function programarExpiracion(restanteSeg) {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    rotar({ motivo: 'expiracion' }).catch(err => console.error('QR: no se pudo rotar el token:', err.message));
  }, Math.max(1, restanteSeg) * 1000 + 100);
  temporizador.unref?.();
}

/** Marca como usados todos los tokens activos y crea uno nuevo. Acepta una conexión para usarlo en una transacción. */
async function crearToken(conn = pool) {
  const token = crypto.randomUUID();
  await conn.query('UPDATE qr_tokens_activos SET usado = 1 WHERE usado = 0');
  await conn.query(
    'INSERT INTO qr_tokens_activos (token, expira_en) VALUES (?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
    [token, VIGENCIA_SEG]
  );
  return { token, restante_seg: VIGENCIA_SEG };
}

/** Publica el token nuevo a los monitores conectados y programa su expiración. */
function publicar(nuevo, extra = {}) {
  programarExpiracion(nuevo.restante_seg);
  emisor.emit('cambio', { token: nuevo.token, restante_seg: nuevo.restante_seg, vigencia_seg: VIGENCIA_SEG, ...extra });
}

async function rotar(extra = {}) {
  const nuevo = await crearToken();
  pool.query('DELETE FROM qr_tokens_activos WHERE creado_en < DATE_SUB(NOW(), INTERVAL 2 DAY)').catch(() => {});
  publicar(nuevo, extra);
  return nuevo;
}

/** Token activo actual; si no existe o ya expiró, genera uno nuevo. */
async function tokenActual() {
  const [rows] = await pool.query(
    `SELECT token, TIMESTAMPDIFF(SECOND, NOW(), expira_en) AS restante_seg
     FROM qr_tokens_activos WHERE usado = 0 AND expira_en > NOW() ORDER BY id DESC LIMIT 1`
  );
  if (rows.length > 0) {
    if (!temporizador) programarExpiracion(rows[0].restante_seg);
    return { token: rows[0].token, restante_seg: Math.max(0, Number(rows[0].restante_seg)), vigencia_seg: VIGENCIA_SEG };
  }
  if (!creando) {
    creando = rotar({ motivo: 'nuevo' }).finally(() => { creando = null; });
  }
  const nuevo = await creando;
  return { token: nuevo.token, restante_seg: nuevo.restante_seg, vigencia_seg: VIGENCIA_SEG };
}

/** Revisa un token SIN quemarlo. Devuelve { ok:true } o { ok:false, codigo, mensaje }. */
async function revisarToken(token) {
  if (!UUID.test(String(token || ''))) {
    return { ok: false, codigo: 'MALFORMADO', mensaje: 'El código QR no es válido. Escanea el código del monitor de la escuela.' };
  }
  const [rows] = await pool.query(
    'SELECT usado, expira_en > NOW() AS vigente FROM qr_tokens_activos WHERE token = ?', [token]);
  if (rows.length === 0) {
    return { ok: false, codigo: 'DESCONOCIDO', mensaje: 'El código QR no es válido. Escanea el código actual del monitor de la escuela.' };
  }
  if (rows[0].usado) {
    return { ok: false, codigo: 'USADO', mensaje: 'Este código QR ya fue utilizado o cambió. Escanea el nuevo código QR del monitor.' };
  }
  if (!rows[0].vigente) {
    return { ok: false, codigo: 'EXPIRADO', mensaje: 'Este código QR expiró. Escanea el nuevo código QR del monitor.' };
  }
  return { ok: true };
}

module.exports = {
  VIGENCIA_SEG, emisor, asegurarEsquemaQR, crearToken, publicar, rotar, tokenActual, revisarToken
};

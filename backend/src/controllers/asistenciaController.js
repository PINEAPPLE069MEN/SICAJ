const pool = require('../config/db');
const qr = require('../utils/qr');
const { fechaLocal } = require('../utils/fechas');
const { suspensionActiva } = require('../utils/suspensiones');
const { TOLERANCIA_MIN, DIAS, aMinutos, hhmm, sumarDias, calcularIncidencias, idPersonalDe } = require('../utils/incidencias');
const { registrarBitacora } = require('../middleware/bitacora');

const MIN_ENTRE_REGISTROS = 5;      // minutos mínimos entre la entrada y la salida
const ROLES_PERSONAL = ['Docente', 'Administrativo'];
const dos = n => String(n).padStart(2, '0');

/* ───────────── MONITOR (Administrador / quien tenga asistencia.monitor) ───────────── */

/** GET /api/asistencia/qr-monitor → token activo actual (o uno nuevo si no existe o expiró) */
async function monitor(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await qr.tokenActual());
}

/** GET /api/asistencia/qr-monitor/stream → Server-Sent Events: avisa al instante cuando cambia el token */
async function streamMonitor(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const enviar = (evento, datos) => res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
  const alCambiar = datos => enviar('cambio', datos);
  qr.emisor.on('cambio', alCambiar);
  const latido = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(latido); qr.emisor.off('cambio', alCambiar); });
  try {
    enviar('estado', await qr.tokenActual());
  } catch (err) {
    enviar('error', { error: 'No se pudo obtener el código QR' });
  }
}

/* ───────────── REGISTRO DE ASISTENCIA (solo Docente y Administrativo) ───────────── */

/**
 * POST /api/asistencia/registrar-qr   (JSON: { token })
 * Ninguna validación que rechaza "quema" el token: solo se invalida cuando la asistencia realmente se guarda.
 */
async function registrarQR(req, res) {
  const token = String((req.body && req.body.token) || '').trim();
  if (!token) return res.status(400).json({ error: 'Falta el código QR escaneado' });

  const idPersonal = await idPersonalDe(req.user);
  const [personalRows] = idPersonal
    ? await pool.query('SELECT id_personal, nombres, apellido_paterno FROM personal WHERE id_personal = ? AND id_usuario = ?', [idPersonal, req.user.id_usuario])
    : [[]];
  if (personalRows.length === 0) {
    return res.status(403).json({ error: 'Tu usuario no tiene ficha de personal. Habla con el administrador.' });
  }
  const persona = personalRows[0];
  const nombre = `${persona.nombres} ${persona.apellido_paterno}`;

  const ahora = new Date();
  const fecha = fechaLocal(ahora);
  const horaActual = `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}:${dos(ahora.getSeconds())}`;
  const diaSemana = DIAS[ahora.getDay()];

  // a) El token debe ser exactamente el activo (sin usar y sin expirar)
  const revision = await qr.revisarToken(token);
  if (!revision.ok) return res.status(409).json({ error: revision.mensaje, codigo: revision.codigo });

  // Días de suspensión de clases: no hay registro
  const suspension = await suspensionActiva(fecha);
  if (suspension) {
    return res.status(409).json({ error: `Hoy no hay clases (${suspension.motivo}). No se registra asistencia.`, codigo: 'SUSPENSION' });
  }

  // c) y d) Jornada del día: primera hora de inicio y última hora de fin
  const [jornada] = await pool.query(
    `SELECT MIN(hora_inicio) AS primera, MAX(hora_fin) AS ultima,
            SUBSTRING_INDEX(GROUP_CONCAT(id_horario ORDER BY hora_inicio), ',', 1) AS id_horario
     FROM horario_clase WHERE id_docente = ? AND dia_semana = ?`,
    [persona.id_personal, diaSemana]
  );
  if (!jornada[0].primera) {
    const finDeSemana = ['Sábado', 'Domingo'].includes(diaSemana);
    return res.status(422).json({
      error: finDeSemana
        ? `Hoy es ${diaSemana.toLowerCase()}: el registro de asistencia es de lunes a viernes.`
        : `No tienes horario asignado para hoy (${diaSemana}). Habla con el administrador para que lo registre.`,
      codigo: 'SIN_HORARIO'
    });
  }
  const { primera, ultima, id_horario } = jornada[0];

  const [previas] = await pool.query(
    'SELECT * FROM asistencia_docente WHERE id_docente = ? AND fecha = ? ORDER BY id_asistencia LIMIT 1',
    [persona.id_personal, fecha]
  );
  const previa = previas[0];

  let tipo;
  if (!previa) {
    tipo = 'ENTRADA';
    if (aMinutos(horaActual) > aMinutos(ultima)) {
      return res.status(409).json({ error: `Tu jornada de hoy terminó a las ${hhmm(ultima)} y no tienes entrada registrada. Habla con el administrador.`, codigo: 'JORNADA_TERMINADA' });
    }
  } else if (previa.hora_salida) {
    return res.status(409).json({ error: 'Ya registraste tu entrada y tu salida el día de hoy.', codigo: 'YA_COMPLETO' });
  } else {
    tipo = 'SALIDA';
    const pasados = aMinutos(horaActual) - aMinutos(previa.hora_entrada);
    if (pasados < MIN_ENTRE_REGISTROS) {
      const faltan = Math.ceil(MIN_ENTRE_REGISTROS - pasados);
      return res.status(409).json({ error: `Registraste tu entrada hace unos instantes. Espera ${faltan} minuto(s) para registrar la salida.`, codigo: 'MUY_PRONTO' });
    }
  }

  // e) y f) Evaluación
  let estatus = null, estatusSalida = null, minutosTarde = 0;
  if (tipo === 'ENTRADA') {
    minutosTarde = Math.max(0, Math.round(aMinutos(horaActual) - aMinutos(primera)));
    estatus = minutosTarde <= TOLERANCIA_MIN ? 'PUNTUAL' : 'RETARDO';
  } else {
    estatusSalida = aMinutos(horaActual) >= aMinutos(ultima) ? 'CUMPLIDA' : 'ANTICIPADA';
  }

  // b) Quemar el token + guardar la asistencia + crear el token nuevo, todo en una sola transacción
  const conn = await pool.getConnection();
  let nuevo, idAsistencia;
  try {
    await conn.beginTransaction();
    const [quemado] = await conn.query(
      'UPDATE qr_tokens_activos SET usado = 1, usado_por = ?, usado_en = NOW() WHERE token = ? AND usado = 0 AND expira_en > NOW()',
      [req.user.id_usuario, token]
    );
    if (quemado.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Otra persona usó este código QR justo antes que tú. Escanea el nuevo código QR del monitor.', codigo: 'USADO' });
    }
    if (tipo === 'ENTRADA') {
      const [r] = await conn.query(
        `INSERT INTO asistencia_docente (id_docente, fecha, hora_entrada, id_horario_referencia, estatus)
         VALUES (?, ?, ?, ?, ?)`,
        [persona.id_personal, fecha, horaActual, id_horario, estatus]
      );
      idAsistencia = r.insertId;
    } else {
      await conn.query(
        'UPDATE asistencia_docente SET hora_salida = ?, estatus_salida = ? WHERE id_asistencia = ?',
        [horaActual, estatusSalida, previa.id_asistencia]
      );
      idAsistencia = previa.id_asistencia;
    }
    nuevo = await qr.crearToken(conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }

  // El monitor cambia al instante
  qr.publicar(nuevo, { motivo: 'registro', ultimo: { nombre, tipo, hora: hhmm(horaActual) } });
  await registrarBitacora(req.user.id_usuario, `ASISTENCIA_${tipo}_QR`, `${tipo} por QR a las ${horaActual}`);

  res.status(201).json({
    folio: idAsistencia,
    tipo,
    nombre,
    fecha,
    hora: horaActual,
    estatus,
    estatus_texto: tipo === 'ENTRADA' ? (estatus === 'PUNTUAL' ? 'A tiempo' : 'Retardo') : (estatusSalida === 'CUMPLIDA' ? 'Jornada cumplida' : 'Salida anticipada'),
    estatus_salida: estatusSalida,
    minutos_tarde: minutosTarde,
    jornada: { inicio: hhmm(primera), fin: hhmm(ultima) },
    mensaje: tipo === 'ENTRADA'
      ? (estatus === 'PUNTUAL' ? 'Entrada registrada: llegaste a tiempo.' : `Entrada registrada con retardo (${minutosTarde} min después de tu primera hora).`)
      : (estatusSalida === 'CUMPLIDA' ? 'Salida registrada: cumpliste tu jornada.' : `Salida registrada antes de tu última hora (${hhmm(ultima)}).`)
  });
}

/* ───────────── HISTORIAL (asistencias, retardos e inasistencias) ───────────── */

/**
 * GET /api/asistencia?dias=30
 * Incluye las inasistencias calculadas automáticamente (jornada programada sin escaneo de QR).
 * El personal (Docente/Administrativo) solo ve lo suyo: se filtra SIEMPRE por el id_personal del token JWT,
 * ignorando cualquier parámetro que mande el cliente.
 */
async function listar(req, res) {
  const dias = Math.min(366, Math.max(1, parseInt(req.query.dias, 10) || 30));
  const hoy = fechaLocal();
  let idPersonal = null;
  if (ROLES_PERSONAL.includes(req.user.nombre_rol)) {
    idPersonal = await idPersonalDe(req.user);
    if (!idPersonal) return res.json([]);
  }
  const items = await calcularIncidencias({ desde: sumarDias(hoy, -(dias - 1)), hasta: hoy, idPersonal });
  items.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.persona.localeCompare(b.persona)));
  res.json(items.slice(0, 1000).map(({ grupos, ...resto }) => resto));
}

module.exports = { monitor, streamMonitor, registrarQR, listar };

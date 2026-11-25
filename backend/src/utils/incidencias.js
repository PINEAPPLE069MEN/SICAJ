const pool = require('../config/db');
const { fechaLocal } = require('./fechas');

/**
 * Motor de asistencias / retardos / inasistencias del personal.
 *
 * Cruza lo PROGRAMADO (horario_clase: primera hora y última hora de cada día) contra lo REGISTRADO
 * (asistencia_docente, que se llena al escanear el QR) y calcula el estatus de cada día:
 *
 *   ASISTENCIA    escaneó dentro de la tolerancia (15 min después de su primera hora)
 *   RETARDO       escaneó fuera de la tolerancia
 *   INASISTENCIA  tenía jornada y NO escaneó:
 *                   - en días anteriores: siempre
 *                   - hoy: en cuanto pasa la tolerancia de su primera hora, o termina su jornada
 *                     (si escanea después, el día pasa de INASISTENCIA a RETARDO)
 *   PENDIENTE     hoy, la jornada ya empezó pero aún está dentro de la tolerancia (no cuenta)
 *
 * No cuentan: días de suspensión de clases, fines de semana (no hay horario), días futuros, ni días
 * anteriores a que existiera el horario del docente.
 */
const TOLERANCIA_MIN = 15;
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const aMinutos = h => {
  const [a, b, c] = String(h).split(':').map(Number);
  return a * 60 + b + (c || 0) / 60;
};
const hhmm = h => (h ? String(h).slice(0, 5) : null);

function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + n);
  return fechaLocal(d);
}
/** Lunes de la semana que contiene la fecha (YYYY-MM-DD). */
function lunesDe(fecha) {
  const dow = new Date(`${fecha}T12:00:00`).getDay();
  return sumarDias(fecha, -((dow + 6) % 7));
}
function diaDe(fecha) {
  return DIAS[new Date(`${fecha}T12:00:00`).getDay()];
}

async function calcularIncidencias({ desde, hasta, idPersonal = null, roles = null, conGrupos = false, ahora = new Date() }) {
  const hoy = fechaLocal(ahora);
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes() + ahora.getSeconds() / 60;
  const hastaEf = hasta > hoy ? hoy : hasta;
  if (desde > hastaEf) return [];

  const filtros = [];
  const params = [];
  if (idPersonal) { filtros.push('h.id_docente = ?'); params.push(idPersonal); }
  if (roles && roles.length) { filtros.push(`r.nombre_rol IN (${roles.map(() => '?').join(',')})`); params.push(...roles); }
  const donde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  // 1) Jornada programada por persona y día de la semana
  const consultaJornadas = columnaCreada => pool.query(
    `SELECT h.id_docente, h.dia_semana, MIN(h.hora_inicio) AS primera, MAX(h.hora_fin) AS ultima,
            ${columnaCreada} AS creada, p.nombres, p.apellido_paterno, r.nombre_rol
     FROM horario_clase h
     JOIN personal p ON p.id_personal = h.id_docente
     JOIN usuario u ON u.id_usuario = p.id_usuario
     JOIN rol r ON r.id_rol = u.id_rol
     ${donde}
     GROUP BY h.id_docente, h.dia_semana, p.nombres, p.apellido_paterno, r.nombre_rol`, params);
  let jornadas;
  try {
    [jornadas] = await consultaJornadas("DATE_FORMAT(MIN(h.fecha_creacion), '%Y-%m-%d %H:%i:%s')");
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    [jornadas] = await consultaJornadas('NULL');
  }

  // 2) Lo que sí se registró con el QR
  const filtrosReg = ['ad.fecha BETWEEN ? AND ?'];
  const paramsReg = [desde, hastaEf];
  if (idPersonal) { filtrosReg.push('ad.id_docente = ?'); paramsReg.push(idPersonal); }
  if (roles && roles.length) { filtrosReg.push(`r.nombre_rol IN (${roles.map(() => '?').join(',')})`); paramsReg.push(...roles); }
  const [registros] = await pool.query(
    `SELECT ad.*, DATE_FORMAT(ad.fecha, '%Y-%m-%d') AS fecha_txt, p.nombres, p.apellido_paterno, r.nombre_rol
     FROM asistencia_docente ad
     JOIN personal p ON p.id_personal = ad.id_docente
     JOIN usuario u ON u.id_usuario = p.id_usuario
     JOIN rol r ON r.id_rol = u.id_rol
     WHERE ${filtrosReg.join(' AND ')}`, paramsReg);

  // 3) Días de suspensión de clases
  let suspensiones = [];
  try {
    [suspensiones] = await pool.query(
      `SELECT DATE_FORMAT(fecha_inicio, '%Y-%m-%d') AS ini, DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fin
       FROM suspension_clases WHERE fecha_inicio <= ? AND fecha_fin >= ?`, [hastaEf, desde]);
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  const hayRecesoEl = f => suspensiones.some(s => f >= s.ini && f <= s.fin);

  // 4) Grupos que atiende cada persona cada día (solo para el reporte por grupo)
  const gruposPorDia = new Map();
  if (conGrupos) {
    const [gs] = await pool.query('SELECT DISTINCT id_docente, dia_semana, id_grupo FROM horario_clase WHERE id_grupo IS NOT NULL');
    gs.forEach(g => {
      const k = `${g.id_docente}|${g.dia_semana}`;
      if (!gruposPorDia.has(k)) gruposPorDia.set(k, []);
      gruposPorDia.get(k).push(g.id_grupo);
    });
  }

  const porClave = new Map(registros.map(r => [`${r.id_docente}|${r.fecha_txt}`, r]));
  const usados = new Set();
  const items = [];

  const traducir = reg => (reg.estatus === 'PUNTUAL' ? 'ASISTENCIA' : reg.estatus === 'RETARDO' ? 'RETARDO' : 'INASISTENCIA');

  for (let fecha = desde; fecha <= hastaEf; fecha = sumarDias(fecha, 1)) {
    const dia = diaDe(fecha);
    for (const j of jornadas) {
      if (j.dia_semana !== dia) continue;
      const clave = `${j.id_docente}|${fecha}`;
      const reg = porClave.get(clave);
      let estatus;

      if (reg) {
        usados.add(clave);
        estatus = traducir(reg);
      } else {
        if (hayRecesoEl(fecha)) continue;
        // Aún no existía su horario ese día (o se asignó ya iniciada la jornada)
        if (j.creada) {
          const [diaCreada, horaCreada] = j.creada.split(' ');
          if (fecha < diaCreada) continue;
          if (fecha === diaCreada && aMinutos(horaCreada) > aMinutos(j.primera)) continue;
        }
        if (fecha < hoy) {
          estatus = 'INASISTENCIA';
        } else {
          const limite = aMinutos(j.primera) + TOLERANCIA_MIN;
          if (minAhora > limite || minAhora > aMinutos(j.ultima)) estatus = 'INASISTENCIA';
          else if (minAhora >= aMinutos(j.primera)) estatus = 'PENDIENTE';
          else continue; // la jornada de hoy todavía no empieza
        }
      }

      items.push({
        id_personal: j.id_docente,
        persona: `${j.nombres} ${j.apellido_paterno}`,
        nombre_rol: j.nombre_rol,
        fecha,
        dia,
        estatus,
        automatica: !reg,
        id_asistencia: reg ? reg.id_asistencia : null,
        hora_entrada: reg ? reg.hora_entrada : null,
        hora_salida: reg ? reg.hora_salida : null,
        estatus_salida: reg ? (reg.estatus_salida || null) : null,
        jornada: { inicio: hhmm(j.primera), fin: hhmm(j.ultima) },
        grupos: gruposPorDia.get(`${j.id_docente}|${dia}`) || []
      });
    }
  }

  // Registros que no coinciden con ninguna jornada (p. ej. se borró el horario después): se conservan
  registros.forEach(reg => {
    if (usados.has(`${reg.id_docente}|${reg.fecha_txt}`)) return;
    items.push({
      id_personal: reg.id_docente,
      persona: `${reg.nombres} ${reg.apellido_paterno}`,
      nombre_rol: reg.nombre_rol,
      fecha: reg.fecha_txt,
      dia: diaDe(reg.fecha_txt),
      estatus: traducir(reg),
      automatica: false,
      id_asistencia: reg.id_asistencia,
      hora_entrada: reg.hora_entrada,
      hora_salida: reg.hora_salida,
      estatus_salida: reg.estatus_salida || null,
      jornada: null,
      grupos: []
    });
  });

  items.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.persona.localeCompare(b.persona)));
  return items;
}

/** Cuenta asistencias, retardos e inasistencias (PENDIENTE no cuenta). */
function contar(items) {
  return items.reduce((acc, i) => {
    if (i.estatus === 'ASISTENCIA') acc.asistencias++;
    else if (i.estatus === 'RETARDO') acc.retardos++;
    else if (i.estatus === 'INASISTENCIA') acc.inasistencias++;
    return acc;
  }, { asistencias: 0, retardos: 0, inasistencias: 0 });
}

/** id_personal de quien hace la petición: el que viene en el JWT (o, en tokens antiguos, se busca por su usuario). */
async function idPersonalDe(user) {
  if (user.id_personal) return user.id_personal;
  const [rows] = await pool.query('SELECT id_personal FROM personal WHERE id_usuario = ?', [user.id_usuario]);
  return rows[0] ? rows[0].id_personal : null;
}

module.exports = { TOLERANCIA_MIN, DIAS, aMinutos, hhmm, sumarDias, lunesDe, diaDe, calcularIncidencias, contar, idPersonalDe };

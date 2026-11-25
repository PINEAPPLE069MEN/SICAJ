const pool = require('../config/db');
const { fechaLocal } = require('../utils/fechas');
const { suspensionActiva } = require('../utils/suspensiones');
const { lunesDe, sumarDias, diaDe, hhmm, calcularIncidencias, contar, idPersonalDe } = require('../utils/incidencias');

/** GET /api/dashboard — la escuela completa para Administrador/Directivos; solo "lo mío" para el Docente. */
async function resumen(req, res) {
  if (req.user.nombre_rol === 'Docente') return resumenDocente(req, res);
  return resumenEscuela(req, res);
}

/* ───────────── Panel de la escuela ───────────── */
async function resumenEscuela(req, res) {
  const hoy = fechaLocal();
  const [[alumnos]] = await pool.query('SELECT COUNT(*) AS total FROM alumno');
  const [[docentes]] = await pool.query(
    `SELECT COUNT(*) AS total FROM personal p
     JOIN usuario u ON u.id_usuario = p.id_usuario
     JOIN rol r ON r.id_rol = u.id_rol WHERE r.nombre_rol = 'Docente'`
  );
  const [[grupos]] = await pool.query('SELECT COUNT(*) AS total FROM grupo');

  // Inasistencias y retardos de la semana (lunes a hoy), incluidas las calculadas automáticamente:
  // jornada programada, ya pasó la tolerancia (o terminó la jornada) y no se escaneó el QR.
  const items = await calcularIncidencias({ desde: lunesDe(hoy), hasta: hoy, roles: ['Docente'] });
  const semana = contar(items);
  const deHoy = contar(items.filter(i => i.fecha === hoy));

  const porDocente = new Map();
  items.forEach(i => {
    if (i.estatus !== 'INASISTENCIA' && i.estatus !== 'RETARDO') return;
    const f = porDocente.get(i.id_personal) || { docente: i.persona, inasistencias: 0, retardos: 0 };
    if (i.estatus === 'INASISTENCIA') f.inasistencias++; else f.retardos++;
    porDocente.set(i.id_personal, f);
  });
  const incidenciasDocentes = [...porDocente.values()]
    .sort((a, b) => (b.inasistencias + b.retardos) - (a.inasistencias + a.retardos) || a.docente.localeCompare(b.docente));

  // "Permisos" de los alumnos = justificantes de inasistencia, por estatus (últimos 30 días)
  const [justif] = await pool.query(
    `SELECT estatus, COUNT(*) AS total FROM justificante
     WHERE fecha_creacion >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY estatus`
  );
  const por = Object.fromEntries(justif.map(r => [r.estatus, Number(r.total)]));

  res.json({
    rol: 'escuela',
    total_alumnos: alumnos.total,
    docentes_activos: docentes.total,
    total_grupos: grupos.total,
    suspension_hoy: await suspensionActiva(hoy),
    inasistencias_hoy: deHoy.inasistencias,
    retardos_hoy: deHoy.retardos,
    inasistencias_semana: semana.inasistencias,
    retardos_semana: semana.retardos,
    semana: { desde: lunesDe(hoy), hasta: hoy },
    incidencias_docentes: incidenciasDocentes,
    justificantes_alumnos: { pendientes: por.Pendiente || 0, aprobados: por.Aprobado || 0, rechazados: por.Rechazado || 0 }
  });
}

/* ───────────── Panel del Docente: solo sus propias estadísticas ───────────── */
async function resumenDocente(req, res) {
  const hoy = fechaLocal();
  const lunes = lunesDe(hoy);
  const idPersonal = await idPersonalDe(req.user);
  const base = { rol: 'Docente', suspension_hoy: await suspensionActiva(hoy), semana: { desde: lunes, hasta: sumarDias(lunes, 4) } };
  if (!idPersonal) {
    return res.json({ ...base, ...contar([]), semana: { ...base.semana, asistencias: 0, retardos: 0, inasistencias: 0 }, ciclo: null, dias: [], justificantes_aprobados: [] });
  }

  const itemsSemana = await calcularIncidencias({ desde: lunes, hasta: hoy, idPersonal });
  const semana = contar(itemsSemana);

  // Día por día (lunes a viernes)
  const dias = [];
  for (let i = 0; i < 5; i++) {
    const fecha = sumarDias(lunes, i);
    const it = itemsSemana.find(x => x.fecha === fecha);
    dias.push({
      fecha,
      dia: diaDe(fecha),
      estatus: it ? it.estatus : (fecha > hoy ? 'PROXIMO' : 'SIN_JORNADA'),
      automatica: it ? it.automatica : false,
      jornada: it ? it.jornada : null,
      hora_entrada: it ? hhmm(it.hora_entrada) : null,
      hora_salida: it ? hhmm(it.hora_salida) : null
    });
  }

  // Ciclo escolar vigente
  let ciclo = null;
  const [ciclos] = await pool.query(
    `SELECT nombre, DATE_FORMAT(fecha_inicio, '%Y-%m-%d') AS ini FROM ciclo_escolar
     WHERE ? BETWEEN fecha_inicio AND fecha_fin ORDER BY fecha_inicio DESC LIMIT 1`, [hoy]);
  if (ciclos.length > 0) {
    ciclo = { nombre: ciclos[0].nombre, ...contar(await calcularIncidencias({ desde: ciclos[0].ini, hasta: hoy, idPersonal })) };
  }

  res.json({
    ...base,
    semana: { ...base.semana, ...semana },
    ciclo,
    dias,
    justificantes_aprobados: await justificantesAprobados(idPersonal, hoy)
  });
}

/**
 * Justificantes APROBADOS de alumnos de los grupos que atiende este docente.
 * Se cruza el grupo del alumno y el día de la semana contra el horario del docente (horario_clase):
 * por cada fecha cubierta por el justificante en que el docente imparte clase a ese grupo, se avisa
 * qué alumno, qué materia y a qué hora, para que no le ponga falta.
 * Ventana: desde 3 días atrás hasta 14 días adelante.
 */
async function justificantesAprobados(idPersonal, hoy) {
  const ini = sumarDias(hoy, -3);
  const fin = sumarDias(hoy, 14);
  const [rows] = await pool.query(
    `SELECT j.folio, DATE_FORMAT(j.fecha_inicio, '%Y-%m-%d') AS fi, DATE_FORMAT(j.fecha_fin, '%Y-%m-%d') AS ff,
            a.nombres, a.apellido_paterno, a.numero_control, gd.nombre AS grado, g.letra,
            h.dia_semana, h.hora_inicio, h.hora_fin, COALESCE(m.nombre, 'Clase') AS materia
     FROM justificante j
     JOIN alumno a ON a.id_alumno = j.id_alumno
     JOIN grupo g ON g.id_grupo = a.id_grupo
     JOIN grado gd ON gd.id_grado = g.id_grado
     JOIN horario_clase h ON h.id_grupo = a.id_grupo AND h.id_docente = ?
     LEFT JOIN materia m ON m.id_materia = h.id_materia
     WHERE j.estatus = 'Aprobado' AND j.fecha_fin >= ? AND j.fecha_inicio <= ?`,
    [idPersonal, ini, fin]
  );
  const avisos = [];
  rows.forEach(r => {
    const desde = r.fi > ini ? r.fi : ini;
    const hasta = r.ff < fin ? r.ff : fin;
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
      if (diaDe(f) !== r.dia_semana) continue;
      avisos.push({
        fecha: f,
        dia: r.dia_semana,
        es_hoy: f === hoy,
        alumno: `${r.nombres} ${r.apellido_paterno}`,
        numero_control: r.numero_control,
        grupo: `${r.grado}${r.letra}`,
        materia: r.materia,
        hora: `${hhmm(r.hora_inicio)} - ${hhmm(r.hora_fin)}`,
        folio: r.folio
      });
    }
  });
  avisos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.hora.localeCompare(b.hora)));
  return avisos.slice(0, 200);
}

module.exports = { resumen };

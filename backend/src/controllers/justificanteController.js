const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { genFolio } = require('../utils/generators');
const { registrarBitacora } = require('../middleware/bitacora');

const CARPETA_EVIDENCIAS = path.join(__dirname, '..', '..', 'uploads', 'justificantes');
const EXTENSIONES_EVIDENCIA = ['.pdf', '.jpg', '.jpeg', '.png'];

/**
 * Verifica que la fecha de inicio esté dentro de las últimas 72 horas,
 * comparando SOLO fechas de calendario (sin componente de hora) para evitar
 * el bug de zona horaria: "new Date('2026-09-19')" se interpreta como
 * medianoche UTC, lo que podía rechazar por error el día de hoy dependiendo
 * de la zona horaria del servidor.
 */
function dentroDe72Horas(fechaInicioStr) {
  const hoyUTC = new Date();
  const hoy = new Date(Date.UTC(hoyUTC.getFullYear(), hoyUTC.getMonth(), hoyUTC.getDate()));
  const [y, m, d] = fechaInicioStr.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const limite = new Date(hoy.getTime() - 3 * 24 * 60 * 60 * 1000); // 72h = 3 días de calendario
  return fecha >= limite && fecha <= hoy;
}

async function listar(req, res) {
  let query = `SELECT j.id_justificante, j.folio, j.id_alumno, j.fecha_inicio, j.fecha_fin, j.motivo,
                      j.estatus, j.comentario_resolucion, j.fecha_creacion, j.fecha_resolucion,
                      a.nombres, a.apellido_paterno, a.numero_control
               FROM justificante j
               JOIN alumno a ON a.id_alumno = j.id_alumno`;
  const params = [];

  if (req.user.nombre_rol === 'Alumno') {
    query += ' WHERE a.id_usuario = ?';
    params.push(req.user.id_usuario);
  } else if (req.user.nombre_rol === 'Padre_Tutor') {
    query += ` JOIN alumno_padre ap ON ap.id_alumno = a.id_alumno
               JOIN padre_tutor pt ON pt.id_padre = ap.id_padre
               WHERE pt.id_usuario = ?`;
    params.push(req.user.id_usuario);
  } else if (req.user.nombre_rol === 'Docente') {
    query += ` WHERE a.id_grupo IN (
                 SELECT DISTINCT h.id_grupo FROM horario_clase h
                 JOIN personal p ON p.id_personal = h.id_docente
                 WHERE p.id_usuario = ?
               )`;
    params.push(req.user.id_usuario);
  } else if (req.query.estatus) {
    query += ' WHERE j.estatus = ?';
    params.push(req.query.estatus);
  }

  query += ' ORDER BY j.fecha_creacion DESC';
  const [rows] = await pool.query(query, params);
  res.json(rows);
}

async function crear(req, res) {
  const { fecha_inicio, fecha_fin, motivo } = req.body;

  if (!fecha_inicio || !fecha_fin) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Seleccione un rango de fechas válido' });
  }
  if (!motivo || !motivo.trim()) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Ingrese el motivo de la solicitud' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Adjunte evidencia en PDF, JPG o PNG' });
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!EXTENSIONES_EVIDENCIA.includes(ext)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Adjunte evidencia en PDF, JPG o PNG' });
  }
  if (fecha_fin < fecha_inicio) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Seleccione un rango de fechas válido' });
  }
  if (!dentroDe72Horas(fecha_inicio)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'No es posible justificar, no hay inasistencia reciente' });
  }

  const [alumnoRows] = await pool.query('SELECT id_alumno FROM alumno WHERE id_usuario = ?', [req.user.id_usuario]);
  if (alumnoRows.length === 0) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'No se encontró el registro de alumno asociado a su cuenta' });
  }
  const idAlumno = alumnoRows[0].id_alumno;

  const folio = genFolio();
  const [result] = await pool.query(
    `INSERT INTO justificante (folio, id_alumno, fecha_inicio, fecha_fin, motivo, archivo_adjunto, id_usuario_creador)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [folio, idAlumno, fecha_inicio, fecha_fin, motivo, req.file.filename, req.user.id_usuario]
  );

  await registrarBitacora(req.user.id_usuario, 'SOLICITAR_JUSTIFICANTE', `Folio ${folio}`);
  res.status(201).json({ id_justificante: result.insertId, folio, estatus: 'Pendiente' });
}

/**
 * El "Encargado" (Administrador, Director o Subdirector) aprueba (✓) o
 * rechaza (✗) la solicitud. El comentario es opcional en ambos casos.
 * A diferencia de la versión anterior, esto YA PERMITE corregir una
 * resolución previa (por si el Encargado se equivocó al aprobar/rechazar):
 * basta con volver a llamar este mismo endpoint con el estatus correcto.
 */
async function resolver(req, res) {
  const { estatus, comentario } = req.body;
  if (!['Aprobado', 'Rechazado'].includes(estatus)) {
    return res.status(400).json({ error: 'El estatus debe ser "Aprobado" o "Rechazado"' });
  }

  const [actual] = await pool.query('SELECT id_justificante FROM justificante WHERE id_justificante = ?', [req.params.id]);
  if (actual.length === 0) return res.status(404).json({ error: 'Justificante no encontrado' });

  await pool.query(
    `UPDATE justificante
     SET estatus = ?, comentario_resolucion = ?, id_usuario_resolutor = ?, fecha_resolucion = NOW()
     WHERE id_justificante = ?`,
    [estatus, comentario || null, req.user.id_usuario, req.params.id]
  );

  await registrarBitacora(req.user.id_usuario, 'RESOLVER_JUSTIFICANTE', `Justificante id ${req.params.id} → ${estatus}`);
  res.json({ mensaje: `Justificante ${estatus.toLowerCase()} correctamente` });
}

async function obtenerEvidencia(req, res) {
  const [rows] = await pool.query(
    `SELECT j.archivo_adjunto, a.id_usuario AS id_usuario_alumno
     FROM justificante j
     JOIN alumno a ON a.id_alumno = j.id_alumno
     WHERE j.id_justificante = ?`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Justificante no encontrado' });

  const esDueno = rows[0].id_usuario_alumno === req.user.id_usuario;
  const esEncargado = ['Administrador', 'Director', 'Subdirector'].includes(req.user.nombre_rol);
  if (!esDueno && !esEncargado) {
    return res.status(403).json({ error: 'No tiene permiso para ver esta evidencia' });
  }

  const rutaArchivo = path.join(CARPETA_EVIDENCIAS, rows[0].archivo_adjunto);
  if (!fs.existsSync(rutaArchivo)) {
    return res.status(404).json({ error: 'El archivo de evidencia ya no está disponible' });
  }
  res.sendFile(rutaArchivo);
}

module.exports = { listar, crear, resolver, obtenerEvidencia };

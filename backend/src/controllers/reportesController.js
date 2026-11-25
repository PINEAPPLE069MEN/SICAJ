const pool = require('../config/db');
const { fechaLocal, fechaValida } = require('../utils/fechas');
const { calcularIncidencias, contar, hhmm } = require('../utils/incidencias');
const { crearReporte, fmtFecha } = require('../utils/pdfInstitucional');

const TIPOS_REPORTE = [
  { id: 'retardos_faltas_docente', nombre: 'Retardos e Inasistencias del Personal' },
  { id: 'justificantes_alumno', nombre: 'Justificantes por Alumno' },
  { id: 'inasistencias_grupo', nombre: 'Incidencias de Docentes por Grupo' }
];

const ROJO = '#b02a37';
const AMBAR = '#a86a00';
const ESTATUS_TXT = { ASISTENCIA: 'A tiempo', RETARDO: 'Retardo', INASISTENCIA: 'Inasistencia', PENDIENTE: 'En espera' };

function catalogo(req, res) {
  res.json(TIPOS_REPORTE);
}

async function generarPdf(req, res) {
  const { tipo, fecha_inicio, fecha_fin } = req.query;
  const definicion = TIPOS_REPORTE.find(t => t.id === tipo);
  if (!definicion) return res.status(400).json({ error: 'Seleccione un tipo de reporte válido' });
  if (!fechaValida(fecha_inicio) || !fechaValida(fecha_fin) || fecha_fin < fecha_inicio) {
    return res.status(400).json({ error: 'Seleccione un rango de fechas válido' });
  }

  // Primero se consulta todo: si algo falla, se responde un error JSON normal (todavía no se empezó a escribir el PDF)
  let construir;

  if (tipo === 'retardos_faltas_docente') {
    const items = await calcularIncidencias({ desde: fecha_inicio, hasta: fecha_fin, roles: ['Docente', 'Administrativo'] });
    const c = contar(items);
    const incidencias = items.filter(i => i.estatus === 'RETARDO' || i.estatus === 'INASISTENCIA')
      .sort((a, b) => a.persona.localeCompare(b.persona) || (a.fecha < b.fecha ? -1 : 1));
    construir = pdf => {
      pdf.parrafo(`Días con jornada programada: ${c.asistencias + c.retardos + c.inasistencias}     A tiempo: ${c.asistencias}     Retardos: ${c.retardos}     Inasistencias: ${c.inasistencias}`, { negrita: true });
      pdf.parrafo('Una inasistencia es un día con jornada programada en el que no se escaneó el código QR. Los días de suspensión de clases no se cuentan. Un retardo es un registro posterior a 15 minutos de la primera hora.', { tam: 8.5, color: '#555' });
      pdf.tabla(['Personal', 'Rol', 'Fecha', 'Jornada', 'Entrada', 'Estatus'],
        incidencias.map(i => [
          i.persona, i.nombre_rol, `${fmtFecha(i.fecha)}`,
          i.jornada ? `${i.jornada.inicio} - ${i.jornada.fin}` : '—',
          i.hora_entrada ? hhmm(i.hora_entrada) : '—',
          { texto: ESTATUS_TXT[i.estatus], color: i.estatus === 'INASISTENCIA' ? ROJO : AMBAR }
        ]), [26, 14, 13, 17, 10, 20]);
    };

  } else if (tipo === 'justificantes_alumno') {
    const [rows] = await pool.query(
      `SELECT a.nombres, a.apellido_paterno, a.numero_control, j.folio,
              DATE_FORMAT(j.fecha_inicio, '%Y-%m-%d') AS fecha_inicio, DATE_FORMAT(j.fecha_fin, '%Y-%m-%d') AS fecha_fin, j.estatus
       FROM justificante j JOIN alumno a ON a.id_alumno = j.id_alumno
       WHERE j.fecha_inicio BETWEEN ? AND ?
       ORDER BY j.fecha_inicio DESC`, [fecha_inicio, fecha_fin]);
    const por = rows.reduce((acc, r) => { acc[r.estatus] = (acc[r.estatus] || 0) + 1; return acc; }, {});
    construir = pdf => {
      pdf.parrafo(`Total de justificantes: ${rows.length}     Aprobados: ${por.Aprobado || 0}     Pendientes: ${por.Pendiente || 0}     Rechazados: ${por.Rechazado || 0}`, { negrita: true });
      pdf.tabla(['Alumno', 'No. de control', 'Folio', 'Periodo justificado', 'Estatus'],
        rows.map(r => [
          `${r.nombres} ${r.apellido_paterno}`, r.numero_control, r.folio,
          r.fecha_inicio === r.fecha_fin ? fmtFecha(r.fecha_inicio) : `${fmtFecha(r.fecha_inicio)} al ${fmtFecha(r.fecha_fin)}`,
          r.estatus
        ]), [28, 16, 16, 26, 14]);
    };

  } else {
    const items = await calcularIncidencias({ desde: fecha_inicio, hasta: fecha_fin, roles: ['Docente'], conGrupos: true });
    const [grupos] = await pool.query(
      `SELECT g.id_grupo, gd.nombre AS grado, g.letra, g.turno
       FROM grupo g JOIN grado gd ON gd.id_grado = g.id_grado ORDER BY gd.nombre, g.letra`);
    const cuenta = new Map(grupos.map(g => [g.id_grupo, { ...g, inasistencias: 0, retardos: 0 }]));
    items.forEach(i => {
      if (i.estatus !== 'INASISTENCIA' && i.estatus !== 'RETARDO') return;
      i.grupos.forEach(idGrupo => {
        const fila = cuenta.get(idGrupo);
        if (!fila) return;
        if (i.estatus === 'INASISTENCIA') fila.inasistencias++; else fila.retardos++;
      });
    });
    const filas = [...cuenta.values()].filter(g => g.inasistencias + g.retardos > 0)
      .sort((a, b) => (b.inasistencias + b.retardos) - (a.inasistencias + a.retardos));
    construir = pdf => {
      pdf.parrafo(`Grupos con incidencias: ${filas.length}     Inasistencias de docentes: ${filas.reduce((s, g) => s + g.inasistencias, 0)}     Retardos: ${filas.reduce((s, g) => s + g.retardos, 0)}`, { negrita: true });
      pdf.parrafo('Cada inasistencia o retardo de un docente se cuenta una vez por cada grupo al que atiende ese día. Se incluyen las inasistencias calculadas automáticamente (jornada sin escaneo de QR).', { tam: 8.5, color: '#555' });
      pdf.tabla(['Grupo', 'Turno', 'Inasistencias de docentes', 'Retardos de docentes'],
        filas.map(g => [`${g.grado}${g.letra}`, g.turno, { texto: g.inasistencias, color: g.inasistencias ? ROJO : '#000' }, { texto: g.retardos, color: g.retardos ? AMBAR : '#000' }]),
        [14, 18, 34, 34]);
    };
  }

  const pdf = crearReporte({
    titulo: definicion.nombre,
    desde: fecha_inicio,
    hasta: fecha_fin,
    nombreArchivo: `reporte-${tipo}-${fecha_inicio}_${fecha_fin}.pdf`
  }, res);
  construir(pdf);
  pdf.finalizar();
}

module.exports = { catalogo, generarPdf };

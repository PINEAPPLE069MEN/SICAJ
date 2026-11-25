const pool = require('../config/db');

/** Catálogo de motivos de suspensión de clases, agrupado por categoría. */
const CATALOGO_MOTIVOS = [
  {
    categoria: 'Motivos académicos y administrativos',
    motivos: [
      ['Consejo Técnico Escolar (CTE) o reuniones docentes', 'Días destinados exclusivamente a que los profesores planifiquen, evalúen y capaciten (en México suelen ser el último viernes de cada mes).'],
      ['Descarga administrativa', 'Fechas asignadas para que los docentes califiquen exámenes y suban calificaciones al sistema antes de la entrega de boletas.'],
      ['Periodos vacacionales y puentes', 'Recesos oficiales de invierno, Semana Santa y verano, o días inhábiles autorizados por el calendario escolar.'],
      ['Capacitación o actualización docente', 'Cursos obligatorios para el personal educativo.']
    ]
  },
  {
    categoria: 'Fallas en las instalaciones y servicios',
    motivos: [
      ['Falta de agua o luz', 'Si no hay agua potable para los sanitarios o energía eléctrica, por normas de salubridad y seguridad no se puede recibir a los alumnos.'],
      ['Mantenimiento o remodelación', 'Reparaciones mayores en aulas, techos, bardas perimetrales o fumigación contra plagas.'],
      ['Daños estructurales', 'Revisión tras algún incidente (como un sismo) para descartar riesgos de derrumbe.']
    ]
  },
  {
    categoria: 'Clima y contingencias ambientales',
    motivos: [
      ['Fenómenos meteorológicos extremos', 'Lluvias torrenciales, inundaciones, huracanes, heladas severas o temperaturas extremadamente altas (ondas de calor) que pongan en riesgo el traslado o la salud de los estudiantes.'],
      ['Contingencia ambiental o volcánica', 'Mala calidad del aire o caída excesiva de ceniza volcánica (común en zonas cercanas al Popocatépetl), donde se suspenden actividades para evitar daños respiratorios.']
    ]
  },
  {
    categoria: 'Salud y emergencias',
    motivos: [
      ['Brotes epidemiológicos', 'Contagios masivos dentro del plantel (influenza, COVID-19, varicela o conjuntivitis) que obligan a sanitizar las aulas y cortar la cadena de transmisión.'],
      ['Emergencias externas o seguridad', 'Situaciones de riesgo en los alrededores de la escuela, bloqueos viales que impidan el acceso o emergencias locales decretadas por Protección Civil.']
    ]
  },
  {
    categoria: 'Conflictos laborales o sociales',
    motivos: [
      ['Paros laborales o huelgas', 'Suspensiones convocadas por sindicatos de maestros o personal administrativo por demandas salariales o contractuales.'],
      ['Toma de instalaciones', 'Protestas por parte de padres de familia o estudiantes debido a inconformidades con la dirección o falta de recursos en el plantel.']
    ]
  }
];

/** Crea las tablas si no existen y siembra el catálogo de motivos (idempotente). */
async function asegurarEsquemaSuspensiones() {
  await pool.query(`CREATE TABLE IF NOT EXISTS categoria_suspension (
    id_categoria INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL UNIQUE
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS motivo_suspension (
    id_motivo INT AUTO_INCREMENT PRIMARY KEY,
    id_categoria INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    UNIQUE KEY uq_motivo (id_categoria, nombre),
    FOREIGN KEY (id_categoria) REFERENCES categoria_suspension(id_categoria)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS suspension_clases (
    id_suspension INT AUTO_INCREMENT PRIMARY KEY,
    id_motivo INT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    observaciones VARCHAR(255),
    id_usuario_creador INT NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_suspension_fechas (fecha_inicio, fecha_fin),
    FOREIGN KEY (id_motivo) REFERENCES motivo_suspension(id_motivo),
    FOREIGN KEY (id_usuario_creador) REFERENCES usuario(id_usuario)
  )`);

  for (const grupo of CATALOGO_MOTIVOS) {
    await pool.query('INSERT IGNORE INTO categoria_suspension (nombre) VALUES (?)', [grupo.categoria]);
    for (const [nombre, descripcion] of grupo.motivos) {
      await pool.query(
        `INSERT INTO motivo_suspension (id_categoria, nombre, descripcion)
         SELECT id_categoria, ?, ? FROM categoria_suspension WHERE nombre = ?
         ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion)`,
        [nombre, descripcion, grupo.categoria]
      );
    }
  }
}

/** Devuelve la suspensión vigente en esa fecha (YYYY-MM-DD) o null. Nunca lanza error. */
async function suspensionActiva(fecha) {
  try {
    const [rows] = await pool.query(
      `SELECT s.id_suspension, m.nombre AS motivo, c.nombre AS categoria, s.observaciones,
              DATE_FORMAT(s.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
              DATE_FORMAT(s.fecha_fin, '%Y-%m-%d') AS fecha_fin
       FROM suspension_clases s
       JOIN motivo_suspension m ON m.id_motivo = s.id_motivo
       JOIN categoria_suspension c ON c.id_categoria = m.id_categoria
       WHERE ? BETWEEN s.fecha_inicio AND s.fecha_fin
       ORDER BY s.id_suspension DESC LIMIT 1`,
      [fecha]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('Suspensiones: no se pudo consultar:', err.message);
    return null;
  }
}

/**
 * Ejecuta una consulta que contiene el marcador /*SUSP:alias.fecha*\/ y lo reemplaza por un filtro
 * que excluye los días con suspensión de clases. Si la tabla no existe, ejecuta la consulta sin el filtro.
 */
async function consultaSinSuspensiones(sql, params) {
  const conFiltro = sql.replace(/\/\*SUSP:([\w.]+)\*\//g,
    (_, campo) => `AND NOT EXISTS (SELECT 1 FROM suspension_clases sc WHERE ${campo} BETWEEN sc.fecha_inicio AND sc.fecha_fin)`);
  try {
    return await pool.query(conFiltro, params);
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
    return pool.query(sql.replace(/\/\*SUSP:[\w.]+\*\//g, ''), params);
  }
}

module.exports = { CATALOGO_MOTIVOS, asegurarEsquemaSuspensiones, suspensionActiva, consultaSinSuspensiones };

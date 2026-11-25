const pool = require('../config/db');

/**
 * Catálogo de permisos del sistema. Cada uno se marca/desmarca desde "Permisos y Accesos".
 * El orden de este arreglo es el orden en que se muestran en pantalla.
 */
const CATALOGO = [
  { clave: 'panel.ver', modulo: 'Panel de Control', descripcion: 'Ver el panel con las estadísticas de toda la escuela (el Docente siempre ve el panel con SUS estadísticas)' },
  { clave: 'ciclos.ver', modulo: 'Ciclos y Grupos', descripcion: 'Entrar a la pantalla de ciclos, materias y grupos' },
  { clave: 'ciclos.gestionar', modulo: 'Ciclos y Grupos', descripcion: 'Crear, editar y eliminar ciclos, grados, grupos y materias' },
  { clave: 'horarios.ver', modulo: 'Horarios de Clase', descripcion: 'Ver los horarios de clase' },
  { clave: 'horarios.gestionar', modulo: 'Horarios de Clase', descripcion: 'Asignar y quitar clases en el calendario' },
  { clave: 'personal.ver', modulo: 'Personal Institucional', descripcion: 'Ver la lista del personal' },
  { clave: 'personal.gestionar', modulo: 'Personal Institucional', descripcion: 'Registrar, editar y eliminar personal' },
  { clave: 'alumnos.ver', modulo: 'Inscripción de Alumnos', descripcion: 'Ver la lista de alumnos' },
  { clave: 'alumnos.gestionar', modulo: 'Inscripción de Alumnos', descripcion: 'Inscribir, editar y eliminar alumnos' },
  { clave: 'asistencia.ver', modulo: 'Asistencia por QR', descripcion: 'Ver el historial de asistencias y las fotografías de todo el personal' },
  { clave: 'asistencia.monitor', modulo: 'Asistencia por QR', descripcion: 'Proyectar el código QR de asistencia en el monitor de la escuela' },
  { clave: 'justificantes.ver', modulo: 'Justificantes', descripcion: 'Entrar a la pantalla de justificantes' },
  { clave: 'justificantes.resolver', modulo: 'Justificantes', descripcion: 'Aprobar o rechazar justificantes' },
  { clave: 'suspensiones.ver', modulo: 'Suspensión de Clases', descripcion: 'Ver el calendario de suspensiones de clases' },
  { clave: 'suspensiones.gestionar', modulo: 'Suspensión de Clases', descripcion: 'Registrar y eliminar suspensiones de clases' },
  { clave: 'reportes.ver', modulo: 'Reportes', descripcion: 'Generar reportes en PDF' },
  { clave: 'permisos.gestionar', modulo: 'Permisos y Accesos', descripcion: 'Administrar los permisos de roles y de personas' }
];

const TODAS = CATALOGO.map(c => c.clave);

/** Permisos iniciales de cada rol (igual que el comportamiento anterior del sistema). */
const DEFECTO_ROLES = {
  Director: ['panel.ver', 'personal.ver', 'justificantes.ver', 'justificantes.resolver', 'reportes.ver', 'suspensiones.ver', 'suspensiones.gestionar'],
  Subdirector: ['panel.ver', 'personal.ver', 'justificantes.ver', 'justificantes.resolver', 'reportes.ver', 'suspensiones.ver', 'suspensiones.gestionar'],
  Docente: ['panel.ver', 'horarios.ver', 'alumnos.ver', 'asistencia.ver', 'justificantes.ver', 'suspensiones.ver'],
  Administrativo: ['suspensiones.ver'],
  Alumno: ['justificantes.ver'],
  Padre_Tutor: ['justificantes.ver']
};

/** Crea las tablas si no existen y siembra el catálogo y los permisos por defecto (idempotente). */
async function asegurarEsquemaPermisos() {
  await pool.query(`CREATE TABLE IF NOT EXISTS permiso (
    id_permiso INT AUTO_INCREMENT PRIMARY KEY,
    clave VARCHAR(50) NOT NULL UNIQUE,
    modulo VARCHAR(60) NOT NULL,
    descripcion VARCHAR(160) NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS rol_permiso (
    id_rol INT NOT NULL,
    id_permiso INT NOT NULL,
    PRIMARY KEY (id_rol, id_permiso),
    FOREIGN KEY (id_rol) REFERENCES rol(id_rol) ON DELETE CASCADE,
    FOREIGN KEY (id_permiso) REFERENCES permiso(id_permiso) ON DELETE CASCADE
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS usuario_permiso (
    id_usuario INT NOT NULL,
    id_permiso INT NOT NULL,
    concedido TINYINT(1) NOT NULL,
    PRIMARY KEY (id_usuario, id_permiso),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    FOREIGN KEY (id_permiso) REFERENCES permiso(id_permiso) ON DELETE CASCADE
  )`);

  // Quita del catálogo los permisos que ya no existen (p. ej. los del lector de huella); sus asignaciones se borran en cascada
  await pool.query(`DELETE FROM permiso WHERE clave NOT IN (${TODAS.map(() => '?').join(',')})`, TODAS);

  // Catálogo: inserta los nuevos y actualiza textos. Un permiso recién creado recibe sus valores
  // por defecto en cada rol; los permisos que ya existían no se tocan (respeta lo que el administrador marcó).
  const porRol = { Administrador: TODAS, ...DEFECTO_ROLES };
  for (const c of CATALOGO) {
    const [previo] = await pool.query('SELECT 1 FROM permiso WHERE clave = ?', [c.clave]);
    await pool.query(
      `INSERT INTO permiso (clave, modulo, descripcion) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descripcion = VALUES(descripcion)`,
      [c.clave, c.modulo, c.descripcion]
    );
    if (previo.length > 0) continue; // ya existía: no se tocan los permisos que el administrador marcó
    for (const [rol, claves] of Object.entries(porRol)) {
      if (!claves.includes(c.clave)) continue;
      await pool.query(
        `INSERT IGNORE INTO rol_permiso (id_rol, id_permiso)
         SELECT r.id_rol, p.id_permiso FROM rol r, permiso p WHERE r.nombre_rol = ? AND p.clave = ?`,
        [rol, c.clave]
      );
    }
  }
}

/** Permisos del rol (sin ajustes individuales). */
async function permisosDeRol(idRol, nombreRol) {
  if (nombreRol === 'Administrador') return new Set(TODAS);
  const [rows] = await pool.query(
    `SELECT p.clave FROM rol_permiso rp JOIN permiso p ON p.id_permiso = rp.id_permiso WHERE rp.id_rol = ?`,
    [idRol]
  );
  return new Set(rows.map(r => r.clave));
}

/** Permisos finales de un usuario: los de su rol + ajustes individuales. El Administrador siempre tiene todo. */
async function permisosEfectivos(user) {
  const nombreRol = user.nombre_rol || user.rol;
  if (nombreRol === 'Administrador') return new Set(TODAS);
  try {
    const set = await permisosDeRol(user.id_rol, nombreRol);
    const [ajustes] = await pool.query(
      `SELECT p.clave, up.concedido FROM usuario_permiso up JOIN permiso p ON p.id_permiso = up.id_permiso WHERE up.id_usuario = ?`,
      [user.id_usuario]
    );
    ajustes.forEach(a => (a.concedido ? set.add(a.clave) : set.delete(a.clave)));
    return set;
  } catch (err) {
    // Si las tablas no existen (p. ej. sin permiso de DDL), el sistema sigue con los valores por defecto
    console.error('Permisos: usando valores por defecto:', err.message);
    return new Set(DEFECTO_ROLES[nombreRol] || []);
  }
}

module.exports = { CATALOGO, TODAS, DEFECTO_ROLES, asegurarEsquemaPermisos, permisosDeRol, permisosEfectivos };

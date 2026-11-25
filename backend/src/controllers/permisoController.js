const pool = require('../config/db');
const { TODAS, permisosDeRol, permisosEfectivos } = require('../utils/permisos');
const { registrarBitacora } = require('../middleware/bitacora');

function clavesValidas(body) {
  if (!body || !Array.isArray(body.claves)) return null;
  const limpias = [...new Set(body.claves.map(String))];
  return limpias.every(c => TODAS.includes(c)) ? limpias : null;
}

async function catalogo(req, res) {
  const [rows] = await pool.query('SELECT id_permiso, clave, modulo, descripcion FROM permiso ORDER BY id_permiso');
  res.json(rows);
}

async function roles(req, res) {
  const [rows] = await pool.query('SELECT id_rol, nombre_rol FROM rol ORDER BY id_rol');
  res.json(rows);
}

async function obtenerRol(req, res) {
  const [r] = await pool.query('SELECT id_rol, nombre_rol FROM rol WHERE id_rol = ?', [req.params.id]);
  if (r.length === 0) return res.status(404).json({ error: 'Rol no encontrado' });
  const claves = [...await permisosDeRol(r[0].id_rol, r[0].nombre_rol)];
  res.json({ ...r[0], editable: r[0].nombre_rol !== 'Administrador', claves });
}

async function guardarRol(req, res) {
  const [r] = await pool.query('SELECT id_rol, nombre_rol FROM rol WHERE id_rol = ?', [req.params.id]);
  if (r.length === 0) return res.status(404).json({ error: 'Rol no encontrado' });
  if (r[0].nombre_rol === 'Administrador') return res.status(400).json({ error: 'El Administrador siempre tiene todos los permisos' });
  const claves = clavesValidas(req.body);
  if (!claves) return res.status(400).json({ error: 'Lista de permisos no válida' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM rol_permiso WHERE id_rol = ?', [r[0].id_rol]);
    for (const clave of claves) {
      await conn.query(
        'INSERT INTO rol_permiso (id_rol, id_permiso) SELECT ?, id_permiso FROM permiso WHERE clave = ?',
        [r[0].id_rol, clave]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
  await registrarBitacora(req.user.id_usuario, 'PERMISOS_ROL', `Actualizó permisos del rol ${r[0].nombre_rol}`);
  res.json({ mensaje: `Permisos del rol ${r[0].nombre_rol} guardados`, claves });
}

async function usuarios(req, res) {
  const q = `%${String(req.query.q || '').trim()}%`;
  const [rows] = await pool.query(
    `SELECT u.id_usuario, u.identificador, r.nombre_rol,
            COALESCE(NULLIF(CONCAT_WS(' ', pe.nombres, pe.apellido_paterno), ''),
                     NULLIF(CONCAT_WS(' ', al.nombres, al.apellido_paterno), ''),
                     NULLIF(CONCAT_WS(' ', pt.nombres, pt.apellido_paterno), ''),
                     u.identificador) AS nombre,
            (SELECT COUNT(*) FROM usuario_permiso up WHERE up.id_usuario = u.id_usuario) AS ajustes
     FROM usuario u
     JOIN rol r ON r.id_rol = u.id_rol
     LEFT JOIN personal pe ON pe.id_usuario = u.id_usuario
     LEFT JOIN alumno al ON al.id_usuario = u.id_usuario
     LEFT JOIN padre_tutor pt ON pt.id_usuario = u.id_usuario
     WHERE u.identificador LIKE ?
        OR CONCAT_WS(' ', pe.nombres, pe.apellido_paterno) LIKE ?
        OR CONCAT_WS(' ', al.nombres, al.apellido_paterno) LIKE ?
        OR CONCAT_WS(' ', pt.nombres, pt.apellido_paterno) LIKE ?
     ORDER BY r.id_rol, nombre
     LIMIT 100`,
    [q, q, q, q]
  );
  res.json(rows);
}

async function datosUsuario(id) {
  const [rows] = await pool.query(
    `SELECT u.id_usuario, u.identificador, u.id_rol, r.nombre_rol
     FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.id_usuario = ?`,
    [id]
  );
  return rows[0] || null;
}

async function obtenerUsuario(req, res) {
  const u = await datosUsuario(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const heredados = [...await permisosDeRol(u.id_rol, u.nombre_rol)];
  const efectivos = [...await permisosEfectivos(u)];
  res.json({
    id_usuario: u.id_usuario,
    identificador: u.identificador,
    nombre_rol: u.nombre_rol,
    editable: u.nombre_rol !== 'Administrador',
    heredados,
    claves: efectivos
  });
}

async function guardarUsuario(req, res) {
  const u = await datosUsuario(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (u.nombre_rol === 'Administrador') return res.status(400).json({ error: 'El Administrador siempre tiene todos los permisos' });
  const claves = clavesValidas(req.body);
  if (!claves) return res.status(400).json({ error: 'Lista de permisos no válida' });

  const heredados = await permisosDeRol(u.id_rol, u.nombre_rol);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM usuario_permiso WHERE id_usuario = ?', [u.id_usuario]);
    for (const clave of TODAS) {
      const quiere = claves.includes(clave);
      const tiene = heredados.has(clave);
      if (quiere === tiene) continue; // igual que el rol: no hace falta ajuste
      await conn.query(
        'INSERT INTO usuario_permiso (id_usuario, id_permiso, concedido) SELECT ?, id_permiso, ? FROM permiso WHERE clave = ?',
        [u.id_usuario, quiere ? 1 : 0, clave]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
  await registrarBitacora(req.user.id_usuario, 'PERMISOS_USUARIO', `Actualizó permisos individuales de ${u.identificador}`);
  res.json({ mensaje: `Permisos de ${u.identificador} guardados` });
}

async function restablecerUsuario(req, res) {
  const u = await datosUsuario(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  await pool.query('DELETE FROM usuario_permiso WHERE id_usuario = ?', [u.id_usuario]);
  await registrarBitacora(req.user.id_usuario, 'PERMISOS_USUARIO', `Restableció permisos de ${u.identificador} a los de su rol`);
  res.json({ mensaje: 'Se restablecieron los permisos del rol' });
}

module.exports = { catalogo, roles, obtenerRol, guardarRol, usuarios, obtenerUsuario, guardarUsuario, restablecerUsuario };

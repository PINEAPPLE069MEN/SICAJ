const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { genClaveEmpleado, genPassword } = require('../utils/generators');
const { registrarBitacora } = require('../middleware/bitacora');
const {
  validarTexto, validarCurp, validarCorreo, validarTelefono, validarCodigoPostal
} = require('../utils/validators');

const ROLES_PERSONAL = ['Docente', 'Director', 'Subdirector', 'Administrativo'];

const SELECT_PERSONAL = `
  SELECT p.*, u.identificador, r.nombre_rol
  FROM personal p
  JOIN usuario u ON u.id_usuario = p.id_usuario
  JOIN rol r ON r.id_rol = u.id_rol`;

async function listar(req, res) {
  const [rows] = await pool.query(`${SELECT_PERSONAL} ORDER BY p.id_personal DESC`);
  res.json(rows);
}

async function obtener(req, res) {
  const [rows] = await pool.query(`${SELECT_PERSONAL} WHERE p.id_personal = ?`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Personal no encontrado' });
  res.json(rows[0]);
}

function validar(b, { parcial = false } = {}) {
  const campos = ['nombres', 'apellido_paterno', 'curp', 'correo_electronico', 'telefono',
    'calle', 'numero_exterior', 'colonia', 'municipio', 'estado', 'codigo_postal'];
  if (!parcial) {
    for (const c of campos) {
      if (b[c] === undefined || b[c] === null || !String(b[c]).trim()) return `El campo "${c}" es obligatorio`;
    }
  }
  if (b.nombres !== undefined && !validarTexto(b.nombres, 2, 100)) return 'El nombre solo debe contener letras';
  if (b.apellido_paterno !== undefined && !validarTexto(b.apellido_paterno)) return 'El apellido paterno solo debe contener letras';
  if (b.apellido_materno && !validarTexto(b.apellido_materno)) return 'El apellido materno solo debe contener letras';
  if (b.curp !== undefined && !validarCurp(b.curp)) return 'La CURP no es válida (18 caracteres)';
  if (b.correo_electronico !== undefined && !validarCorreo(b.correo_electronico)) return 'El correo electrónico no es válido';
  if (b.telefono !== undefined && !validarTelefono(b.telefono)) return 'El teléfono debe tener 10 dígitos';
  if (b.codigo_postal !== undefined && !validarCodigoPostal(b.codigo_postal)) return 'El código postal debe tener 5 dígitos';
  return null;
}

async function crear(req, res) {
  const b = req.body;
  const error = validar(b);
  if (error) return res.status(400).json({ error });
  if (!ROLES_PERSONAL.includes(b.rol)) return res.status(400).json({ error: 'Seleccione un rol válido' });

  const conn = await pool.getConnection();
  try {
    const [rolRows] = await conn.query('SELECT id_rol FROM rol WHERE nombre_rol = ?', [b.rol]);
    if (rolRows.length === 0) return res.status(400).json({ error: `El rol "${b.rol}" no existe en la base de datos` });

    const clave = genClaveEmpleado();
    const passwordTemporal = genPassword('Sice');
    const hash = await bcrypt.hash(passwordTemporal, 10);

    await conn.beginTransaction();
    const [u] = await conn.query(
      'INSERT INTO usuario (identificador, password_hash, password_temporal, id_rol) VALUES (?, ?, 1, ?)',
      [clave, hash, rolRows[0].id_rol]
    );
    const [p] = await conn.query(
      `INSERT INTO personal (id_usuario, clave_empleado, nombres, apellido_paterno, apellido_materno, curp,
         calle, numero_exterior, colonia, municipio, estado, codigo_postal, telefono, correo_electronico)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.insertId, clave, b.nombres.trim(), b.apellido_paterno.trim(), (b.apellido_materno || '').trim(),
        b.curp.toUpperCase().trim(), b.calle, b.numero_exterior, b.colonia, b.municipio, b.estado,
        b.codigo_postal, b.telefono, b.correo_electronico.trim()]
    );
    await conn.commit();

    await registrarBitacora(req.user.id_usuario, 'CREAR_PERSONAL', `Creó personal ${clave} (${b.rol})`);
    res.status(201).json({ id_personal: p.insertId, clave_empleado: clave, password_temporal: passwordTemporal });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe personal con esa CURP o ese correo electrónico' });
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function actualizar(req, res) {
  const b = req.body;
  const error = validar(b, { parcial: true });
  if (error) return res.status(400).json({ error });

  const permitidos = ['nombres', 'apellido_paterno', 'apellido_materno', 'curp', 'correo_electronico', 'telefono',
    'calle', 'numero_exterior', 'colonia', 'municipio', 'estado', 'codigo_postal'];
  const sets = [];
  const valores = [];
  for (const c of permitidos) {
    if (b[c] !== undefined) {
      sets.push(`${c} = ?`);
      valores.push(c === 'curp' ? String(b[c]).toUpperCase().trim() : b[c]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
  valores.push(req.params.id);

  try {
    const [r] = await pool.query(`UPDATE personal SET ${sets.join(', ')} WHERE id_personal = ?`, valores);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Personal no encontrado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Esa CURP o ese correo ya pertenece a otra persona' });
    throw err;
  }
  await registrarBitacora(req.user.id_usuario, 'ACTUALIZAR_PERSONAL', `Actualizó personal id ${req.params.id}`);
  res.json({ mensaje: 'Actualizado correctamente' });
}

async function eliminar(req, res) {
  const [rows] = await pool.query('SELECT id_usuario FROM personal WHERE id_personal = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Personal no encontrado' });
  try {
    // Al borrar el usuario, el personal se borra por ON DELETE CASCADE
    await pool.query('DELETE FROM usuario WHERE id_usuario = ?', [rows[0].id_usuario]);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'No se puede eliminar: tiene horarios o asistencias registradas' });
    }
    throw err;
  }
  await registrarBitacora(req.user.id_usuario, 'ELIMINAR_PERSONAL', `Eliminó personal id ${req.params.id}`);
  res.json({ mensaje: 'Eliminado correctamente' });
}

module.exports = { listar, obtener, crear, actualizar, eliminar };

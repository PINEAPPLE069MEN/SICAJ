const pool = require('../config/db');
const { registrarBitacora } = require('../middleware/bitacora');

async function listar(req, res) {
  const [rows] = await pool.query(
    `SELECT m.*, g.nombre AS grado_nombre, g.nivel_educativo
     FROM materia m
     JOIN grado g ON g.id_grado = m.id_grado
     ORDER BY m.id_materia DESC`
  );
  res.json(rows);
}

async function obtener(req, res) {
  const [rows] = await pool.query(
    `SELECT m.*, g.nombre AS grado_nombre, g.nivel_educativo
     FROM materia m
     JOIN grado g ON g.id_grado = m.id_grado
     WHERE m.id_materia = ?`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Materia no encontrada' });
  res.json(rows[0]);
}

async function crear(req, res) {
  const nombre = req.body.nombre || req.body.nombre_materia;
  const id_grado = req.body.id_grado || req.body.grado;
  const es_taller = req.body.es_taller !== undefined ? req.body.es_taller : req.body.esTaller;

  if (!nombre || !id_grado) {
    return res.status(400).json({ error: 'El nombre y el grado son obligatorios' });
  }

  const [duplicada] = await pool.query(
    'SELECT id_materia FROM materia WHERE nombre = ? AND id_grado = ?',
    [nombre, id_grado]
  );
  if (duplicada.length > 0) {
    return res.status(409).json({ error: 'Ya existe una materia con ese nombre para ese grado' });
  }

  const valorTaller = (es_taller === true || es_taller === 1 || es_taller === '1') ? 1 : 0;
  const [result] = await pool.query(
    'INSERT INTO materia (nombre, id_grado, es_taller) VALUES (?, ?, ?)',
    [nombre, id_grado, valorTaller]
  );
  await registrarBitacora(req.user.id_usuario, 'CREAR_MATERIA', `Creó materia id ${result.insertId}`);
  res.status(201).json({ id_materia: result.insertId, nombre, id_grado, es_taller: valorTaller });
}

async function actualizar(req, res) {
  const { nombre, id_grado, es_taller } = req.body;
  const sets = [];
  const valores = [];
  if (nombre !== undefined) { sets.push('nombre = ?'); valores.push(nombre); }
  if (id_grado !== undefined) { sets.push('id_grado = ?'); valores.push(id_grado); }
  if (es_taller !== undefined) { sets.push('es_taller = ?'); valores.push(es_taller ? 1 : 0); }
  if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

  valores.push(req.params.id);
  const [result] = await pool.query(`UPDATE materia SET ${sets.join(', ')} WHERE id_materia = ?`, valores);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Materia no encontrada' });

  await registrarBitacora(req.user.id_usuario, 'ACTUALIZAR_MATERIA', `Actualizó materia id ${req.params.id}`);
  res.json({ mensaje: 'Materia actualizada' });
}

async function eliminar(req, res) {
  const [result] = await pool.query('DELETE FROM materia WHERE id_materia = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Materia no encontrada' });

  await registrarBitacora(req.user.id_usuario, 'ELIMINAR_MATERIA', `Eliminó materia id ${req.params.id}`);
  res.json({ mensaje: 'Materia eliminada' });
}

module.exports = { listar, obtener, crear, actualizar, eliminar };

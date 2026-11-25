const pool = require('../config/db');
const { registrarBitacora } = require('../middleware/bitacora');

async function listar(req, res) {
  const [rows] = await pool.query(
    `SELECT gr.*, gd.nombre AS grado_nombre, c.nombre AS ciclo_nombre
     FROM grupo gr
     JOIN grado gd ON gd.id_grado = gr.id_grado
     JOIN ciclo_escolar c ON c.id_ciclo = gr.id_ciclo
     ORDER BY gr.id_grupo DESC`
  );
  res.json(rows);
}

async function obtener(req, res) {
  const [rows] = await pool.query(
    `SELECT gr.*, gd.nombre AS grado_nombre, c.nombre AS ciclo_nombre
     FROM grupo gr
     JOIN grado gd ON gd.id_grado = gr.id_grado
     JOIN ciclo_escolar c ON c.id_ciclo = gr.id_ciclo
     WHERE gr.id_grupo = ?`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
  res.json(rows[0]);
}

async function crear(req, res) {
  const id_grado = req.body.id_grado || req.body.grado;
  const letra = req.body.letra || req.body.grupo;
  const turno = req.body.turno;
  const id_ciclo = req.body.id_ciclo || req.body.ciclo_id;

  if (!id_grado || !letra || !turno || !id_ciclo) {
    return res.status(400).json({ error: 'Grado, letra, turno y ciclo escolar son obligatorios' });
  }

  const [duplicado] = await pool.query(
    'SELECT id_grupo FROM grupo WHERE id_grado = ? AND letra = ? AND turno = ? AND id_ciclo = ?',
    [id_grado, letra, turno, id_ciclo]
  );
  if (duplicado.length > 0) {
    return res.status(409).json({ error: 'Ya existe un grupo con ese grado, letra y turno en ese ciclo escolar' });
  }

  const [result] = await pool.query(
    'INSERT INTO grupo (id_grado, letra, turno, id_ciclo) VALUES (?, ?, ?, ?)',
    [id_grado, letra, turno, id_ciclo]
  );
  await registrarBitacora(req.user.id_usuario, 'CREAR_GRUPO', `Creó grupo id ${result.insertId}`);
  res.status(201).json({ id_grupo: result.insertId, id_grado, letra, turno, id_ciclo });
}

async function actualizar(req, res) {
  const campos = ['id_grado', 'letra', 'turno', 'id_ciclo'];
  const sets = [];
  const valores = [];
  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      sets.push(`${campo} = ?`);
      valores.push(req.body[campo]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

  valores.push(req.params.id);
  const [result] = await pool.query(`UPDATE grupo SET ${sets.join(', ')} WHERE id_grupo = ?`, valores);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Grupo no encontrado' });

  await registrarBitacora(req.user.id_usuario, 'ACTUALIZAR_GRUPO', `Actualizó grupo id ${req.params.id}`);
  res.json({ mensaje: 'Grupo actualizado' });
}

async function eliminar(req, res) {
  const [result] = await pool.query('DELETE FROM grupo WHERE id_grupo = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Grupo no encontrado' });

  await registrarBitacora(req.user.id_usuario, 'ELIMINAR_GRUPO', `Eliminó grupo id ${req.params.id}`);
  res.json({ mensaje: 'Grupo eliminado' });
}

module.exports = { listar, obtener, crear, actualizar, eliminar };

const pool = require('../config/db');
const { registrarBitacora } = require('../middleware/bitacora');

/**
 * Genera un controlador CRUD completo para una tabla "catálogo" (sin lógica
 * de negocio especial): grupo, ciclo_escolar, materia, etc.
 */
function crearCrudSimple({ tabla, idCampo, camposPermitidos, etiqueta }) {
  async function listar(req, res) {
    const [rows] = await pool.query(`SELECT * FROM ${tabla} ORDER BY ${idCampo} DESC`);
    res.json(rows);
  }

  async function obtener(req, res) {
    const [rows] = await pool.query(`SELECT * FROM ${tabla} WHERE ${idCampo} = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  }

  async function crear(req, res) {
    const columnas = [];
    const valores = [];
    const marcadores = [];

    for (const campo of camposPermitidos) {
      if (req.body[campo] === undefined || req.body[campo] === '') {
        return res.status(400).json({ error: `El campo "${campo}" es obligatorio` });
      }
      columnas.push(campo);
      valores.push(req.body[campo]);
      marcadores.push('?');
    }

    const [result] = await pool.query(
      `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores.join(', ')})`,
      valores
    );

    await registrarBitacora(req.user.id_usuario, `CREAR_${etiqueta}`, `Creó ${tabla} id ${result.insertId}`);
    res.status(201).json({ [idCampo]: result.insertId, ...req.body });
  }

  async function actualizar(req, res) {
    const sets = [];
    const valores = [];

    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) {
        sets.push(`${campo} = ?`);
        valores.push(req.body[campo]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

    valores.push(req.params.id);
    const [result] = await pool.query(`UPDATE ${tabla} SET ${sets.join(', ')} WHERE ${idCampo} = ?`, valores);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'No encontrado' });

    await registrarBitacora(req.user.id_usuario, `ACTUALIZAR_${etiqueta}`, `Actualizó ${tabla} id ${req.params.id}`);
    res.json({ mensaje: 'Actualizado correctamente' });
  }

  async function eliminar(req, res) {
    const [result] = await pool.query(`DELETE FROM ${tabla} WHERE ${idCampo} = ?`, [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'No encontrado' });

    await registrarBitacora(req.user.id_usuario, `ELIMINAR_${etiqueta}`, `Eliminó ${tabla} id ${req.params.id}`);
    res.json({ mensaje: 'Eliminado correctamente' });
  }

  return { listar, obtener, crear, actualizar, eliminar };
}

module.exports = crearCrudSimple;

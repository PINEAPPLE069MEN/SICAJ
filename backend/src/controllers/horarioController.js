const pool = require('../config/db');
const { registrarBitacora } = require('../middleware/bitacora');

// LISTAR HORARIOS (GET /horarios)
const listar = async (req, res) => {
  try {
    let query = `
      SELECT 
        h.id_horario,
        h.id_docente,
        h.id_materia,
        h.id_grupo,
        h.dia_semana,
        h.hora_inicio,
        h.hora_fin,
        COALESCE(p.nombres, '') AS docente_nombres,
        COALESCE(p.apellido_paterno, '') AS docente_apellido,
        COALESCE(m.nombre, 'Jornada administrativa') AS materia_nombre,
        COALESCE(g.letra, '') AS letra,
        COALESCE(g.turno, '') AS turno
      FROM horario_clase h
      LEFT JOIN personal p ON p.id_personal = h.id_docente
      LEFT JOIN materia m ON m.id_materia = h.id_materia
      LEFT JOIN grupo g ON g.id_grupo = h.id_grupo
    `;
    const params = [];

    const rolUsuario = req.user?.nombre_rol || req.user?.rol;
    if (rolUsuario === 'Docente' || rolUsuario === 'Administrativo') {
      // El personal solo ve su propio horario (h.id_docente es el id de la tabla personal, no el del usuario)
      query += ' WHERE h.id_docente = (SELECT id_personal FROM personal WHERE id_usuario = ?)';
      params.push(req.user.id_usuario);
    }

    // Usar comillas simples para valores string en MySQL
    query += " ORDER BY FIELD(h.dia_semana, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'), h.hora_inicio";

    const [rows] = await pool.query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error('ERROR SQL EXACTO EN LISTAR HORARIOS:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// CREAR HORARIO (POST /horarios)
const crear = async (req, res) => {
  try {
    const id_docente = req.body.id_docente || req.body.id_personal;
    const { id_materia, id_grupo, dia_semana, hora_inicio, hora_fin } = req.body;

    if (!id_docente || !dia_semana || !hora_inicio || !hora_fin) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para registrar la clase' });
    }

    // Personal Administrativo: la "clase" es su jornada, sin materia ni grupo
    const [rolRows] = await pool.query(
      `SELECT r.nombre_rol FROM personal p JOIN usuario u ON u.id_usuario = p.id_usuario
       JOIN rol r ON r.id_rol = u.id_rol WHERE p.id_personal = ?`, [id_docente]);
    if (rolRows.length === 0) return res.status(404).json({ error: 'La persona seleccionada no existe' });
    const esAdministrativo = rolRows[0].nombre_rol === 'Administrativo';
    if (!esAdministrativo && (!id_materia || !id_grupo)) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para registrar la clase' });
    }

    if (hora_fin <= hora_inicio) {
      return res.status(400).json({ error: 'La hora de fin debe ser posterior a la hora de inicio' });
    }

    const [conflicto] = await pool.query(
      `SELECT id_horario, id_docente, id_grupo FROM horario_clase
       WHERE dia_semana = ?
       AND (? < hora_fin AND ? > hora_inicio)
       AND (id_docente = ? OR id_grupo = ?)`,
      [dia_semana, hora_inicio, hora_fin, id_docente, esAdministrativo ? null : id_grupo]
    );

    if (conflicto.length > 0) {
      const choque = conflicto[0];
      if (String(choque.id_docente) === String(id_docente)) {
        return res.status(409).json({ error: `El docente ya tiene una clase asignada el ${dia_semana} en ese horario` });
      }
      return res.status(409).json({ error: `El grupo ya tiene una clase asignada el ${dia_semana} en ese horario` });
    }

    const [result] = await pool.query(
      'INSERT INTO horario_clase (id_docente, id_materia, id_grupo, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)',
      [id_docente, esAdministrativo ? null : id_materia, esAdministrativo ? null : id_grupo, dia_semana, hora_inicio, hora_fin]
    );

    if (typeof registrarBitacora === 'function' && req.user) {
      await registrarBitacora(req.user.id_usuario, 'CREAR_HORARIO', `Asignó clase id ${result.insertId} para docente ${id_docente}`);
    }

    return res.status(201).json({ id_horario: result.insertId, mensaje: 'Clase asignada exitosamente' });
  } catch (err) {
    console.error('Error al crear horario:', err);
    return res.status(500).json({ error: 'Error al registrar el horario en el servidor' });
  }
};

// ACTUALIZAR HORARIO (PUT /horarios/:id)
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const id_docente = req.body.id_docente || req.body.id_personal;
    const { id_materia, id_grupo, dia_semana, hora_inicio, hora_fin } = req.body;

    if (!id_docente || !id_materia || !id_grupo || !dia_semana || !hora_inicio || !hora_fin) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para actualizar' });
    }

    if (hora_fin <= hora_inicio) {
      return res.status(400).json({ error: 'Rango de horario inválido' });
    }

    const [conflicto] = await pool.query(
      `SELECT id_horario FROM horario_clase
       WHERE dia_semana = ?
       AND (? < hora_fin AND ? > hora_inicio)
       AND (id_docente = ? OR id_grupo = ?)
       AND id_horario != ?`,
      [dia_semana, hora_inicio, hora_fin, id_docente, id_grupo, id]
    );

    if (conflicto.length > 0) {
      return res.status(409).json({ error: 'Existe un conflicto de horario con el docente o el grupo' });
    }

    const [result] = await pool.query(
      `UPDATE horario_clase SET id_docente=?, id_materia=?, id_grupo=?, dia_semana=?, hora_inicio=?, hora_fin=? WHERE id_horario=?`,
      [id_docente, id_materia, id_grupo, dia_semana, hora_inicio, hora_fin, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Horario no encontrado' });
    }

    if (typeof registrarBitacora === 'function' && req.user) {
      await registrarBitacora(req.user.id_usuario, 'ACTUALIZAR_HORARIO', `Actualizó horario id ${id}`);
    }

    return res.json({ mensaje: 'Horario actualizado correctamente' });
  } catch (err) {
    console.error('Error al actualizar horario:', err);
    return res.status(500).json({ error: 'Error al actualizar el horario' });
  }
};

// ELIMINAR HORARIO (DELETE /horarios/:id)
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM horario_clase WHERE id_horario = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Horario no encontrado' });
    }

    if (typeof registrarBitacora === 'function' && req.user) {
      await registrarBitacora(req.user.id_usuario, 'ELIMINAR_HORARIO', `Eliminó horario id ${id}`);
    }

    return res.json({ mensaje: 'Horario eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar horario:', err);
    return res.status(500).json({ error: 'Error al eliminar el horario' });
  }
};

module.exports = { listar, crear, actualizar, eliminar };
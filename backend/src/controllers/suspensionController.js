const pool = require('../config/db');
const { fechaLocal, fechaValida } = require('../utils/fechas');
const { suspensionActiva } = require('../utils/suspensiones');
const { registrarBitacora } = require('../middleware/bitacora');

async function catalogo(req, res) {
  const [rows] = await pool.query(
    `SELECT c.id_categoria, c.nombre AS categoria, m.id_motivo, m.nombre, m.descripcion
     FROM categoria_suspension c
     JOIN motivo_suspension m ON m.id_categoria = c.id_categoria
     ORDER BY c.id_categoria, m.id_motivo`
  );
  const grupos = [];
  for (const r of rows) {
    let g = grupos.find(x => x.id_categoria === r.id_categoria);
    if (!g) { g = { id_categoria: r.id_categoria, nombre: r.categoria, motivos: [] }; grupos.push(g); }
    g.motivos.push({ id_motivo: r.id_motivo, nombre: r.nombre, descripcion: r.descripcion });
  }
  res.json(grupos);
}

async function listar(req, res) {
  const [rows] = await pool.query(
    `SELECT s.id_suspension,
            DATE_FORMAT(s.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
            DATE_FORMAT(s.fecha_fin, '%Y-%m-%d') AS fecha_fin,
            DATEDIFF(s.fecha_fin, s.fecha_inicio) + 1 AS dias,
            s.observaciones, m.nombre AS motivo, c.nombre AS categoria,
            COALESCE(NULLIF(CONCAT_WS(' ', pe.nombres, pe.apellido_paterno), ''), u.identificador) AS registrado_por
     FROM suspension_clases s
     JOIN motivo_suspension m ON m.id_motivo = s.id_motivo
     JOIN categoria_suspension c ON c.id_categoria = m.id_categoria
     JOIN usuario u ON u.id_usuario = s.id_usuario_creador
     LEFT JOIN personal pe ON pe.id_usuario = s.id_usuario_creador
     ORDER BY s.fecha_inicio DESC, s.id_suspension DESC
     LIMIT 500`
  );
  const hoy = fechaLocal();
  res.json(rows.map(r => ({
    ...r,
    dias: Number(r.dias),
    estado: hoy < r.fecha_inicio ? 'Próxima' : hoy > r.fecha_fin ? 'Concluida' : 'Vigente'
  })));
}

async function hoy(req, res) {
  res.json({ suspension: await suspensionActiva(fechaLocal()) });
}

async function crear(req, res) {
  const { id_motivo, fecha_inicio, fecha_fin, observaciones } = req.body;
  if (!id_motivo) return res.status(400).json({ error: 'Seleccione el motivo de la suspensión' });
  if (!fechaValida(fecha_inicio) || !fechaValida(fecha_fin)) return res.status(400).json({ error: 'Las fechas no son válidas' });
  if (fecha_fin < fecha_inicio) return res.status(400).json({ error: 'La fecha final no puede ser anterior a la inicial' });
  const dias = (new Date(`${fecha_fin}T00:00:00`) - new Date(`${fecha_inicio}T00:00:00`)) / 86400000 + 1;
  if (dias > 366) return res.status(400).json({ error: 'La suspensión no puede durar más de un año' });
  const notas = String(observaciones || '').trim();
  if (notas.length > 255) return res.status(400).json({ error: 'Las observaciones no pueden pasar de 255 caracteres' });

  const [m] = await pool.query('SELECT nombre FROM motivo_suspension WHERE id_motivo = ?', [id_motivo]);
  if (m.length === 0) return res.status(400).json({ error: 'El motivo seleccionado no existe' });

  const [r] = await pool.query(
    `INSERT INTO suspension_clases (id_motivo, fecha_inicio, fecha_fin, observaciones, id_usuario_creador)
     VALUES (?, ?, ?, ?, ?)`,
    [id_motivo, fecha_inicio, fecha_fin, notas || null, req.user.id_usuario]
  );
  await registrarBitacora(req.user.id_usuario, 'CREAR_SUSPENSION', `Suspensión de clases (${m[0].nombre}) del ${fecha_inicio} al ${fecha_fin}`);
  res.status(201).json({ id_suspension: r.insertId, mensaje: 'Suspensión registrada' });
}

async function eliminar(req, res) {
  const [r] = await pool.query('DELETE FROM suspension_clases WHERE id_suspension = ?', [req.params.id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Suspensión no encontrada' });
  await registrarBitacora(req.user.id_usuario, 'ELIMINAR_SUSPENSION', `Eliminó la suspensión id ${req.params.id}`);
  res.json({ mensaje: 'Suspensión eliminada' });
}

module.exports = { catalogo, listar, hoy, crear, eliminar };

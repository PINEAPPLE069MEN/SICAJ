const pool = require('../config/db');

/**
 * Registra una acción en la tabla bitacora. Nunca debe tronar la petición
 * principal si falla, por eso solo se loguea el error en consola.
 */
async function registrarBitacora(id_usuario, accion, detalle) {
  try {
    await pool.query(
      'INSERT INTO bitacora (id_usuario, accion, detalle) VALUES (?, ?, ?)',
      [id_usuario, accion, detalle]
    );
  } catch (err) {
    console.error('No se pudo registrar en bitácora:', err.message);
  }
}

module.exports = { registrarBitacora };

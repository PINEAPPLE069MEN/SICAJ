const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { genNumeroControl, genPassword, genIdentificadorTutor } = require('../utils/generators');
const { registrarBitacora } = require('../middleware/bitacora');
const { validarCurp, validarCorreo, validarTelefono } = require('../utils/validators');

const CAMPOS_ALUMNO = [
  'nombres', 'apellido_paterno', 'apellido_materno', 'curp', 'sexo', 'fecha_nacimiento',
  'calle', 'numero_exterior', 'colonia', 'municipio', 'estado', 'codigo_postal', 'id_grupo'
];
const CAMPOS_TUTOR = [
  'tutor_nombres', 'tutor_apellido_paterno', 'tutor_apellido_materno', 'tutor_curp', 'tutor_parentesco',
  'tutor_telefono', 'tutor_correo_electronico', 'tutor_calle', 'tutor_numero_exterior', 'tutor_colonia',
  'tutor_municipio', 'tutor_estado', 'tutor_codigo_postal'
];

function validar(body) {
  for (const campo of [...CAMPOS_ALUMNO, ...CAMPOS_TUTOR]) {
    if (body[campo] === undefined || body[campo] === null || !String(body[campo]).trim()) {
      return 'Complete este campo';
    }
  }
  if (!validarCurp(body.curp)) return 'Ingrese una CURP válida de 18 caracteres';
  if (!validarCurp(body.tutor_curp)) return 'Ingrese una CURP válida de 18 caracteres para el tutor';
  if (!['M', 'F'].includes(body.sexo)) return 'Seleccione una opción';
  if (!body.fecha_nacimiento) return 'Seleccione una fecha de nacimiento';
  if (!['Padre', 'Madre', 'Tutor Legal'].includes(body.tutor_parentesco)) return 'Seleccione una opción';
  if (!validarTelefono(body.tutor_telefono)) return 'Ingrese un teléfono a 10 dígitos';
  if (!validarCorreo(body.tutor_correo_electronico)) return 'Ingrese un correo electrónico válido';
  if (!body.id_grupo) return 'Seleccione una opción';
  return null;
}

async function listar(req, res) {
  let query = `SELECT a.*, u.identificador, gd.nombre AS grado_nombre, g.letra, g.turno,
                      at.id_materia AS id_taller, mat.nombre AS taller_nombre
               FROM alumno a
               JOIN usuario u ON u.id_usuario = a.id_usuario
               LEFT JOIN grupo g ON g.id_grupo = a.id_grupo
               LEFT JOIN grado gd ON gd.id_grado = g.id_grado
               LEFT JOIN alumno_talleres at ON at.id_alumno = a.id_alumno
               LEFT JOIN materia mat ON mat.id_materia = at.id_materia`;
  const params = [];

  // Cada rol solo ve lo que le corresponde, sin importar lo que pida el frontend
  if (req.user.nombre_rol === 'Alumno') {
    query += ' WHERE a.id_usuario = ?';
    params.push(req.user.id_usuario);
  } else if (req.user.nombre_rol === 'Padre_Tutor') {
    query += ` JOIN alumno_padre ap ON ap.id_alumno = a.id_alumno
               JOIN padre_tutor pt ON pt.id_padre = ap.id_padre
               WHERE pt.id_usuario = ?`;
    params.push(req.user.id_usuario);
  }

  query += ' ORDER BY a.id_alumno DESC';
  const [rows] = await pool.query(query, params);
  res.json(rows);
}

async function obtener(req, res) {
  const [rows] = await pool.query(
    `SELECT a.*, u.identificador, gd.nombre AS grado_nombre, g.letra, g.turno,
            at.id_materia AS id_taller, mat.nombre AS taller_nombre
     FROM alumno a
     JOIN usuario u ON u.id_usuario = a.id_usuario
     LEFT JOIN grupo g ON g.id_grupo = a.id_grupo
     LEFT JOIN grado gd ON gd.id_grado = g.id_grado
     LEFT JOIN alumno_talleres at ON at.id_alumno = a.id_alumno
     LEFT JOIN materia mat ON mat.id_materia = at.id_materia
     WHERE a.id_alumno = ?`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Alumno no encontrado' });

  if (req.user.nombre_rol === 'Alumno' && rows[0].id_usuario !== req.user.id_usuario) {
    return res.status(403).json({ error: 'No tiene permiso para ver este alumno' });
  }
  res.json(rows[0]);
}

async function crear(req, res) {
  // ---------------------------------------------------------------------
  // NORMALIZACIÓN: Permite recibir el JSON tanto plano como anidado
  // ---------------------------------------------------------------------
  let b = { ...req.body };

  if (req.body.alumno) {
    b.nombres = req.body.alumno.nombre || req.body.alumno.nombres;
    b.apellido_paterno = req.body.alumno.apellido_paterno;
    b.apellido_materno = req.body.alumno.apellido_materno;
    b.curp = req.body.alumno.curp;
    b.sexo = req.body.alumno.sexo;
    b.fecha_nacimiento = req.body.alumno.fecha_nacimiento;
    b.calle = req.body.alumno.calle;
    b.numero_exterior = req.body.alumno.numero_exterior;
    b.colonia = req.body.alumno.colonia;
    b.municipio = req.body.alumno.municipio;
    b.estado = req.body.alumno.estado;
    b.codigo_postal = req.body.alumno.codigo_postal;
    b.id_grupo = req.body.id_grupo || req.body.grupo_id;
  }

  if (req.body.tutor) {
    b.tutor_nombres = req.body.tutor.nombre || req.body.tutor.nombres;
    b.tutor_apellido_paterno = req.body.tutor.apellido_paterno;
    b.tutor_apellido_materno = req.body.tutor.apellido_materno || '';
    b.tutor_curp = req.body.tutor.curp || ('TUTR' + (b.curp ? b.curp.substring(4) : '00000000004'));
    b.tutor_parentesco = req.body.tutor.parentesco;
    b.tutor_telefono = req.body.tutor.telefono;
    b.tutor_correo_electronico = req.body.tutor.correo || req.body.tutor.correo_electronico;
    b.tutor_calle = req.body.tutor.calle || b.calle;
    b.tutor_numero_exterior = req.body.tutor.numero_exterior || b.numero_exterior;
    b.tutor_colonia = req.body.tutor.colonia || b.colonia;
    b.tutor_municipio = req.body.tutor.municipio || b.municipio;
    b.tutor_estado = req.body.tutor.estado || b.estado;
    b.tutor_codigo_postal = req.body.tutor.codigo_postal || b.codigo_postal;
  }

  // Asignamos el objeto normalizado para que pase la validación interna
  req.body = b;

  const error = validar(req.body);
  if (error) return res.status(400).json({ error });

  const [rolAlumno] = await pool.query("SELECT id_rol FROM rol WHERE nombre_rol = 'Alumno'");
  const [rolTutor] = await pool.query("SELECT id_rol FROM rol WHERE nombre_rol = 'Padre_Tutor'");
  if (rolAlumno.length === 0 || rolTutor.length === 0) {
    return res.status(500).json({ error: 'Los roles Alumno/Padre_Tutor no están configurados en la BD' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Usuario + registro del alumno
    const numeroControl = genNumeroControl();
    const passAlumno = genPassword('Sice');
    const hashAlumno = await bcrypt.hash(passAlumno, 10);

    const [uAlumno] = await conn.query(
      'INSERT INTO usuario (identificador, password_hash, password_temporal, id_rol) VALUES (?, ?, 1, ?)',
      [numeroControl, hashAlumno, rolAlumno[0].id_rol]
    );

    const [insertAlumno] = await conn.query(
      `INSERT INTO alumno (id_usuario, numero_control, nombres, apellido_paterno, apellido_materno, curp, sexo,
        fecha_nacimiento, calle, numero_exterior, colonia, municipio, estado, codigo_postal, id_grupo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uAlumno.insertId, numeroControl, b.nombres, b.apellido_paterno, b.apellido_materno, b.curp, b.sexo,
        b.fecha_nacimiento, b.calle, b.numero_exterior, b.colonia, b.municipio, b.estado, b.codigo_postal, b.id_grupo]
    );

    const idNuevoAlumno = insertAlumno.insertId;

    // 2. Asignar taller/tecnología si se seleccionó uno
    if (b.id_taller) {
      await conn.query(
        'INSERT INTO alumno_talleres (id_alumno, id_materia) VALUES (?, ?)',
        [idNuevoAlumno, b.id_taller]
      );
    }

    // 3. Si el tutor ya existe (por CURP) se reutiliza; si no, se crea
    const [tutorExistente] = await conn.query('SELECT id_padre FROM padre_tutor WHERE curp = ?', [b.tutor_curp]);
    let idPadre;
    let passTutor = null;

    if (tutorExistente.length > 0) {
      idPadre = tutorExistente[0].id_padre;
    } else {
      passTutor = genPassword('Tutor');
      const hashTutor = await bcrypt.hash(passTutor, 10);
      const identificadorTutor = genIdentificadorTutor();

      const [uTutor] = await conn.query(
        'INSERT INTO usuario (identificador, password_hash, password_temporal, id_rol) VALUES (?, ?, 1, ?)',
        [identificadorTutor, hashTutor, rolTutor[0].id_rol]
      );

      const [insertTutor] = await conn.query(
        `INSERT INTO padre_tutor (id_usuario, nombres, apellido_paterno, apellido_materno, curp, parentesco,
          telefono, correo_electronico, calle, numero_exterior, colonia, municipio, estado, codigo_postal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uTutor.insertId, b.tutor_nombres, b.tutor_apellido_paterno, b.tutor_apellido_materno, b.tutor_curp,
          b.tutor_parentesco, b.tutor_telefono, b.tutor_correo_electronico, b.tutor_calle, b.tutor_numero_exterior,
          b.tutor_colonia, b.tutor_municipio, b.tutor_estado, b.tutor_codigo_postal]
      );
      idPadre = insertTutor.insertId;
    }

    // 4. Vincular alumno-tutor
    await conn.query('INSERT INTO alumno_padre (id_alumno, id_padre) VALUES (?, ?)', [idNuevoAlumno, idPadre]);

    await conn.commit();
    await registrarBitacora(req.user.id_usuario, 'CREAR_ALUMNO', `Inscribió a ${b.nombres} ${b.apellido_paterno} (${numeroControl})`);

    res.status(201).json({
      id_alumno: idNuevoAlumno,
      numero_control: numeroControl,
      password_alumno: passAlumno,
      id_padre: idPadre,
      password_tutor: passTutor || '(el tutor ya existía, no se generó una nueva contraseña)'
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Este alumno ya se encuentra registrado' });
    }
    throw err;
  } finally {
    conn.release();
  }
}


async function actualizar(req, res) {
  const campos = [
    'nombres', 'apellido_paterno', 'apellido_materno', 'sexo', 'fecha_nacimiento',
    'calle', 'numero_exterior', 'colonia', 'municipio', 'estado', 'codigo_postal', 'id_grupo'
  ];
  const sets = [];
  const valores = [];
  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      sets.push(`${campo} = ?`);
      valores.push(req.body[campo]);
    }
  }

  const idAlumno = req.params.id;

  if (sets.length > 0) {
    valores.push(idAlumno);
    const [result] = await pool.query(`UPDATE alumno SET ${sets.join(', ')} WHERE id_alumno = ?`, valores);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Alumno no encontrado' });
  }

  // Actualizar taller si viene en la petición
  if (req.body.id_taller !== undefined) {
    await pool.query('DELETE FROM alumno_talleres WHERE id_alumno = ?', [idAlumno]);
    if (req.body.id_taller) {
      await pool.query('INSERT INTO alumno_talleres (id_alumno, id_materia) VALUES (?, ?)', [idAlumno, req.body.id_taller]);
    }
  }

  await registrarBitacora(req.user.id_usuario, 'ACTUALIZAR_ALUMNO', `Actualizó alumno id ${idAlumno}`);
  res.json({ mensaje: 'Alumno actualizado' });
}

async function eliminar(req, res) {
  try {
    const [result] = await pool.query('DELETE FROM alumno WHERE id_alumno = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Alumno no encontrado' });

    await registrarBitacora(req.user.id_usuario, 'ELIMINAR_ALUMNO', `Eliminó alumno id ${req.params.id}`);
    res.json({ mensaje: 'Alumno eliminado' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'No se puede eliminar: este alumno tiene justificantes u otros registros asociados. Elimínalos primero antes de borrar al alumno.' });
    }
    throw err;
  }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
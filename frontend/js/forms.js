/* ================================================
   GRADOS, CICLOS, GRUPOS Y MATERIAS
   (en el HTML original estos botones no tenían onclick;
   aquí sí quedan conectados a la API real)
================================================= */
async function guardarGrado(boton) {
    const campos = ['grado-nombre', 'grado-nivel'];
    if (!requireFields(campos)) {
        showToast('Complete el nombre y el nivel educativo del grado.', 'error');
        return;
    }
    const payload = { nombre: val('grado-nombre'), nivel_educativo: val('grado-nivel') };

    await conEstadoCarga(boton, 'Guardando...', async () => {
        try {
            await apiFetch('/grados', { method: 'POST', body: JSON.stringify(payload) });
            showToast(`Grado "${payload.nombre}" registrado correctamente`, 'success');
            document.getElementById('grado-nombre').value = '';
            cargarCatalogos(); cargarListadosCatalogos();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

async function guardarCiclo(boton) {
    const campos = ['ciclo-nombre', 'ciclo-inicio', 'ciclo-fin'];
    if (!requireFields(campos)) {
        showToast('Complete nombre, fecha de inicio y fecha de fin del ciclo.', 'error');
        return;
    }
    const payload = {
        nombre: val('ciclo-nombre'),
        fecha_inicio: val('ciclo-inicio'),
        fecha_fin: val('ciclo-fin')
    };
    if (payload.fecha_fin <= payload.fecha_inicio) {
        showToast('La fecha de fin debe ser posterior a la fecha de inicio.', 'error');
        return;
    }

    await conEstadoCarga(boton, 'Guardando...', async () => {
        try {
            await apiFetch('/ciclos', { method: 'POST', body: JSON.stringify(payload) });
            showToast(`Ciclo "${payload.nombre}" registrado correctamente`, 'success');
            document.getElementById('ciclo-nombre').value = '';
            document.getElementById('ciclo-inicio').value = '';
            document.getElementById('ciclo-fin').value = '';
            cargarCatalogos(); cargarListadosCatalogos();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

async function guardarMateria(boton) {
    const campos = ['materia-nombre', 'materia-grado'];
    if (!requireFields(campos)) {
        showToast('Complete el nombre y grado de la materia.', 'error');
        return;
    }
    const payload = {
        nombre: val('materia-nombre'),
        id_grado: val('materia-grado'),
        es_taller: document.getElementById('materia-es-taller') ? (document.getElementById('materia-es-taller').checked ? 1 : 0) : 0
    };

    await conEstadoCarga(boton, 'Guardando...', async () => {
        try {
            await apiFetch('/materias', { method: 'POST', body: JSON.stringify(payload) });
            showToast(`Materia "${payload.nombre}" registrada correctamente`, 'success');
            document.getElementById('materia-nombre').value = '';
            const chkTaller = document.getElementById('materia-es-taller');
            if (chkTaller) chkTaller.checked = false;
            cargarCatalogos(); cargarListadosCatalogos();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

async function crearGrupo(boton) {
    const campos = ['grupo-grado', 'grupo-letra', 'grupo-turno', 'grupo-ciclo'];
    if (!requireFields(campos)) {
        showToast('Complete grado, letra, turno y ciclo escolar del grupo.', 'error');
        return;
    }
    const payload = {
        id_grado: val('grupo-grado'),
        letra: val('grupo-letra').toUpperCase(),
        turno: val('grupo-turno'),
        id_ciclo: val('grupo-ciclo')
    };

    await conEstadoCarga(boton, 'Guardando...', async () => {
        try {
            await apiFetch('/grupos', { method: 'POST', body: JSON.stringify(payload) });
            showToast(`Grupo "${payload.letra}" creado correctamente`, 'success');
            document.getElementById('grupo-letra').value = '';
            cargarCatalogos(); cargarListadosCatalogos();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

// Atajo rápido para marcar todos los días
function seleccionarDiasAtajo(tipo) {
    const checks = document.querySelectorAll('input[name="h-dias"]');
    const todosMarcados = Array.from(checks).every(c => c.checked);
    checks.forEach(c => c.checked = !todosMarcados);
}

/* ================================================
   ASIGNAR HORARIO MULTI-DÍA
================================================= */
async function guardarHorario(boton) {
    // Validar campos base
    const campos = ['h-docente', 'h-materia', 'h-grupo', 'h-inicio', 'h-fin'];
    if (!requireFields(campos)) {
        showToast('Complete docente, materia, grupo y las horas de clase.', 'error');
        return;
    }

    // Obtener todos los días seleccionados
    const diasSeleccionados = Array.from(document.querySelectorAll('input[name="h-dias"]:checked'))
                                   .map(cb => cb.value);

    if (diasSeleccionados.length === 0) {
        showToast('Seleccione al menos un día de la semana.', 'error');
        return;
    }

    const hInicio = val('h-inicio');
    const hFin = val('h-fin');

    if (hInicio >= hFin) {
        showToast('La hora de inicio debe ser anterior a la hora de fin.', 'error');
        document.getElementById('h-inicio').focus();
        return;
    }

    const basePayload = {
        id_personal: val('h-docente'),
        id_materia: val('h-materia'),
        id_grupo: val('h-grupo'),
        hora_inicio: hInicio,
        hora_fin: hFin
    };

    await conEstadoCarga(boton, 'Asignando días...', async () => {
        try {
            // Envía las asignaciones en paralelo para cada día marcado
            const peticiones = diasSeleccionados.map(dia => 
                apiFetch('/horarios', {
                    method: 'POST',
                    body: JSON.stringify({ ...basePayload, dia_semana: dia })
                })
            );

            await Promise.all(peticiones);

            showToast(`Horario asignado exitosamente para ${diasSeleccionados.length} día(s).`, 'success');

            // Desmarcar días y limpiar horas (dejando docente/grupo por si vas a meter su siguiente materia)
            document.querySelectorAll('input[name="h-dias"]').forEach(c => c.checked = false);
            document.getElementById('h-inicio').value = '';
            document.getElementById('h-fin').value = '';

            if (typeof cargarListaHorarios === 'function') {
                cargarListaHorarios();
            }
        } catch (err) {
            showToast('Error al guardar: ' + err.message, 'error');
        }
    });
}

/* ================================================
   UTILIDADES INTERNAS DE VALIDACIÓN (FRONTEND)
================================================= */
const FormVal = {
    soloLetras: (txt) => /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]{2,40}$/.test((txt || '').trim()),
    curp: (txt) => /^[A-Z]{4}\d{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/.test((txt || '').trim().toUpperCase()),
    email: (txt) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((txt || '').trim()),
    telefono: (txt) => /^\d{10}$/.test((txt || '').trim()),
    cp: (txt) => /^\d{5}$/.test((txt || '').trim()),
    fechaPasada: (str) => {
        if (!str) return false;
        const f = new Date(str);
        return !isNaN(f.getTime()) && f <= new Date();
    }
};

/* ================================================
   INSCRIPCIÓN DE ALUMNOS (crea alumno + tutor en el backend)
================================================= */
async function guardarAlumno(boton) {
    const camposAlumno = ['al-nombres', 'al-ap-pat', 'al-ap-mat', 'al-curp', 'al-sexo', 'al-nacimiento',
        'al-calle', 'al-num', 'al-colonia', 'al-municipio', 'al-estado', 'al-cp', 'al-grupo'];
    const camposTutor = ['tu-nombres', 'tu-ap-pat', 'tu-ap-mat', 'tu-curp', 'tu-parentesco', 'tu-tel', 'tu-email',
        'tu-calle', 'tu-num', 'tu-colonia', 'tu-municipio', 'tu-estado', 'tu-cp'];

    // 1. Campos obligatorios completos
    if (!requireFields([...camposAlumno, ...camposTutor])) {
        showToast('Por favor complete todos los campos obligatorios del alumno y tutor.', 'error');
        return;
    }

    // 2. Validaciones de Formato y Reglas de Negocio - Alumno
    if (!FormVal.soloLetras(val('al-nombres'))) {
        showToast('El nombre del alumno solo debe contener letras (mínimo 2 caracteres).', 'error');
        document.getElementById('al-nombres').focus();
        return;
    }
    if (!FormVal.soloLetras(val('al-ap-pat'))) {
        showToast('El apellido paterno del alumno solo debe contener letras.', 'error');
        document.getElementById('al-ap-pat').focus();
        return;
    }
    if (val('al-ap-mat') && !FormVal.soloLetras(val('al-ap-mat'))) {
        showToast('El apellido materno del alumno solo debe contener letras.', 'error');
        document.getElementById('al-ap-mat').focus();
        return;
    }
    if (!FormVal.curp(val('al-curp'))) {
        showToast('La CURP del alumno no es válida (18 caracteres con estructura reglamentaria).', 'error');
        document.getElementById('al-curp').focus();
        return;
    }
    if (!FormVal.fechaPasada(val('al-nacimiento'))) {
        showToast('La fecha de nacimiento no puede ser futura ni inválida.', 'error');
        document.getElementById('al-nacimiento').focus();
        return;
    }
    if (!FormVal.soloLetras(val('al-municipio'))) {
        showToast('El municipio del alumno solo debe contener letras.', 'error');
        document.getElementById('al-municipio').focus();
        return;
    }
    if (!FormVal.soloLetras(val('al-estado'))) {
        showToast('El estado del alumno solo debe contener letras.', 'error');
        document.getElementById('al-estado').focus();
        return;
    }
    if (!FormVal.cp(val('al-cp'))) {
        showToast('El código postal del alumno debe tener exactamente 5 dígitos numéricos.', 'error');
        document.getElementById('al-cp').focus();
        return;
    }

    // 3. Validaciones de Formato y Reglas de Negocio - Tutor
    if (!FormVal.soloLetras(val('tu-nombres'))) {
        showToast('El nombre del tutor solo debe contener letras.', 'error');
        document.getElementById('tu-nombres').focus();
        return;
    }
    if (!FormVal.soloLetras(val('tu-ap-pat'))) {
        showToast('El apellido paterno del tutor solo debe contener letras.', 'error');
        document.getElementById('tu-ap-pat').focus();
        return;
    }
    if (val('tu-ap-mat') && !FormVal.soloLetras(val('tu-ap-mat'))) {
        showToast('El apellido materno del tutor solo debe contener letras.', 'error');
        document.getElementById('tu-ap-mat').focus();
        return;
    }
    if (!FormVal.curp(val('tu-curp'))) {
        showToast('La CURP del tutor no es válida.', 'error');
        document.getElementById('tu-curp').focus();
        return;
    }
    if (val('al-curp').trim().toUpperCase() === val('tu-curp').trim().toUpperCase()) {
        showToast('La CURP del alumno y la del tutor no pueden ser idénticas.', 'error');
        document.getElementById('tu-curp').focus();
        return;
    }
    if (!FormVal.telefono(val('tu-tel'))) {
        showToast('El teléfono del tutor debe tener exactamente 10 dígitos numéricos.', 'error');
        document.getElementById('tu-tel').focus();
        return;
    }
    if (!FormVal.email(val('tu-email'))) {
        showToast('El correo electrónico del tutor no tiene un formato válido (ej. correo@dominio.com).', 'error');
        document.getElementById('tu-email').focus();
        return;
    }
    if (!FormVal.soloLetras(val('tu-municipio'))) {
        showToast('El municipio del tutor solo debe contener letras.', 'error');
        document.getElementById('tu-municipio').focus();
        return;
    }
    if (!FormVal.soloLetras(val('tu-estado'))) {
        showToast('El estado del tutor solo debe contener letras.', 'error');
        document.getElementById('tu-estado').focus();
        return;
    }
    if (!FormVal.cp(val('tu-cp'))) {
        showToast('El código postal del tutor debe tener exactamente 5 dígitos numéricos.', 'error');
        document.getElementById('tu-cp').focus();
        return;
    }

    const payload = {
        nombres: val('al-nombres').trim(),
        apellido_paterno: val('al-ap-pat').trim(),
        apellido_materno: val('al-ap-mat').trim(),
        curp: val('al-curp').toUpperCase().trim(),
        sexo: val('al-sexo'),
        fecha_nacimiento: val('al-nacimiento'),
        calle: val('al-calle').trim(),
        numero_exterior: val('al-num').trim(),
        colonia: val('al-colonia').trim(),
        municipio: val('al-municipio').trim(),
        estado: val('al-estado').trim(),
        codigo_postal: val('al-cp').trim(),
        id_grupo: val('al-grupo'),
        id_taller: val('al-taller') || null,

        tutor_nombres: val('tu-nombres').trim(),
        tutor_apellido_paterno: val('tu-ap-pat').trim(),
        tutor_apellido_materno: val('tu-ap-mat').trim(),
        tutor_curp: val('tu-curp').toUpperCase().trim(),
        tutor_parentesco: val('tu-parentesco'),
        tutor_telefono: val('tu-tel').trim(),
        tutor_correo_electronico: val('tu-email').trim(),
        tutor_calle: val('tu-calle').trim(),
        tutor_numero_exterior: val('tu-num').trim(),
        tutor_colonia: val('tu-colonia').trim(),
        tutor_municipio: val('tu-municipio').trim(),
        tutor_estado: val('tu-estado').trim(),
        tutor_codigo_postal: val('tu-cp').trim()
    };

    await conEstadoCarga(boton, 'Guardando...', async () => {
        try {
            const data = await apiFetch('/alumnos', { method: 'POST', body: JSON.stringify(payload) });
            showModal('Registro Exitoso — Alumno e Inscripción', [
                { label: 'Alumno', value: `${payload.nombres} ${payload.apellido_paterno}` },
                { label: 'Número de Control', value: data.numero_control },
                { label: 'Contraseña Alumno', value: data.password_alumno },
                { label: 'Tutor', value: `${payload.tutor_nombres} ${payload.tutor_apellido_paterno}` },
                { label: 'Contraseña Tutor', value: data.password_tutor }
            ]);
            limpiarFormularioAlumno();
            cargarListaAlumnos();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

function limpiarFormularioAlumno() {
    ['al-nombres', 'al-ap-pat', 'al-ap-mat', 'al-curp', 'al-nacimiento', 'al-calle', 'al-num', 'al-colonia', 'al-municipio',
     'al-estado', 'al-cp', 'al-grupo', 'al-taller', 'tu-nombres', 'tu-ap-pat', 'tu-ap-mat', 'tu-curp', 'tu-tel',
     'tu-email', 'tu-calle', 'tu-num', 'tu-colonia', 'tu-municipio', 'tu-estado', 'tu-cp'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const sexo = document.getElementById('al-sexo');
    if (sexo) sexo.selectedIndex = 0;
    const parentesco = document.getElementById('tu-parentesco');
    if (parentesco) parentesco.selectedIndex = 0;
}

/* ================================================
   REGISTRO DE PERSONAL
================================================= */
async function guardarPersonal(boton) {
    const campos = ['pe-nombres', 'pe-ap-pat', 'pe-ap-mat', 'pe-curp', 'pe-email', 'pe-tel', 'pe-rol',
        'pe-calle', 'pe-num', 'pe-colonia', 'pe-municipio', 'pe-estado', 'pe-cp'];

    // 1. Campos obligatorios
    if (!requireFields(campos)) {
        showToast('Por favor complete todos los campos obligatorios del personal.', 'error');
        return;
    }

    // 2. Validaciones de Formato y Reglas de Negocio
    if (!FormVal.soloLetras(val('pe-nombres'))) {
        showToast('El nombre solo debe contener letras.', 'error');
        document.getElementById('pe-nombres').focus();
        return;
    }
    if (!FormVal.soloLetras(val('pe-ap-pat'))) {
        showToast('El apellido paterno solo debe contener letras.', 'error');
        document.getElementById('pe-ap-pat').focus();
        return;
    }
    if (val('pe-ap-mat') && !FormVal.soloLetras(val('pe-ap-mat'))) {
        showToast('El apellido materno solo debe contener letras.', 'error');
        document.getElementById('pe-ap-mat').focus();
        return;
    }
    if (!FormVal.curp(val('pe-curp'))) {
        showToast('La CURP ingresada no es válida (debe tener 18 caracteres reglamentarios).', 'error');
        document.getElementById('pe-curp').focus();
        return;
    }
    if (!FormVal.email(val('pe-email'))) {
        showToast('El correo electrónico no es válido (ej. usuario@escuela.edu.mx).', 'error');
        document.getElementById('pe-email').focus();
        return;
    }
    if (!FormVal.telefono(val('pe-tel'))) {
        showToast('El teléfono debe tener exactamente 10 dígitos numéricos.', 'error');
        document.getElementById('pe-tel').focus();
        return;
    }
    if (!FormVal.soloLetras(val('pe-municipio'))) {
        showToast('El municipio solo debe contener letras.', 'error');
        document.getElementById('pe-municipio').focus();
        return;
    }
    if (!FormVal.soloLetras(val('pe-estado'))) {
        showToast('El estado solo debe contener letras.', 'error');
        document.getElementById('pe-estado').focus();
        return;
    }
    if (!FormVal.cp(val('pe-cp'))) {
        showToast('El código postal debe tener exactamente 5 dígitos numéricos.', 'error');
        document.getElementById('pe-cp').focus();
        return;
    }

    const payload = {
        nombres: val('pe-nombres').trim(),
        apellido_paterno: val('pe-ap-pat').trim(),
        apellido_materno: val('pe-ap-mat').trim(),
        curp: val('pe-curp').toUpperCase().trim(),
        correo_electronico: val('pe-email').trim(),
        telefono: val('pe-tel').trim(),
        rol: val('pe-rol'),
        calle: val('pe-calle').trim(),
        numero_exterior: val('pe-num').trim(),
        colonia: val('pe-colonia').trim(),
        municipio: val('pe-municipio').trim(),
        estado: val('pe-estado').trim(),
        codigo_postal: val('pe-cp').trim()
    };

    await conEstadoCarga(boton, 'Guardando...', async () => {
        try {
            const data = await apiFetch('/personal', { method: 'POST', body: JSON.stringify(payload) });
            showModal('Personal Registrado Correctamente', [
                { label: 'Nombre', value: `${payload.nombres} ${payload.apellido_paterno}` },
                { label: 'Rol', value: payload.rol },
                { label: 'Clave de Empleado', value: data.clave_empleado },
                { label: 'Contraseña Temporal', value: data.password_temporal }
            ]);
            ['pe-nombres', 'pe-ap-pat', 'pe-ap-mat', 'pe-curp', 'pe-email', 'pe-tel', 'pe-calle', 'pe-num',
             'pe-colonia', 'pe-municipio', 'pe-estado', 'pe-cp'].forEach(id => { 
                const el = document.getElementById(id);
                if (el) el.value = ''; 
            });
            const rolSelect = document.getElementById('pe-rol');
            if (rolSelect) rolSelect.selectedIndex = 0;

            if (typeof cargarCatalogos === 'function') cargarCatalogos();
            if (typeof cargarListadosCatalogos === 'function') cargarListadosCatalogos();
            if (typeof cargarListaPersonal === 'function') cargarListaPersonal();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

/* ================================================
   LISTADO DE PERSONAL: editar / eliminar
================================================= */
async function eliminarPersonal(id, nombre) {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
    try {
        await apiFetch(`/personal/${id}`, { method: 'DELETE' });
        showToast('Personal eliminado correctamente', 'success');
        if (typeof cargarListaPersonal === 'function') cargarListaPersonal();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ================================================
   LISTADO DE ALUMNOS: editar / eliminar
================================================= */
async function eliminarAlumno(id, nombre) {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
    try {
        await apiFetch(`/alumnos/${id}`, { method: 'DELETE' });
        showToast('Alumno eliminado correctamente', 'success');
        if (typeof cargarListaAlumnos === 'function') cargarListaAlumnos();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ── Modal de edición genérico (compartido por Personal y Alumno) ── */
let edicionActual = null;

function cerrarModalEdicion() {
    const modal = document.getElementById('edit-modal');
    if (modal) modal.classList.remove('open');
    edicionActual = null;
}/* ================================================
   JUSTIFICANTES
================================================= */
async function solicitarJustificante(boton) {
    const campos = ['just-inicio', 'just-fin', 'just-motivo'];
    if (!requireFields(campos)) {
        showToast('Complete el motivo y el rango de fechas.', 'error');
        return;
    }
    const archivo = document.getElementById('just-evidencia').files[0];
    if (!archivo) {
        showToast('Debe adjuntar la evidencia (PDF, JPG o PNG) para poder solicitar el justificante.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('fecha_inicio', val('just-inicio'));
    formData.append('fecha_fin', val('just-fin'));
    formData.append('motivo', val('just-motivo'));
    formData.append('evidencia', archivo);

    await conEstadoCarga(boton, 'Enviando...', async () => {
        try {
            const data = await apiFetchForm('/justificantes', formData, { method: 'POST' });
            showModal('Justificante Solicitado', [
                { label: 'Folio generado', value: data.folio },
                { label: 'Estatus', value: data.estatus }
            ]);
            document.getElementById('just-motivo').value = '';
            document.getElementById('just-evidencia').value = '';
            cargarHistorialJustificantes();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

async function verEvidencia(id) {
    try {
        await abrirArchivoProtegido(`/justificantes/${id}/evidencia`);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ── helper corto ── */
function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

/* ================================================
   EDICIÓN GENÉRICA
================================================= */
function campoEdit(id, etiqueta, valor, tipo = 'text', extra = '') {
    return `<div class="form-group"><label>${etiqueta}</label><input type="${tipo}" id="${id}" value="${valor ?? ''}" ${extra}></div>`;
}
function selectEdit(id, etiqueta, opciones, seleccionado) {
    return `<div class="form-group"><label>${etiqueta}</label><select id="${id}">${
        opciones.map(o => `<option value="${o.v}" ${String(o.v) === String(seleccionado) ? 'selected' : ''}>${o.t}</option>`).join('')
    }</select></div>`;
}
function abrirModalEdicion(titulo, html) {
    document.getElementById('edit-modal-title').textContent = titulo;
    document.getElementById('edit-modal-body').innerHTML = html;
    document.getElementById('edit-modal').classList.add('open');
}

function abrirEdicionPersonal(id) {
    const p = listaPersonalCache.find(x => x.id_personal === id);
    if (!p) return;
    edicionActual = { tipo: 'personal', id };
    abrirModalEdicion('Editar Personal',
        campoEdit('edit-nombres', 'Nombre(s)', p.nombres, 'text', 'maxlength="30"') +
        campoEdit('edit-ap-pat', 'Apellido Paterno', p.apellido_paterno, 'text', 'maxlength="30"') +
        campoEdit('edit-ap-mat', 'Apellido Materno', p.apellido_materno, 'text', 'maxlength="30"') +
        campoEdit('edit-curp', 'CURP', p.curp, 'text', 'maxlength="18"') +
        campoEdit('edit-correo', 'Correo Electrónico', p.correo_electronico, 'email', 'maxlength="50"') +
        campoEdit('edit-telefono', 'Teléfono', p.telefono, 'tel', 'maxlength="10"') +
        campoEdit('edit-calle', 'Calle', p.calle) +
        campoEdit('edit-num', 'Número Exterior', p.numero_exterior) +
        campoEdit('edit-colonia', 'Colonia', p.colonia) +
        campoEdit('edit-municipio', 'Municipio', p.municipio) +
        campoEdit('edit-estado', 'Estado', p.estado) +
        campoEdit('edit-cp', 'Código Postal', p.codigo_postal, 'text', 'maxlength="5"') +
        campoEdit('edit-clave', 'Clave de Empleado', p.clave_empleado, 'text', 'readonly') +
        campoEdit('edit-rol', 'Rol', p.nombre_rol, 'text', 'readonly'));
}

function abrirEdicionAlumno(id) {
    const a = listaAlumnosCache.find(x => x.id_alumno === id);
    if (!a) return;
    edicionActual = { tipo: 'alumno', id };
    const grupos = gruposCache.map(g => ({ v: g.id_grupo, t: `${g.grado_nombre}${g.letra} - ${g.turno}` }));
    
    // Opciones de talleres disponibles
    const talleres = (materiasCache || []).filter(m => m.es_taller == 1 || m.es_taller === true)
        .map(t => ({ v: t.id_materia, t: `${t.nombre} (${t.grado_nombre})` }));
    talleres.unshift({ v: '', t: '-- Sin taller asignado --' });

    abrirModalEdicion('Editar Alumno',
        campoEdit('edit-nombres', 'Nombre(s)', a.nombres, 'text', 'maxlength="30"') +
        campoEdit('edit-ap-pat', 'Apellido Paterno', a.apellido_paterno, 'text', 'maxlength="30"') +
        campoEdit('edit-ap-mat', 'Apellido Materno', a.apellido_materno, 'text', 'maxlength="30"') +
        selectEdit('edit-sexo', 'Sexo', [{ v: 'M', t: 'Masculino' }, { v: 'F', t: 'Femenino' }], a.sexo) +
        campoEdit('edit-nacimiento', 'Fecha de Nacimiento', String(a.fecha_nacimiento).slice(0, 10), 'date') +
        campoEdit('edit-calle', 'Calle', a.calle) +
        campoEdit('edit-num', 'Número Exterior', a.numero_exterior) +
        campoEdit('edit-colonia', 'Colonia', a.colonia) +
        campoEdit('edit-municipio', 'Municipio', a.municipio) +
        campoEdit('edit-estado', 'Estado', a.estado) +
        campoEdit('edit-cp', 'Código Postal', a.codigo_postal, 'text', 'maxlength="5"') +
        selectEdit('edit-grupo', 'Grupo', grupos, a.id_grupo) +
        selectEdit('edit-taller', 'Taller / Tecnología', talleres, a.id_taller || '') +
        campoEdit('edit-control', 'Número de Control', a.numero_control, 'text', 'readonly') +
        campoEdit('edit-curp', 'CURP', a.curp, 'text', 'readonly'));
}

function abrirEdicionCatalogo(tipo, id) {
    edicionActual = { tipo, id };
    if (tipo === 'grado') {
        const g = gradosCache.find(x => x.id_grado === id);
        abrirModalEdicion('Editar Grado', campoEdit('edit-nombre', 'Nombre', g.nombre, 'text', 'maxlength="10"') +
            campoEdit('edit-nivel', 'Nivel Educativo', g.nivel_educativo, 'text', 'maxlength="20"'));
    } else if (tipo === 'ciclo') {
        const c = ciclosCache.find(x => x.id_ciclo === id);
        abrirModalEdicion('Editar Ciclo Escolar', campoEdit('edit-nombre', 'Nombre', c.nombre, 'text', 'maxlength="20"') +
            campoEdit('edit-inicio', 'Fecha Inicio', String(c.fecha_inicio).slice(0, 10), 'date') +
            campoEdit('edit-fin', 'Fecha Fin', String(c.fecha_fin).slice(0, 10), 'date'));
    } else if (tipo === 'materia') {
        const m = materiasCache.find(x => x.id_materia === id);
        const checkTaller = `<div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:10px;">
            <input type="checkbox" id="edit-es-taller" ${m.es_taller ? 'checked' : ''} style="width:18px;height:18px;">
            <label for="edit-es-taller" style="margin:0;">¿Es Taller / Tecnología?</label>
        </div>`;
        abrirModalEdicion('Editar Materia', campoEdit('edit-nombre', 'Nombre', m.nombre, 'text', 'maxlength="40"') +
            selectEdit('edit-grado', 'Grado', gradosCache.map(g => ({ v: g.id_grado, t: g.nombre })), m.id_grado) + checkTaller);
    } else if (tipo === 'grupo') {
        const g = gruposCache.find(x => x.id_grupo === id);
        abrirModalEdicion('Editar Grupo',
            selectEdit('edit-grado', 'Grado', gradosCache.map(x => ({ v: x.id_grado, t: x.nombre })), g.id_grado) +
            campoEdit('edit-letra', 'Letra', g.letra, 'text', 'maxlength="1"') +
            selectEdit('edit-turno', 'Turno', [{ v: 'Matutino', t: 'Matutino' }, { v: 'Vespertino', t: 'Vespertino' }], g.turno) +
            selectEdit('edit-ciclo', 'Ciclo Escolar', ciclosCache.map(x => ({ v: x.id_ciclo, t: x.nombre })), g.id_ciclo));
    }
}

async function eliminarCatalogo(ruta, id, texto) {
    if (!confirm(`¿Eliminar ${texto}? Esta acción no se puede deshacer.`)) return;
    try {
        await apiFetch(`/${ruta}/${id}`, { method: 'DELETE' });
        showToast('Eliminado correctamente', 'success');
        cargarCatalogos(); cargarListadosCatalogos();
    } catch (err) {
        showToast(err.message.includes('foreign key') ? 'No se puede eliminar: tiene registros asociados.' : err.message, 'error');
    }
}

function abrirEdicionHorario(id) {
    const h = listaHorariosCache.find(x => x.id_horario === id);
    if (!h) return;
    edicionActual = { tipo: 'horario', id };
    const opt = (sel) => Array.from(document.getElementById(sel).options).filter(o => o.value).map(o => ({ v: o.value, t: o.text }));
    abrirModalEdicion('Editar Horario',
        selectEdit('edit-docente', 'Docente', opt('h-docente'), h.id_docente) +
        selectEdit('edit-materia', 'Materia', opt('h-materia'), h.id_materia) +
        selectEdit('edit-grupo', 'Grupo', opt('h-grupo'), h.id_grupo) +
        selectEdit('edit-dia', 'Día', ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map(d => ({ v: d, t: d })), h.dia_semana) +
        campoEdit('edit-inicio', 'Hora de inicio', String(h.hora_inicio).slice(0, 5), 'time') +
        campoEdit('edit-fin', 'Hora de fin', String(h.hora_fin).slice(0, 5), 'time'));
}

async function eliminarHorario(id) {
    if (!confirm('¿Eliminar este horario? Esta acción no se puede deshacer.')) return;
    try {
        await apiFetch(`/horarios/${id}`, { method: 'DELETE' });
        showToast('Horario eliminado', 'success');
        cargarListaHorarios();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function guardarEdicion(boton) {
    if (!edicionActual) return;
    const { tipo, id } = edicionActual;

    await conEstadoCarga(boton, 'Guardando...', async () => {
        try {
            if (tipo === 'personal') {
                await apiFetch(`/personal/${id}`, { method: 'PUT', body: JSON.stringify({
                    nombres: val('edit-nombres'), apellido_paterno: val('edit-ap-pat'), apellido_materno: val('edit-ap-mat'),
                    curp: val('edit-curp').toUpperCase(), correo_electronico: val('edit-correo'), telefono: val('edit-telefono'),
                    calle: val('edit-calle'), numero_exterior: val('edit-num'), colonia: val('edit-colonia'),
                    municipio: val('edit-municipio'), estado: val('edit-estado'), codigo_postal: val('edit-cp')
                }) });
                cargarListaPersonal();
            } else if (tipo === 'alumno') {
                await apiFetch(`/alumnos/${id}`, { method: 'PUT', body: JSON.stringify({
                    nombres: val('edit-nombres'), apellido_paterno: val('edit-ap-pat'), apellido_materno: val('edit-ap-mat'),
                    sexo: val('edit-sexo'), fecha_nacimiento: val('edit-nacimiento'),
                    calle: val('edit-calle'), numero_exterior: val('edit-num'), colonia: val('edit-colonia'),
                    municipio: val('edit-municipio'), estado: val('edit-estado'), codigo_postal: val('edit-cp'),
                    id_grupo: val('edit-grupo'),
                    id_taller: val('edit-taller') || null
                }) });
                cargarListaAlumnos();
            } else if (tipo === 'grado') {
                await apiFetch(`/grados/${id}`, { method: 'PUT', body: JSON.stringify({ nombre: val('edit-nombre'), nivel_educativo: val('edit-nivel') }) });
            } else if (tipo === 'ciclo') {
                if (val('edit-fin') <= val('edit-inicio')) throw new Error('Verifique las fechas capturadas');
                await apiFetch(`/ciclos/${id}`, { method: 'PUT', body: JSON.stringify({ nombre: val('edit-nombre'), fecha_inicio: val('edit-inicio'), fecha_fin: val('edit-fin') }) });
            } else if (tipo === 'materia') {
                const esTaller = document.getElementById('edit-es-taller') ? (document.getElementById('edit-es-taller').checked ? 1 : 0) : 0;
                await apiFetch(`/materias/${id}`, { method: 'PUT', body: JSON.stringify({ nombre: val('edit-nombre'), id_grado: val('edit-grado'), es_taller: esTaller }) });
            } else if (tipo === 'grupo') {
                await apiFetch(`/grupos/${id}`, { method: 'PUT', body: JSON.stringify({
                    id_grado: val('edit-grado'), letra: val('edit-letra').toUpperCase(), turno: val('edit-turno'), id_ciclo: val('edit-ciclo')
                }) });
            } else if (tipo === 'horario') {
                await apiFetch(`/horarios/${id}`, { method: 'PUT', body: JSON.stringify({
                    id_docente: val('edit-docente'), id_materia: val('edit-materia'), id_grupo: val('edit-grupo'),
                    dia_semana: val('edit-dia'), hora_inicio: val('edit-inicio'), hora_fin: val('edit-fin')
                }) });
                cargarListaHorarios();
            }
            showToast('Cambios guardados correctamente', 'success');
            if (['grado', 'ciclo', 'materia', 'grupo'].includes(tipo)) { cargarCatalogos(); cargarListadosCatalogos(); }
            cerrarModalEdicion();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

/* ================================================
   JUSTIFICANTES: historial, bandeja con ✓ / ✗ y corrección de resolución
================================================= */
function badgeEstatus(estatus) {
    const colores = { Pendiente: '#e6a700', Aprobado: '#27ae60', Rechazado: '#b21f1f' };
    return `<span class="badge-estatus" style="background:${colores[estatus] || '#999'}">${estatus}</span>`;
}

async function cargarHistorialJustificantes() {
    const tbody = document.getElementById('justificantes-historial-tbody');
    if (!tbody) return;
    try {
        const registros = await apiFetch('/justificantes');
        tbody.innerHTML = registros.map(r => `
            <tr>
                <td>${r.folio}</td>
                <td>${r.nombres} ${r.apellido_paterno}</td>
                <td>${badgeEstatus(r.estatus)}</td>
                <td>${String(r.fecha_inicio).slice(0, 10)}</td>
                <td>${r.comentario_resolucion || '—'}</td>
            </tr>`).join('') || '<tr><td colspan="5">Sin justificantes registrados</td></tr>';
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
    }
}

async function cargarBandejaJustificantes() {
    const tbody = document.getElementById('justificantes-bandeja-tbody');
    if (!tbody) return;
    const filtro = (document.getElementById('filtro-just-estatus') || {}).value;
    try {
        const registros = await apiFetch('/justificantes' + (filtro ? `?estatus=${filtro}` : ''));
        tbody.innerHTML = registros.map(r => `
            <tr>
                <td>${r.folio}</td>
                <td>${r.nombres} ${r.apellido_paterno}</td>
                <td>${String(r.fecha_inicio).slice(0, 10)} a ${String(r.fecha_fin).slice(0, 10)}</td>
                <td>${r.motivo}</td>
                <td>${badgeEstatus(r.estatus)}</td>
                <td>${r.comentario_resolucion || '—'}</td>
                <td class="tabla-acciones">
                    <button class="btn btn-accent" style="padding:6px 10px;font-size:0.8rem;" onclick="verEvidencia(${r.id_justificante})">Evidencia</button>
                    <button class="icon-btn aprobar" title="Aprobar" ${r.estatus === 'Aprobado' ? 'disabled' : ''} onclick="resolverJustificante(this, ${r.id_justificante}, 'Aprobado')">✓</button>
                    <button class="icon-btn rechazar" title="Rechazar" ${r.estatus === 'Rechazado' ? 'disabled' : ''} onclick="resolverJustificante(this, ${r.id_justificante}, 'Rechazado')">✗</button>
                </td>
            </tr>`).join('') || '<tr><td colspan="7">Sin justificantes registrados</td></tr>';
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7">${err.message}</td></tr>`;
    }
}

async function resolverJustificante(boton, id, estatus) {
    const accion = estatus === 'Aprobado' ? 'aprobar' : 'rechazar';
    const comentario = prompt(`Comentario para ${accion} (opcional, puedes dejarlo vacío):`);
    if (comentario === null) return;
    await conEstadoCarga(boton, '...', async () => {
        try {
            await apiFetch(`/justificantes/${id}/resolver`, {
                method: 'PUT',
                body: JSON.stringify({ estatus, comentario: comentario.trim() })
            });
            showToast(`Justificante ${estatus === 'Aprobado' ? 'aprobado ✓' : 'rechazado ✗'}`, 'success');
            cargarBandejaJustificantes();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

/* ================================================
   REPORTES
================================================= */
async function generarReporte(boton) {
    const tipo = val('reporte-tipo');
    const inicio = val('fechaInicio');
    const fin = val('fechaFin');
    if (!tipo) { showToast('Seleccione un tipo de reporte', 'error'); return; }
    if (!inicio || !fin || fin < inicio) { showToast('Seleccione un rango de fechas válido', 'error'); return; }

    await conEstadoCarga(boton, 'Generando PDF...', async () => {
        try {
            const url = await obtenerBlobProtegido(`/reportes/pdf?tipo=${tipo}&fecha_inicio=${inicio}&fecha_fin=${fin}`);
            const nombreTipo = document.getElementById('reporte-tipo').selectedOptions[0].text;
            abrirModalPdf(`Reporte: ${nombreTipo}`, url, `reporte_${tipo}_${inicio}_${fin}.pdf`);
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

/* ================================================
   PERFIL: cambio de contraseña
================================================= */
async function cambiarPassword(boton) {
    const actual = val('perfil-pass-actual');
    const nueva = val('perfil-pass-nueva');
    const confirmacion = val('perfil-pass-confirmar');

    if (!actual) { showToast('Ingrese su contraseña actual correctamente', 'error'); return; }
    if (nueva.length < 8) { showToast('La contraseña debe tener al menos 8 caracteres', 'error'); return; }
    if (nueva !== confirmacion) { showToast('Las contraseñas no coinciden', 'error'); return; }

    await conEstadoCarga(boton, 'Guardando...', async () => {
        try {
            await apiFetch('/auth/password', {
                method: 'PUT',
                body: JSON.stringify({ password_actual: actual, password_nueva: nueva, password_confirmar: confirmacion })
            });
            showToast('Contraseña actualizada correctamente', 'success');
            ['perfil-pass-actual', 'perfil-pass-nueva', 'perfil-pass-confirmar'].forEach(i => { document.getElementById(i).value = ''; });
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}
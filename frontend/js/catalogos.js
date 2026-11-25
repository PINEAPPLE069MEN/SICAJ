
/* ── CATÁLOGOS DINÁMICOS ── */
let listaPersonalCache = [];
let listaAlumnosCache = [];
let gruposCache = [];
let gradosCache = [];
let ciclosCache = [];
let materiasCache = [];

function llenarSelect(id, items, getValue, getLabel, placeholder = '-- Seleccione --') {
    const select = document.getElementById(id);
    if (!select) return;
    const seleccionActual = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>` +
        items.map(item => `<option value="${getValue(item)}">${getLabel(item)}</option>`).join('');
    if (seleccionActual) select.value = seleccionActual;
}

async function cargarCatalogos() {
    const usuario = getUsuario();
    if (!usuario) return;

    try {
        const [grados, grupos, materias, ciclos] = await Promise.all([
            apiFetch('/grados'),
            apiFetch('/grupos'),
            apiFetch('/materias'),
            apiFetch('/ciclos')
        ]);
        gradosCache = grados;
        gruposCache = grupos;
        materiasCache = materias;
        ciclosCache = ciclos;

        llenarSelect('materia-grado', grados, g => g.id_grado, g => g.nombre);
        llenarSelect('grupo-grado', grados, g => g.id_grado, g => g.nombre);
        llenarSelect('grupo-ciclo', ciclos, c => c.id_ciclo, c => c.nombre);

        llenarSelect('h-grupo', grupos, g => g.id_grupo, g => `${g.grado_nombre} ${g.letra} - ${g.turno}`);
        llenarSelect('al-grupo', grupos, g => g.id_grupo, g => `${g.grado_nombre} ${g.letra} - ${g.turno}`, '-- Seleccione un grupo --');
        llenarSelect('h-materia', materias, m => m.id_materia, m => `${m.nombre} (${m.grado_nombre})`);

        const talleres = materias.filter(m => m.es_taller == 1 || m.es_taller === true);
        llenarSelect('al-taller', talleres, t => t.id_materia, t => `${t.nombre} (${t.grado_nombre})`, '-- Sin taller asignado / Opcional --');
    } catch (err) {
        console.error('No se pudieron cargar catálogos:', err.message);
    }

    if (typeof cargarTiposReporte === 'function') cargarTiposReporte();
    
    const rolActual = usuario.rol || usuario.nombre_rol;
    const esAdminODirectivo = ['Administrador', 'Director', 'Subdirector', 'Directivo'].includes(rolActual);

    if (typeof cargarListadosCatalogos === 'function' && esAdminODirectivo) {
        cargarListadosCatalogos();
    }
    if (typeof cargarListaHorarios === 'function' && (esAdminODirectivo || rolActual === 'Docente')) {
        cargarListaHorarios();
    }

    if (esAdminODirectivo) {
        try {
            const personal = await apiFetch('/personal');
            const plantilla = personal.filter(p => ['Docente', 'Administrativo'].includes(p.nombre_rol));
            llenarSelect('h-docente', plantilla, p => p.id_personal,
                p => `${p.nombres} ${p.apellido_paterno}${p.nombre_rol === 'Administrativo' ? ' (Administrativo)' : ''}`,
                '-- Seleccione una persona --');
            // Se recuerda el rol de cada opción: al personal Administrativo se le asigna una jornada, sin materia ni grupo
            const roles = Object.fromEntries(plantilla.map(p => [String(p.id_personal), p.nombre_rol]));
            document.querySelectorAll('#h-docente option').forEach(o => { if (roles[o.value]) o.dataset.rol = roles[o.value]; });
        } catch (err) {
            console.error('No se pudo cargar la lista de docentes:', err.message);
        }
        cargarListaPersonal();
        cargarListaAlumnos();
    }

    if (esAdminODirectivo) {
        cargarBandejaJustificantes();
    } else {
        cargarHistorialJustificantes();
    }
}

async function cargarListaPersonal() {
    const tbody = document.getElementById('personal-tbody');
    if (!tbody) return;
    try {
        listaPersonalCache = await apiFetch('/personal');
        renderTablaPersonal(listaPersonalCache);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
    }
}

function renderTablaPersonal(lista) {
    const tbody = document.getElementById('personal-tbody');
    if (!tbody) return;
    tbody.innerHTML = lista.map(p => `
        <tr>
            <td>${p.clave_empleado}</td>
            <td>${p.nombres} ${p.apellido_paterno}</td>
            <td>${p.nombre_rol}</td>
            <td>${p.correo_electronico || '—'}</td>
            <td class="tabla-acciones">
                <button class="btn btn-accent" style="padding:6px 10px;font-size:0.8rem;" onclick="abrirEdicionPersonal(${p.id_personal})">Editar</button>
                <button class="btn btn-secondary" style="padding:6px 10px;font-size:0.8rem;" onclick="eliminarPersonal(${p.id_personal}, '${escaparComillas(p.nombres + ' ' + p.apellido_paterno)}')">Eliminar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5">Sin personal registrado</td></tr>';
}

function filtrarTablaPersonal() {
    const q = val('personal-buscar').toLowerCase();
    renderTablaPersonal(listaPersonalCache.filter(p =>
        `${p.nombres} ${p.apellido_paterno} ${p.apellido_materno} ${p.clave_empleado}`.toLowerCase().includes(q)
    ));
}

async function cargarListaAlumnos() {
    const tbody = document.getElementById('alumnos-tbody');
    if (!tbody) return;
    try {
        listaAlumnosCache = await apiFetch('/alumnos');
        renderTablaAlumnos(listaAlumnosCache);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
    }
}

function renderTablaAlumnos(lista) {
    const tbody = document.getElementById('alumnos-tbody');
    if (!tbody) return;
    // Sin el permiso alumnos.gestionar (p. ej. el Docente) la lista es de solo lectura: sin columna ni botones de Editar/Eliminar
    const gestiona = tienePermiso('alumnos.gestionar');
    const thAcciones = document.getElementById('alumnos-th-acciones');
    if (thAcciones) thAcciones.style.display = gestiona ? '' : 'none';
    tbody.innerHTML = lista.map(a => `
        <tr>
            <td>${a.numero_control}</td>
            <td>${a.nombres} ${a.apellido_paterno}</td>
            <td>${a.grado_nombre ? `${a.grado_nombre} ${a.letra} - ${a.turno}` : '—'}</td>
            <td>${a.taller_nombre || 'Sin taller'}</td>
            ${gestiona ? `<td class="tabla-acciones">
                <button class="btn btn-accent" style="padding:6px 10px;font-size:0.8rem;" onclick="abrirEdicionAlumno(${a.id_alumno})">Editar</button>
                <button class="btn btn-secondary" style="padding:6px 10px;font-size:0.8rem;" onclick="eliminarAlumno(${a.id_alumno}, '${escaparComillas(a.nombres + ' ' + a.apellido_paterno)}')">Eliminar</button>
            </td>` : ''}
        </tr>
    `).join('') || `<tr><td colspan="${gestiona ? 5 : 4}">Sin alumnos registrados</td></tr>`;
}

function filtrarTablaAlumnos() {
    const q = val('alumnos-buscar').toLowerCase();
    renderTablaAlumnos(listaAlumnosCache.filter(a =>
        `${a.nombres} ${a.apellido_paterno} ${a.apellido_materno} ${a.numero_control} ${a.taller_nombre || ''}`.toLowerCase().includes(q)
    ));
}

function escaparComillas(texto) {
    return String(texto).replace(/'/g, '');
}

function fechaDMA(iso) {
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
}
function mostrarBloque(id, visible) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
}

async function cargarDashboard() {
    const usuario = getUsuario();
    if (!usuario) return;
    const esDocente = (usuario.rol || usuario.nombre_rol) === 'Docente';
    // El Docente ve el panel con SUS estadísticas; el resto, el de la escuela si tiene el permiso panel.ver
    if (!esDocente && !tienePermiso('panel.ver')) return;
    mostrarBloque('panel-escuela', !esDocente);
    mostrarBloque('panel-docente', esDocente);
    try {
        const d = await apiFetch('/dashboard');
        mostrarAvisoSuspension(d.suspension_hoy);
        if (esDocente) renderPanelDocente(d); else renderPanelEscuela(d);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderPanelEscuela(d) {
    document.getElementById('stat-alumnos').textContent = d.total_alumnos;
    document.getElementById('stat-docentes').textContent = d.docentes_activos;
    document.getElementById('stat-grupos').textContent = d.total_grupos;
    document.getElementById('stat-inas-hoy').textContent = d.inasistencias_hoy;
    document.getElementById('stat-ret-hoy').textContent = d.retardos_hoy;
    document.getElementById('stat-inas-semana').textContent = d.inasistencias_semana;
    const rango = document.getElementById('chart-semana-rango');
    if (rango) rango.textContent = `Semana del ${fechaDMA(d.semana.desde)} a hoy (${fechaDMA(d.semana.hasta)})`;
    initCharts(d.incidencias_docentes, d.justificantes_alumnos);
}

function renderPanelDocente(d) {
    document.getElementById('doc-asistencias').textContent = d.semana.asistencias;
    document.getElementById('doc-retardos').textContent = d.semana.retardos;
    document.getElementById('doc-inasistencias').textContent = d.semana.inasistencias;
    document.getElementById('doc-rango').textContent = `Semana del ${fechaDMA(d.semana.desde)} al ${fechaDMA(d.semana.hasta)}`;
    const cicloTxt = document.getElementById('doc-ciclo-texto');
    cicloTxt.textContent = d.ciclo
        ? `Ciclo escolar ${d.ciclo.nombre}: ${d.ciclo.asistencias} a tiempo · ${d.ciclo.retardos} retardo(s) · ${d.ciclo.inasistencias} inasistencia(s)`
        : 'No hay un ciclo escolar vigente registrado.';
    initGraficaDocentePersonal(d.semana, d.ciclo);

    document.getElementById('doc-semana-tbody').innerHTML = d.dias.map(x => `
        <tr>
            <td>${x.dia}<br><small>${fechaDMA(x.fecha)}</small></td>
            <td>${x.jornada ? `${x.jornada.inicio} - ${x.jornada.fin}` : '—'}</td>
            <td>${x.hora_entrada || '—'}</td>
            <td>${badgeAsistencia(x.estatus)}${x.automatica && x.estatus === 'INASISTENCIA' ? '<br><small>sin escanear el QR</small>' : ''}</td>
        </tr>`).join('');

    const tbodyJ = document.getElementById('doc-justif-tbody');
    tbodyJ.innerHTML = d.justificantes_aprobados.length
        ? d.justificantes_aprobados.map(j => `
            <tr class="${j.es_hoy ? 'fila-hoy' : ''}">
                <td>${j.dia} ${fechaDMA(j.fecha)}${j.es_hoy ? ' <span class="aq-badge warn">HOY</span>' : ''}</td>
                <td>${escHtmlUI(j.alumno)}<br><small>${escHtmlUI(j.numero_control)}</small></td>
                <td>${escHtmlUI(j.grupo)}</td>
                <td>${escHtmlUI(j.materia)}<br><small>${j.hora}</small></td>
            </tr>`).join('')
        : '<tr><td colspan="4">No hay justificantes aprobados para tus grupos en estos días.</td></tr>';
}

function escHtmlUI(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cargarPerfil() {
    const u = getUsuario();
    if (!u) return;
    const nombre = u.perfil ? `${u.perfil.nombres} ${u.perfil.apellido_paterno}` : u.identificador;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('perfil-nombre', nombre);
    set('perfil-identificador', u.identificador);
    set('perfil-rol', (u.rol || u.nombre_rol || '').replace('_', '/'));
}

const BTN_EDIT = 'class="btn btn-accent" style="padding:6px 10px;font-size:0.8rem;"';
const BTN_DEL = 'class="btn btn-secondary" style="padding:6px 10px;font-size:0.8rem;"';

async function cargarListadosCatalogos() {
    try {
        const [grados, ciclos, materias, grupos] = await Promise.all([
            apiFetch('/grados'), apiFetch('/ciclos'), apiFetch('/materias'), apiFetch('/grupos')
        ]);
        gradosCache = grados; ciclosCache = ciclos; materiasCache = materias; gruposCache = grupos;

        const tbodyGrados = document.getElementById('grados-tbody');
        if (tbodyGrados) {
            tbodyGrados.innerHTML = grados.map(g => `
                <tr><td>${g.nombre}</td><td>${g.nivel_educativo}</td><td class="tabla-acciones">
                    <button ${BTN_EDIT} onclick="abrirEdicionCatalogo('grado', ${g.id_grado})">Editar</button>
                    <button ${BTN_DEL} onclick="eliminarCatalogo('grados', ${g.id_grado}, 'este grado')">Eliminar</button>
                </td></tr>`).join('') || '<tr><td colspan="3">Sin grados registrados</td></tr>';
        }

        const tbodyCiclos = document.getElementById('ciclos-tbody');
        if (tbodyCiclos) {
            tbodyCiclos.innerHTML = ciclos.map(c => `
                <tr><td>${c.nombre}</td><td>${String(c.fecha_inicio).slice(0, 10)}</td><td>${String(c.fecha_fin).slice(0, 10)}</td><td class="tabla-acciones">
                    <button ${BTN_EDIT} onclick="abrirEdicionCatalogo('ciclo', ${c.id_ciclo})">Editar</button>
                    <button ${BTN_DEL} onclick="eliminarCatalogo('ciclos', ${c.id_ciclo}, 'este ciclo')">Eliminar</button>
                </td></tr>`).join('') || '<tr><td colspan="4">Sin ciclos registrados</td></tr>';
        }

        const tbodyMaterias = document.getElementById('materias-tbody');
        if (tbodyMaterias) {
            tbodyMaterias.innerHTML = materias.map(m => `
                <tr>
                    <td>${m.nombre} ${m.es_taller ? '<span style="color:#27ae60;font-weight:700;">(Taller)</span>' : ''}</td>
                    <td>${m.grado_nombre}</td>
                    <td class="tabla-acciones">
                        <button ${BTN_EDIT} onclick="abrirEdicionCatalogo('materia', ${m.id_materia})">Editar</button>
                        <button ${BTN_DEL} onclick="eliminarCatalogo('materias', ${m.id_materia}, 'esta materia')">Eliminar</button>
                    </td>
                </tr>`).join('') || '<tr><td colspan="3">Sin materias registradas</td></tr>';
        }

        const tbodyGrupos = document.getElementById('grupos-tbody');
        if (tbodyGrupos) {
            tbodyGrupos.innerHTML = grupos.map(g => `
                <tr><td>${g.grado_nombre}</td><td>${g.letra}</td><td>${g.turno}</td><td>${g.ciclo_nombre}</td><td class="tabla-acciones">
                    <button ${BTN_EDIT} onclick="abrirEdicionCatalogo('grupo', ${g.id_grupo})">Editar</button>
                    <button ${BTN_DEL} onclick="eliminarCatalogo('grupos', ${g.id_grupo}, 'este grupo')">Eliminar</button>
                </td></tr>`).join('') || '<tr><td colspan="5">Sin grupos registrados</td></tr>';
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}


/* ================================================
   MÓDULO DE HORARIOS INTERACTIVO (CLIC EN CELDA)
================================================= */
let listaHorariosCache = [];

// Sin el permiso horarios.gestionar (p. ej. el Docente) el calendario es de solo lectura
function horarioSoloLectura() {
    return !tienePermiso('horarios.gestionar');
}

async function cargarListaHorarios() {
    try {
        const data = await apiFetch('/horarios');
        listaHorariosCache = data || [];
        alCambiarDocenteActivo();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Error al cargar horarios: ' + err.message, 'error');
        }
    }
}

// Actualiza el título y el calendario según el docente elegido (o el propio horario si es solo lectura)
function alCambiarDocenteActivo() {
    const select = document.getElementById('h-docente');
    const titulo = document.getElementById('titulo-calendario-docente');
    const ayuda = document.getElementById('horario-ayuda');
    const soloLectura = horarioSoloLectura();
    if (ayuda) ayuda.style.display = soloLectura ? 'none' : '';
    if (titulo) {
        if (soloLectura) {
            titulo.textContent = listaHorariosCache.length ? 'Mi Horario Semanal' : 'Mi Horario Semanal — aún no tienes clases asignadas';
        } else {
            const nombre = select && select.value ? (select.options[select.selectedIndex]?.text || '') : '';
            titulo.textContent = nombre ? `Horario Semanal — ${nombre}` : 'Horario Semanal — selecciona un docente';
        }
    }
    renderizarCalendarioInteractivo();
}

function renderizarCalendarioInteractivo() {
    const tbody = document.getElementById('horario-semanal-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const soloLectura = horarioSoloLectura();
    const tabla = tbody.closest('table');
    if (tabla) tabla.classList.toggle('solo-lectura', soloLectura);
    const docenteSeleccionado = document.getElementById('h-docente')?.value || '';

    // Solo lectura: el servidor ya devuelve únicamente el horario de quien consulta.
    // Con permiso de gestión: sin docente seleccionado el calendario se muestra VACÍO.
    let horariosAMostrar = [];
    if (soloLectura) {
        horariosAMostrar = listaHorariosCache;
    } else if (docenteSeleccionado) {
        horariosAMostrar = listaHorariosCache.filter(h => String(h.id_docente) === String(docenteSeleccionado));
    }

    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const normalizar = (str) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Construcción de filas de 07:00 a 19:00
    for (let hora = 7; hora < 19; hora++) {
        const horaInicio = `${String(hora).padStart(2, '0')}:00:00`;
        const horaFin = `${String(hora + 1).padStart(2, '0')}:00:00`;
        const horaEtiqueta = `${String(hora).padStart(2, '0')}:00 - ${String(hora + 1).padStart(2, '0')}:00`;

        const tr = document.createElement('tr');

        // Columna de hora
        const tdHora = document.createElement('td');
        tdHora.className = 'horario-hora-col';
        tdHora.textContent = horaEtiqueta;
        tr.appendChild(tdHora);

        // Columnas por cada día
        dias.forEach(dia => {
            const tdDia = document.createElement('td');
            tdDia.className = 'celda-horario';

            // Buscar si existe una clase asignada en este día y bloque horario
            const clase = horariosAMostrar.find(h => {
                if (normalizar(h.dia_semana) !== normalizar(dia)) return false;
                
                // Extraer hora numérica inicial y final
                const hInicio = parseInt(String(h.hora_inicio).split(':')[0], 10);
                const hFin = parseInt(String(h.hora_fin).split(':')[0], 10);

                return hora >= hInicio && hora < hFin;
            });

            if (clase) {
                const nombreMateria = clase.materia_nombre || clase.materia || 'Clase';
                const grupoTxt = !clase.id_materia ? 'Administrativo' : (clase.letra ? `${clase.grado_nombre || ''} ${clase.letra}` : (clase.grupo || 'Grupo'));

                tdDia.innerHTML = `
                    <div class="clase-badge-click" ${soloLectura ? '' : 'title="Clic para eliminar esta clase"'}>
                        <strong>${nombreMateria}</strong>
                        <div class="sub-info">Grupo: ${grupoTxt}</div>
                        <div class="sub-info">${String(clase.hora_inicio).slice(0, 5)} - ${String(clase.hora_fin).slice(0, 5)}</div>
                    </div>
                `;
                if (!soloLectura) {
                    tdDia.onclick = (e) => {
                        e.stopPropagation();
                        clicEliminarClase(clase.id_horario, nombreMateria, dia, horaEtiqueta);
                    };
                }
            } else if (!soloLectura) {
                tdDia.title = `Clic para asignar clase el ${dia} (${horaEtiqueta})`;
                tdDia.onclick = () => clicAsignarClase(dia, horaInicio, horaFin);
            }

            tr.appendChild(tdDia);
        });

        tbody.appendChild(tr);
    }
}
// Asignar clase con un solo clic

async function clicAsignarClase(dia, horaInicio, horaFin) {
    if (horarioSoloLectura()) return;
    const usuario = typeof getUsuario === 'function' ? getUsuario() : null;
    const selectDocente = document.getElementById('h-docente');
    const selectMateria = document.getElementById('h-materia');
    const selectGrupo = document.getElementById('h-grupo');

    const idDocente = (usuario && usuario.nombre_rol === 'Docente') 
        ? (usuario.id_personal || usuario.id_usuario) 
        : selectDocente?.value;
        
    const idMateria = selectMateria?.value;
    const idGrupo = selectGrupo?.value;

    if (!idDocente) {
        showToast('Seleccione un Docente en la parte superior.', 'error');
        selectDocente?.focus();
        return;
    }
    const esAdministrativo = selectDocente?.selectedOptions[0]?.dataset.rol === 'Administrativo';
    if (!esAdministrativo && !idMateria) {
        showToast('Seleccione la Materia a impartir.', 'error');
        selectMateria?.focus();
        return;
    }
    if (!esAdministrativo && !idGrupo) {
        showToast('Seleccione el Grupo correspondiente.', 'error');
        selectGrupo?.focus();
        return;
    }

    // Enviar id_docente e id_personal para compatibilidad total
    const payload = {
        id_docente: parseInt(idDocente, 10),
        id_personal: parseInt(idDocente, 10),
        id_materia: esAdministrativo ? null : parseInt(idMateria, 10),
        id_grupo: esAdministrativo ? null : parseInt(idGrupo, 10),
        dia_semana: dia,
        hora_inicio: horaInicio.length === 5 ? `${horaInicio}:00` : horaInicio,
        hora_fin: horaFin.length === 5 ? `${horaFin}:00` : horaFin
    };

    try {
        await apiFetch('/horarios', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        showToast(`Asignado: ${dia} (${payload.hora_inicio.slice(0, 5)} - ${payload.hora_fin.slice(0, 5)})`, 'success');
        await cargarListaHorarios();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Remover clase con confirmación rápida
async function clicEliminarClase(idHorario, materia, dia, hora) {
    if (horarioSoloLectura()) return;
    if (!confirm(`¿Eliminar la clase de "${materia}" el ${dia} a las ${hora}?`)) return;
    try {
        await apiFetch(`/horarios/${idHorario}`, { method: 'DELETE' });
        showToast('Horario liberado', 'success');
        await cargarListaHorarios();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ── REPORTES: llena el selector "Tipo de Reporte" ──
   Esta función era llamada desde cargarCatalogos() pero nunca estuvo definida,
   por eso el selector se quedaba vacío y no se podía generar ningún reporte. */
async function cargarTiposReporte() {
    const usuario = getUsuario();
    const rol = usuario ? (usuario.rol || usuario.nombre_rol) : '';
    if (!['Administrador', 'Director', 'Subdirector', 'Directivo'].includes(rol)) return;
    try {
        const tipos = await apiFetch('/reportes/tipos');
        llenarSelect('reporte-tipo', tipos, t => t.id, t => t.nombre);
    } catch (err) {
        console.error('No se pudieron cargar los tipos de reporte:', err.message);
    }
}

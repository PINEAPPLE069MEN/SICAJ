/* ── NAVEGACIÓN ── */
const SECTION_TITLES = {
    'panel-control': 'Panel de Control',
    ciclos: 'Ciclos y Grupos',
    horarios: 'Horarios de Clase',
    personal: 'Personal Institucional',
    alumnos: 'Inscripción de Alumnos',
    asistencias: 'Asistencia por Código QR',
    justificantes: 'Gestión de Justificantes',
    reportes: 'Reportes',
    permisos: 'Control de Accesos y Permisos',
    suspensiones: 'Suspensión de Clases',
    perfil: 'Perfil de Usuario'
};

/* ── Utilidades de permisos/roles del usuario en sesión ── */
function tienePermiso(permiso) {
    const u = getUsuario();
    return !!(u && (u.permisos || []).includes(permiso));
}
function rolActualUsuario() {
    const u = getUsuario();
    return u ? (u.rol || u.nombre_rol || '') : '';
}

/* ── Limpieza de formularios y reinicio de pantallas ── */
function limpiarFormularios(contenedor) {
    contenedor.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
        else if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
    });
}

/** Ciclos y Grupos: siempre vuelve a la primera sub-pestaña (Ciclos Escolares) y con los formularios vacíos. */
function reiniciarSeccionCiclos() {
    const sec = document.getElementById('ciclos');
    if (!sec) return;
    sec.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    sec.querySelectorAll('.tab-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
    limpiarFormularios(sec);
}

let pestanaActual = null;

function showTab(tabId, evt) {
    evt = evt || window.event;
    if (typeof asistenciaQRSalir === 'function') asistenciaQRSalir(tabId);   // apaga monitor y cámara al cambiar de pestaña

    // Ciclos y Grupos se limpia al salir y se reinicia al entrar
    if (pestanaActual === 'ciclos' && tabId !== 'ciclos') reiniciarSeccionCiclos();
    if (tabId === 'ciclos') reiniciarSeccionCiclos();
    pestanaActual = tabId;
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    const targetSection = document.getElementById(tabId);
    if (targetSection) targetSection.classList.add('active');
    
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    }
    const titleEl = document.getElementById('section-title');
    if (titleEl) titleEl.textContent = SECTION_TITLES[tabId] || tabId;

    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('abierto');

    const usuario = getUsuario();
    const rolActual = usuario ? (usuario.rol || usuario.nombre_rol) : '';
    const esAdminODirectivo = ['Administrador', 'Director', 'Subdirector', 'Directivo'].includes(rolActual);

    if (tabId === 'justificantes' && usuario) {
        if (esAdminODirectivo) {
            cargarBandejaJustificantes();
        } else {
            cargarHistorialJustificantes();
        }
    }
    if (tabId === 'personal') cargarListaPersonal();
    if (tabId === 'panel-control') cargarDashboard();
    if (tabId === 'ciclos') cargarListadosCatalogos();
    if (tabId === 'horarios') cargarListaHorarios();
    if (tabId === 'perfil') cargarPerfil();
    if (tabId === 'asistencias') asistenciaQRInit();
    if (tabId === 'alumnos') cargarListaAlumnos();
    if (tabId === 'permisos') permInit();
    if (tabId === 'suspensiones') suspInit();
}

/* Muestra u oculta elementos según los permisos del usuario (data-permiso="a|b")
   o, si no tienen data-permiso, según su rol (data-roles). */
function aplicarPermisosPorRol(usuario, irAlInicio = true) {
    const rol = typeof usuario === 'string' ? usuario : usuario.rol;
    const permisos = new Set((usuario && usuario.permisos) || []);

    document.querySelectorAll('[data-roles], [data-permiso]').forEach(el => {
        // Si un elemento trae las dos reglas, se muestra cuando cumple cualquiera de ellas
        let visible = false;
        if (el.dataset.permiso) {
            visible = el.dataset.permiso.split('|').some(p => permisos.has(p.trim()));
        }
        if (!visible && el.dataset.roles) {
            const rolesPermitidos = el.dataset.roles.split(',').map(r => r.trim());
            if (rolesPermitidos.includes('Director') || rolesPermitidos.includes('Subdirector')) {
                rolesPermitidos.push('Directivo');
            }
            visible = rolesPermitidos.includes(rol);
        }
        el.style.display = visible ? '' : 'none';
    });

    ocultarEncabezadosVacios();

    if (irAlInicio) {
        const primerVisible = Array.from(document.querySelectorAll('.nav-link[data-roles], .nav-link[data-permiso]'))
            .find(link => link.style.display !== 'none');
        if (primerVisible) primerVisible.click();
    }
}

/** Oculta cada encabezado del menú (GENERAL, REGISTROS...) que se quedó sin ningún enlace visible debajo. */
function ocultarEncabezadosVacios() {
    document.querySelectorAll('#sidebar nav h4').forEach(h4 => {
        let hayVisible = false;
        for (let el = h4.nextElementSibling; el && el.tagName !== 'H4'; el = el.nextElementSibling) {
            if (el.matches('a.nav-link') && el.style.display !== 'none') { hayVisible = true; break; }
        }
        h4.style.display = hayVisible ? '' : 'none';
    });
}

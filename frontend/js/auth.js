/* ── LOGIN ── */
async function validateLogin(boton) {
    const identificador = document.getElementById('user').value;
    const password = document.getElementById('pass').value;
    const errorMsg = document.getElementById('error-msg');
    errorMsg.style.display = 'none';

    if (!identificador || !password) {
        errorMsg.textContent = 'Ingresa tu usuario y contraseña.';
        errorMsg.style.display = 'block';
        return;
    }

    await conEstadoCarga(boton, 'Entrando...', async () => {
        try {
            const data = await apiFetch('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ identificador, password })
            });
            guardarSesion(data.token, data.usuario);
            iniciarSesion(data.usuario);
        } catch (err) {
            errorMsg.textContent = err.message || 'Credenciales incorrectas.';
            errorMsg.style.display = 'block';
        }
    });
}

/* ── RECUPERACIÓN DE CONTRASEÑA ── */
function mostrarPanelLogin(cual) {
    ['login-panel', 'recup-paso1', 'recup-paso2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = id === cual ? '' : 'none';
    });
}
function mensajeRecuperacion(id, texto, tipo) {
    const el = document.getElementById(id);
    el.textContent = texto;
    el.className = `recup-msg ${tipo}`;
    el.style.display = texto ? 'block' : 'none';
}
function abrirRecuperacion(e) {
    if (e) e.preventDefault();
    document.getElementById('recup-user').value = document.getElementById('user').value || '';
    mensajeRecuperacion('recup-msg1', '', 'ok');
    mostrarPanelLogin('recup-paso1');
}
function cerrarRecuperacion(e) {
    if (e) e.preventDefault();
    mensajeRecuperacion('recup-msg1', '', 'ok');
    mensajeRecuperacion('recup-msg2', '', 'ok');
    ['recup-codigo', 'recup-pass1', 'recup-pass2'].forEach(id => { document.getElementById(id).value = ''; });
    mostrarPanelLogin('login-panel');
}
function irPasoCodigo(e) {
    if (e) e.preventDefault();
    document.getElementById('recup-user2').value = document.getElementById('recup-user').value || '';
    mensajeRecuperacion('recup-msg2', '', 'ok');
    mostrarPanelLogin('recup-paso2');
}

async function solicitarCodigoRecuperacion(boton) {
    const identificador = document.getElementById('recup-user').value.trim();
    const correo = document.getElementById('recup-correo').value.trim();
    if (!identificador || !correo) { mensajeRecuperacion('recup-msg1', 'Escribe tu usuario y el correo registrado.', 'error'); return; }
    await conEstadoCarga(boton, 'Enviando...', async () => {
        try {
            const r = await apiFetch('/auth/recuperar/solicitar', { method: 'POST', body: JSON.stringify({ identificador, correo }) });
            mensajeRecuperacion('recup-msg1', r.mensaje, 'ok');
            setTimeout(irPasoCodigo, 1800);
        } catch (err) {
            mensajeRecuperacion('recup-msg1', err.message || 'No se pudo enviar el código.', 'error');
        }
    });
}

async function confirmarRecuperacion(boton) {
    const identificador = document.getElementById('recup-user2').value.trim();
    const codigo = document.getElementById('recup-codigo').value.trim();
    const password = document.getElementById('recup-pass1').value;
    const confirmar = document.getElementById('recup-pass2').value;
    if (!identificador || !codigo || !password) { mensajeRecuperacion('recup-msg2', 'Completa todos los campos.', 'error'); return; }
    if (password.length < 8) { mensajeRecuperacion('recup-msg2', 'La contraseña debe tener al menos 8 caracteres.', 'error'); return; }
    if (password !== confirmar) { mensajeRecuperacion('recup-msg2', 'Las contraseñas no coinciden.', 'error'); return; }
    await conEstadoCarga(boton, 'Guardando...', async () => {
        try {
            const r = await apiFetch('/auth/recuperar/confirmar', { method: 'POST', body: JSON.stringify({ identificador, codigo, password }) });
            cerrarRecuperacion();
            document.getElementById('user').value = identificador;
            document.getElementById('pass').value = '';
            const err = document.getElementById('error-msg');
            err.style.color = 'var(--success)';
            err.textContent = r.mensaje;
            err.style.display = 'block';
            setTimeout(() => { err.style.color = 'var(--secondary)'; }, 8000);
        } catch (err) {
            mensajeRecuperacion('recup-msg2', err.message || 'No se pudo cambiar la contraseña.', 'error');
        }
    });
}

/* ── INICIAR / RETOMAR SESIÓN ── */
async function iniciarSesion(usuario) {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('sidebar').style.display = 'block';
    document.getElementById('main-content').style.display = 'block';

    const nombre = usuario.perfil ? `${usuario.perfil.nombres} ${usuario.perfil.apellido_paterno}` : usuario.identificador;
    document.getElementById('user-role-display').textContent = `${nombre} · Rol: ${usuario.rol}`;

    // Sesión guardada antes de existir los permisos: se piden al servidor
    if (!Array.isArray(usuario.permisos)) usuario = await refrescarPermisos(usuario, false);
    aplicarPermisosPorRol(usuario);
    startClock();
    cargarDashboard();
    cargarPerfil();
    cargarCatalogos();

    if (usuario.password_temporal) {
        setTimeout(() => {
            showToast('Tu contraseña es temporal. Cámbiala desde "Mi Perfil".', 'info');
        }, 400);
    }
}

/* ── PERMISOS ACTUALES (por si el administrador los cambió) ── */
async function refrescarPermisos(usuario, reaplicar = true) {
    try {
        const data = await apiFetch('/auth/me');
        const actualizado = { ...usuario, permisos: data.usuario.permisos };
        guardarSesion(getToken(), actualizado);
        if (reaplicar) aplicarPermisosPorRol(actualizado, false);
        return actualizado;
    } catch (err) {
        return { ...usuario, permisos: usuario.permisos || [] };
    }
}

/* ── CERRAR SESIÓN ── */
function cerrarSesion() {
    borrarSesion();
    location.reload();
}

/* ── RETOMAR SESIÓN SI YA HABÍA UN TOKEN GUARDADO ── */
document.addEventListener('DOMContentLoaded', () => {
    const usuario = getUsuario();
    if (usuario && getToken()) {
        iniciarSesion(usuario).then(() => refrescarPermisos(getUsuario() || usuario));
    }
});

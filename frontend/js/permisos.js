/* ================================================================
   MÓDULO "PERMISOS Y ACCESOS"
   Permite marcar qué puede hacer cada ROL o cada PERSONA en particular.
   - Por rol: los permisos que heredan todos los usuarios de ese rol.
   - Por persona: parte de los permisos del rol y se pueden agregar o quitar.
================================================================= */
const permEstado = {
    catalogo: [], roles: [], modo: 'rol',
    idRol: null, idUsuario: null,
    heredados: new Set(), actual: new Set(),
    editable: false, cargado: false
};
let permTemporizador = null;

function permEsc(texto) {
    return String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function permInit() {
    try {
        if (permEstado.catalogo.length === 0) {
            permEstado.catalogo = await apiFetch('/permisos/catalogo');
            permEstado.roles = await apiFetch('/permisos/roles');
            const sel = document.getElementById('perm-rol');
            sel.innerHTML = permEstado.roles.map(r => `<option value="${r.id_rol}">${permEsc(r.nombre_rol.replace('_', ' '))}</option>`).join('');
            // Empieza en el primer rol que no sea Administrador
            const primero = permEstado.roles.find(r => r.nombre_rol !== 'Administrador') || permEstado.roles[0];
            sel.value = primero.id_rol;
        }
        permCambiarModo(permEstado.modo);
    } catch (err) {
        showToast(err.message || 'No se pudieron cargar los permisos.', 'error');
    }
}

function permCambiarModo(modo) {
    permEstado.modo = modo;
    document.getElementById('perm-tab-rol').classList.toggle('active', modo === 'rol');
    document.getElementById('perm-tab-usuario').classList.toggle('active', modo === 'usuario');
    document.getElementById('perm-modo-rol').style.display = modo === 'rol' ? '' : 'none';
    document.getElementById('perm-modo-usuario').style.display = modo === 'usuario' ? '' : 'none';
    permEstado.cargado = false;
    permRender();
    if (modo === 'rol') permCargarRol();
    else permBuscarUsuarios();
}

async function permCargarRol() {
    const id = document.getElementById('perm-rol').value;
    if (!id) return;
    try {
        const d = await apiFetch(`/permisos/rol/${id}`);
        permEstado.idRol = d.id_rol;
        permEstado.editable = d.editable;
        permEstado.heredados = new Set(d.claves);
        permEstado.actual = new Set(d.claves);
        permEstado.cargado = true;
        permRender(d.editable ? '' : 'El Administrador siempre tiene todos los permisos y no se puede cambiar.');
    } catch (err) { showToast(err.message, 'error'); }
}

function permBuscarUsuarios(conRetraso = false) {
    clearTimeout(permTemporizador);
    permTemporizador = setTimeout(async () => {
        const q = document.getElementById('perm-buscar').value.trim();
        try {
            const lista = await apiFetch(`/permisos/usuarios?q=${encodeURIComponent(q)}`);
            const sel = document.getElementById('perm-usuario');
            const previo = sel.value;
            sel.innerHTML = lista.length
                ? lista.map(u => `<option value="${u.id_usuario}">${permEsc(u.nombre)} (${permEsc(u.identificador)}) — ${permEsc(u.nombre_rol.replace('_', ' '))}${u.ajustes > 0 ? ' ★' : ''}</option>`).join('')
                : '<option value="">Sin resultados</option>';
            if (previo && lista.some(u => String(u.id_usuario) === previo)) sel.value = previo;
            permCargarUsuario();
        } catch (err) { showToast(err.message, 'error'); }
    }, conRetraso ? 300 : 0);
}

async function permCargarUsuario() {
    const id = document.getElementById('perm-usuario').value;
    if (!id) { permEstado.cargado = false; permRender(); return; }
    try {
        const d = await apiFetch(`/permisos/usuario/${id}`);
        permEstado.idUsuario = d.id_usuario;
        permEstado.editable = d.editable;
        permEstado.heredados = new Set(d.heredados);
        permEstado.actual = new Set(d.claves);
        permEstado.cargado = true;
        permRender(d.editable
            ? `Rol: ${d.nombre_rol.replace('_', ' ')}. Lo que marques o quites aquí solo aplica a esta persona.`
            : 'El Administrador siempre tiene todos los permisos y no se puede cambiar.');
    } catch (err) { showToast(err.message, 'error'); }
}

function permToggle(input) {
    if (input.checked) permEstado.actual.add(input.dataset.clave);
    else permEstado.actual.delete(input.dataset.clave);
    permRender(undefined, true);
}

function permMarcarTodo(valor) {
    permEstado.catalogo.forEach(p => { if (valor) permEstado.actual.add(p.clave); else permEstado.actual.delete(p.clave); });
    permRender(undefined, true);
}

function permRender(nota, conservarNota = false) {
    const cont = document.getElementById('perm-matriz');
    const acciones = document.getElementById('perm-acciones');
    const notaEl = document.getElementById('perm-nota');
    if (nota !== undefined) notaEl.textContent = nota;
    if (!conservarNota && nota === undefined) notaEl.textContent = '';

    if (!permEstado.cargado) { cont.innerHTML = ''; acciones.style.display = 'none'; return; }

    const grupos = {};
    permEstado.catalogo.forEach(p => { (grupos[p.modulo] = grupos[p.modulo] || []).push(p); });
    cont.innerHTML = Object.entries(grupos).map(([modulo, items]) => `
        <div class="perm-grupo">
            <h4>${permEsc(modulo)}</h4>
            ${items.map(p => {
                const marcado = permEstado.actual.has(p.clave);
                let marca = '';
                if (permEstado.modo === 'usuario' && marcado !== permEstado.heredados.has(p.clave)) {
                    marca = `<span class="perm-badge ${marcado ? 'extra' : 'quitado'}">${marcado ? 'extra' : 'quitado'}</span>`;
                }
                return `<label class="perm-item">
                    <input type="checkbox" data-clave="${p.clave}" ${marcado ? 'checked' : ''} ${permEstado.editable ? '' : 'disabled'} onchange="permToggle(this)">
                    <span>${permEsc(p.descripcion)}${marca}</span>
                </label>`;
            }).join('')}
        </div>`).join('');

    acciones.style.display = permEstado.editable ? '' : 'none';
    document.getElementById('perm-restablecer').style.display = permEstado.modo === 'usuario' ? '' : 'none';
}

async function permGuardar(boton) {
    const claves = [...permEstado.actual];
    const ruta = permEstado.modo === 'rol' ? `/permisos/rol/${permEstado.idRol}` : `/permisos/usuario/${permEstado.idUsuario}`;
    await conEstadoCarga(boton, 'Guardando...', async () => {
        try {
            const d = await apiFetch(ruta, { method: 'PUT', body: JSON.stringify({ claves }) });
            showToast(d.mensaje || 'Permisos guardados.', 'success');
            if (permEstado.modo === 'rol') await permCargarRol();
            else { await permCargarUsuario(); permBuscarUsuarios(); }
        } catch (err) { showToast(err.message || 'No se pudo guardar.', 'error'); }
    });
}

async function permRestablecer(boton) {
    if (!confirm('¿Quitar los ajustes de esta persona y volver a los permisos de su rol?')) return;
    await conEstadoCarga(boton, 'Restableciendo...', async () => {
        try {
            await apiFetch(`/permisos/usuario/${permEstado.idUsuario}`, { method: 'DELETE' });
            showToast('Se restablecieron los permisos del rol.', 'success');
            await permCargarUsuario();
            permBuscarUsuarios();
        } catch (err) { showToast(err.message, 'error'); }
    });
}

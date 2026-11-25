/* ================================================================
   MÓDULO "SUSPENSIÓN DE CLASES"
   Registro de los días sin clases (CTE, vacaciones, falta de agua o luz,
   clima, brotes, paros, etc.). En esos días el sistema no registra
   asistencia y no se cuentan faltas de docentes.
================================================================= */
const suspEstado = { catalogo: [] };

function suspEsc(texto) {
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "2026-11-12" -> "12/11/2026" (sin pasar por Date para no mover el día por zona horaria)
function suspFecha(iso) {
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
}

function suspHoyLocal() {
    const h = new Date();
    const dos = n => String(n).padStart(2, '0');
    return `${h.getFullYear()}-${dos(h.getMonth() + 1)}-${dos(h.getDate())}`;
}

function suspPuedeGestionar() {
    const u = getUsuario();
    return !!(u && (u.permisos || []).includes('suspensiones.gestionar'));
}

async function suspInit() {
    try {
        if (suspEstado.catalogo.length === 0) {
            suspEstado.catalogo = await apiFetch('/suspensiones/catalogo');
        }
        const selCat = document.getElementById('susp-categoria');
        if (selCat && selCat.options.length <= 1) {
            selCat.innerHTML = '<option value="">-- Seleccione --</option>' +
                suspEstado.catalogo.map(c => `<option value="${c.id_categoria}">${suspEsc(c.nombre)}</option>`).join('');
        }
        const hoy = suspHoyLocal();
        const ini = document.getElementById('susp-inicio');
        const fin = document.getElementById('susp-fin');
        if (ini && !ini.value) ini.value = hoy;
        if (fin && !fin.value) fin.value = hoy;
        await suspCargar();
    } catch (err) {
        showToast(err.message || 'No se pudo cargar el módulo.', 'error');
    }
}

function suspCambiarCategoria() {
    const idCat = document.getElementById('susp-categoria').value;
    const selMot = document.getElementById('susp-motivo');
    const cat = suspEstado.catalogo.find(c => String(c.id_categoria) === idCat);
    selMot.innerHTML = '<option value="">-- Seleccione --</option>' +
        (cat ? cat.motivos.map(m => `<option value="${m.id_motivo}">${suspEsc(m.nombre)}</option>`).join('') : '');
    suspMostrarDescripcion();
}

function suspMostrarDescripcion() {
    const idMot = document.getElementById('susp-motivo').value;
    const caja = document.getElementById('susp-descripcion');
    let texto = '';
    suspEstado.catalogo.forEach(c => c.motivos.forEach(m => { if (String(m.id_motivo) === idMot) texto = m.descripcion; }));
    caja.style.display = texto ? 'block' : 'none';
    caja.textContent = texto;
}

async function suspRegistrar(boton) {
    const id_motivo = document.getElementById('susp-motivo').value;
    const fecha_inicio = document.getElementById('susp-inicio').value;
    const fecha_fin = document.getElementById('susp-fin').value;
    const observaciones = document.getElementById('susp-observaciones').value.trim();
    if (!id_motivo) { showToast('Seleccione la categoría y el motivo.', 'error'); return; }
    if (!fecha_inicio || !fecha_fin) { showToast('Indique las fechas de la suspensión.', 'error'); return; }
    if (fecha_fin < fecha_inicio) { showToast('La fecha final no puede ser anterior a la inicial.', 'error'); return; }

    await conEstadoCarga(boton, 'Registrando...', async () => {
        try {
            await apiFetch('/suspensiones', {
                method: 'POST',
                body: JSON.stringify({ id_motivo: Number(id_motivo), fecha_inicio, fecha_fin, observaciones })
            });
            showToast('Suspensión registrada.', 'success');
            document.getElementById('susp-observaciones').value = '';
            document.getElementById('susp-categoria').value = '';
            suspCambiarCategoria();
            await suspCargar();
        } catch (err) {
            showToast(err.message || 'No se pudo registrar la suspensión.', 'error');
        }
    });
}

async function suspCargar() {
    const tbody = document.getElementById('susp-tbody');
    if (!tbody) return;
    try {
        const filtro = document.getElementById('susp-filtro').value;
        let lista = await apiFetch('/suspensiones');
        if (filtro === 'activas') lista = lista.filter(s => s.estado !== 'Concluida');
        if (filtro === 'concluidas') lista = lista.filter(s => s.estado === 'Concluida');

        const puedeBorrar = suspPuedeGestionar();
        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay suspensiones para mostrar.</td></tr>';
            return;
        }
        tbody.innerHTML = lista.map(s => {
            const rango = s.fecha_inicio === s.fecha_fin ? suspFecha(s.fecha_inicio) : `${suspFecha(s.fecha_inicio)} al ${suspFecha(s.fecha_fin)}`;
            const clase = s.estado === 'Vigente' ? 'vigente' : s.estado === 'Próxima' ? 'proxima' : 'concluida';
            return `<tr>
                <td>${rango}<br><small>${s.dias} día(s)</small></td>
                <td>${suspEsc(s.categoria)}</td>
                <td><b>${suspEsc(s.motivo)}</b>${s.observaciones ? `<br><small>${suspEsc(s.observaciones)}</small>` : ''}</td>
                <td><span class="susp-estado ${clase}">${s.estado}</span></td>
                <td>${suspEsc(s.registrado_por)}</td>
                <td>${puedeBorrar ? `<button class="btn btn-secondary" onclick="suspEliminar(${s.id_suspension}, this)">Eliminar</button>` : ''}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6">${suspEsc(err.message || 'No se pudo cargar.')}</td></tr>`;
    }
}

async function suspEliminar(id, boton) {
    if (!confirm('¿Eliminar esta suspensión de clases?')) return;
    await conEstadoCarga(boton, 'Eliminando...', async () => {
        try {
            await apiFetch(`/suspensiones/${id}`, { method: 'DELETE' });
            showToast('Suspensión eliminada.', 'success');
            await suspCargar();
        } catch (err) { showToast(err.message || 'No se pudo eliminar.', 'error'); }
    });
}

/* Aviso en el Panel de Control cuando HOY no hay clases */
function mostrarAvisoSuspension(s) {
    const aviso = document.getElementById('banner-suspension');
    if (!aviso) return;
    if (!s) { aviso.style.display = 'none'; return; }
    const hasta = s.fecha_inicio === s.fecha_fin ? '' : ` (del ${suspFecha(s.fecha_inicio)} al ${suspFecha(s.fecha_fin)})`;
    aviso.innerHTML = `<i class="fas fa-calendar-times"></i> <div><b>Hoy no hay clases</b>${hasta}<br>${suspEsc(s.motivo)} — ${suspEsc(s.categoria)}</div>`;
    aviso.style.display = 'flex';
}

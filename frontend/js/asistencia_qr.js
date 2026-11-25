/* ================================================================
   ASISTENCIA POR CÓDIGO QR
   ----------------------------------------------------------------
   MONITOR (Administrador / permiso asistencia.monitor):
     muestra el QR de un solo uso y lo cambia al instante cuando alguien registra su
     asistencia (Server-Sent Events + respaldo por consulta cada 2 s).
   REGISTRO (solo Docente y Administrativo):
     escanear el QR con la cámara trasera -> el registro se envía al instante (sin selfie)
     -> comprobante en pantalla.
================================================================= */
const AQ_PREFIJO = 'SICAJ:';
const AQ_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const aqEsc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const aqEsperar = ms => new Promise(r => setTimeout(r, ms));
function aqFecha(iso) { const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${a}`; }
function aqHora(h) { return h ? String(h).slice(0, 5) : '—'; }

/* ───────────────────────── MONITOR ───────────────────────── */
const aqMonitor = { activo: false, abortar: null, token: null, limite: 0, vigencia: 60, reloj: null, avisoTimer: null, pantalla: null };

function monitorTamano() {
    const lleno = !!document.fullscreenElement;
    const max = lleno ? Math.min(window.innerHeight * 0.62, window.innerWidth * 0.85) : Math.min(340, window.innerWidth - 90);
    return Math.floor(Math.max(180, max));
}

function monitorDibujar(token) {
    const cont = document.getElementById('monitor-qr');
    if (!cont) return;
    cont.innerHTML = '';
    if (typeof QRCode === 'undefined') {
        cont.textContent = 'No se pudo cargar la librería del código QR. Revisa la conexión a internet y recarga la página.';
        return;
    }
    const t = monitorTamano();
    new QRCode(cont, { text: AQ_PREFIJO + token, width: t, height: t, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

function monitorMostrarUltimo(u) {
    const caja = document.getElementById('monitor-ultimo');
    if (!caja) return;
    caja.textContent = `✔ ${u.nombre} registró su ${u.tipo === 'ENTRADA' ? 'entrada' : 'salida'} a las ${u.hora}`;
    caja.style.display = 'block';
    clearTimeout(aqMonitor.avisoTimer);
    aqMonitor.avisoTimer = setTimeout(() => { caja.style.display = 'none'; }, 8000);
}

/** Aplica el estado que manda el servidor; el QR solo se vuelve a dibujar si el token cambió. */
function monitorAplicar(estado) {
    if (!estado || !estado.token) return;
    aqMonitor.limite = Date.now() + estado.restante_seg * 1000;
    aqMonitor.vigencia = estado.vigencia_seg || 60;
    if (estado.token !== aqMonitor.token) {
        aqMonitor.token = estado.token;
        monitorDibujar(estado.token);
    }
    if (estado.ultimo) monitorMostrarUltimo(estado.ultimo);
}

function monitorEstadoTexto(t) {
    const el = document.getElementById('monitor-estado');
    if (el) el.textContent = t || '';
}

function monitorTick() {
    const restante = Math.max(0, Math.ceil((aqMonitor.limite - Date.now()) / 1000));
    const num = document.getElementById('monitor-restante');
    const barra = document.getElementById('monitor-barra-fill');
    if (num) num.textContent = restante;
    if (barra) barra.style.width = `${Math.min(100, (restante / aqMonitor.vigencia) * 100)}%`;
}

function monitorProcesarBloque(bloque) {
    let evento = 'message', datos = '';
    bloque.split('\n').forEach(l => {
        if (l.startsWith('event:')) evento = l.slice(6).trim();
        else if (l.startsWith('data:')) datos += l.slice(5).trim();
    });
    if (!datos) return;
    try {
        const d = JSON.parse(datos);
        if (evento === 'cambio' || evento === 'estado') monitorAplicar(d);
    } catch (e) { /* bloque incompleto */ }
}

/** Conexión SSE con fetch (así se puede mandar el token JWT en el encabezado Authorization). */
async function monitorStream(senal) {
    const res = await fetch(`${API_BASE_URL}/asistencia/qr-monitor/stream`, {
        headers: { Authorization: `Bearer ${getToken()}`, Accept: 'text/event-stream' }, signal: senal
    });
    if (!res.ok || !res.body) throw new Error('Flujo en tiempo real no disponible');
    const lector = res.body.getReader();
    const decodificador = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await lector.read();
        if (done) break;
        buffer += decodificador.decode(value, { stream: true });
        let i;
        while ((i = buffer.indexOf('\n\n')) >= 0) {
            monitorProcesarBloque(buffer.slice(0, i));
            buffer = buffer.slice(i + 2);
        }
    }
}

async function monitorBucleStream(senal) {
    while (aqMonitor.activo && !senal.aborted) {
        try { await monitorStream(senal); } catch (e) { if (senal.aborted) return; }
        await aqEsperar(1500);
    }
}

/** Respaldo: consulta cada 2 s (por si algún proxy o túnel retiene el flujo en tiempo real). */
async function monitorBucleConsulta(senal) {
    while (aqMonitor.activo && !senal.aborted) {
        try {
            monitorAplicar(await apiFetch('/asistencia/qr-monitor'));
            monitorEstadoTexto('');
        } catch (e) {
            monitorEstadoTexto('Sin conexión con el servidor, reintentando...');
        }
        await aqEsperar(2000);
    }
}

async function monitorIniciar() {
    aqMonitor.activo = true;
    aqMonitor.token = null;
    aqMonitor.abortar = new AbortController();
    document.getElementById('monitor-area').style.display = '';
    document.getElementById('monitor-full-btn').style.display = '';
    document.getElementById('monitor-btn').textContent = 'Detener monitor';
    aqMonitor.reloj = setInterval(monitorTick, 250);
    try { aqMonitor.pantalla = await navigator.wakeLock?.request('screen'); } catch (e) { /* opcional */ }
    monitorBucleStream(aqMonitor.abortar.signal);
    monitorBucleConsulta(aqMonitor.abortar.signal);
}

function monitorDetener() {
    aqMonitor.activo = false;
    aqMonitor.abortar?.abort();
    clearInterval(aqMonitor.reloj);
    try { aqMonitor.pantalla?.release(); } catch (e) { /* ignorar */ }
    if (document.fullscreenElement) document.exitFullscreen?.();
    const area = document.getElementById('monitor-area');
    if (area) area.style.display = 'none';
    const full = document.getElementById('monitor-full-btn');
    if (full) full.style.display = 'none';
    const btn = document.getElementById('monitor-btn');
    if (btn) btn.textContent = 'Iniciar monitor';
}

function monitorAlternar() { if (aqMonitor.activo) monitorDetener(); else monitorIniciar(); }

function monitorPantallaCompleta() {
    const area = document.getElementById('monitor-area');
    if (area && area.requestFullscreen) area.requestFullscreen().catch(() => showToast('Tu navegador no permitió la pantalla completa.', 'info'));
}

document.addEventListener('fullscreenchange', () => { if (aqMonitor.activo && aqMonitor.token) monitorDibujar(aqMonitor.token); });

/* ───────────────────────── REGISTRO DEL PERSONAL (sin selfie) ───────────────────────── */
const AQ_PASOS = ['reg-inicio', 'reg-escaner', 'reg-enviando', 'reg-resultado'];
const aqReg = { scanner: null, procesado: false, ultimoAviso: 0 };

function aqPaso(id) {
    AQ_PASOS.forEach(x => { const el = document.getElementById(x); if (el) el.style.display = x === id ? '' : 'none'; });
}

function aqErrorCamara(err) {
    const n = err && err.name;
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError') return 'Debes permitir el acceso a la cámara para escanear el código QR.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No se encontró la cámara trasera en este dispositivo.';
    if (n === 'NotReadableError') return 'La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo.';
    return (err && err.message) || 'No se pudo abrir la cámara.';
}

function registroSoportado() {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('La cámara solo funciona en sitios seguros (HTTPS). Abre el sistema con la dirección https:// que te dio el administrador.', 'error');
        return false;
    }
    return true;
}

async function registroDetenerEscaner() {
    const s = aqReg.scanner;
    aqReg.scanner = null;
    if (!s) return;
    try { await s.stop(); } catch (e) { /* ya estaba detenido */ }
    try { s.clear(); } catch (e) { /* ignorar */ }
}

async function registroCancelar() {
    await registroDetenerEscaner();
    aqPaso('reg-inicio');
}

/** Abre directamente la cámara TRASERA para escanear el QR del monitor. */
async function registroIniciar() {
    if (!registroSoportado()) return;
    if (typeof Html5Qrcode === 'undefined') {
        showToast('No se pudo cargar el lector de códigos QR. Revisa tu conexión a internet y recarga la página.', 'error');
        return;
    }
    aqReg.procesado = false;
    aqPaso('reg-escaner');
    try {
        aqReg.scanner = new Html5Qrcode('qr-reader');
        await aqReg.scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: (w, h) => { const l = Math.floor(Math.min(w, h) * 0.7); return { width: l, height: l }; } },
            texto => registroEscaneado(texto),
            () => { /* sin código en este cuadro */ }
        );
    } catch (err) {
        await registroDetenerEscaner();
        aqPaso('reg-inicio');
        showToast(aqErrorCamara(err), 'error');
    }
}

/** Al leer un QR válido del monitor, la asistencia se registra de inmediato. */
async function registroEscaneado(texto) {
    if (aqReg.procesado) return;
    const t = String(texto || '').trim();
    if (!t.startsWith(AQ_PREFIJO) || !AQ_UUID.test(t.slice(AQ_PREFIJO.length))) {
        if (Date.now() - aqReg.ultimoAviso > 3000) {
            aqReg.ultimoAviso = Date.now();
            showToast('Ese no es el código QR del monitor de la escuela.', 'error');
        }
        return;
    }
    aqReg.procesado = true;
    await registroDetenerEscaner();
    aqPaso('reg-enviando');
    try {
        const r = await apiFetch('/asistencia/registrar-qr', { method: 'POST', body: JSON.stringify({ token: t.slice(AQ_PREFIJO.length) }) });
        registroMostrarResultado(r);
        aqCargarHistorial();
    } catch (err) {
        registroMostrarError(err.message);
    }
}

function registroMostrarResultado(r) {
    aqPaso('reg-resultado');
    const bueno = r.estatus === 'PUNTUAL' || r.estatus_salida === 'CUMPLIDA';
    document.getElementById('reg-resultado').innerHTML = `
        <div class="aq-comprobante">
            <div class="aq-check ${bueno ? 'ok' : 'warn'}"><i class="fas ${bueno ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i></div>
            <h3>${r.tipo === 'ENTRADA' ? 'Entrada registrada' : 'Salida registrada'}</h3>
            <span class="aq-badge ${bueno ? 'ok' : 'warn'}">${aqEsc(r.estatus_texto)}</span>
            <p class="aq-mensaje">${aqEsc(r.mensaje)}</p>
            <table class="aq-detalle">
                <tr><td>Nombre</td><td>${aqEsc(r.nombre)}</td></tr>
                <tr><td>Fecha</td><td>${aqFecha(r.fecha)}</td></tr>
                <tr><td>Hora</td><td>${aqEsc(r.hora)}</td></tr>
                <tr><td>Tu jornada de hoy</td><td>${aqEsc(r.jornada.inicio)} a ${aqEsc(r.jornada.fin)}</td></tr>
                <tr><td>Folio</td><td>#${aqEsc(r.folio)}</td></tr>
            </table>
            <button class="btn btn-primary" style="width:100%" onclick="registroCancelar()">Listo</button>
        </div>`;
}

function registroMostrarError(mensaje) {
    aqPaso('reg-resultado');
    const esQR = /c[oó]digo QR/i.test(mensaje);
    document.getElementById('reg-resultado').innerHTML = `
        <div class="aq-comprobante">
            <div class="aq-check error"><i class="fas fa-circle-xmark"></i></div>
            <h3>No se registró tu asistencia</h3>
            <p class="aq-mensaje">${aqEsc(mensaje)}</p>
            ${esQR ? '<button class="btn btn-primary" style="width:100%" onclick="registroIniciar()"><i class="fas fa-qrcode"></i> Escanear de nuevo</button>' : ''}
            <button class="btn btn-secondary" style="width:100%; margin-top:8px" onclick="registroCancelar()">Entendido</button>
        </div>`;
}

/* ───────────────────────── HISTORIAL (incluye inasistencias automáticas) ───────────────────────── */
const AQ_TXT_SALIDA = { CUMPLIDA: 'Cumplida', ANTICIPADA: 'Anticipada' };

async function aqCargarHistorial() {
    const tbody = document.getElementById('aq-hist-tbody');
    if (!tbody) return;
    try {
        const filas = await apiFetch('/asistencia');
        if (filas.length === 0) { tbody.innerHTML = '<tr><td colspan="6">Aún no hay registros en los últimos 30 días.</td></tr>'; return; }
        tbody.innerHTML = filas.map(r => `<tr>
            <td>${aqFecha(r.fecha)}<br><small>${aqEsc(r.dia)}</small></td>
            <td>${aqEsc(r.persona)}<br><small>${aqEsc(String(r.nombre_rol || '').replace('_', ' '))}</small></td>
            <td>${r.jornada ? `${aqEsc(r.jornada.inicio)} - ${aqEsc(r.jornada.fin)}` : '—'}</td>
            <td>${aqHora(r.hora_entrada)}</td>
            <td>${badgeAsistencia(r.estatus)}${r.automatica && r.estatus === 'INASISTENCIA' ? '<br><small>sin escanear el QR</small>' : ''}</td>
            <td>${r.hora_salida ? aqHora(r.hora_salida) : (r.hora_entrada ? '<small>Sin salida</small>' : '—')}${r.estatus_salida ? `<br><span class="aq-badge ${r.estatus_salida === 'CUMPLIDA' ? 'ok' : 'warn'}">${AQ_TXT_SALIDA[r.estatus_salida]}</span>` : ''}</td>
        </tr>`).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6">${aqEsc(err.message || 'No se pudo cargar el historial.')}</td></tr>`;
    }
}

/* ───────────────────────── CICLO DE VIDA DE LA PANTALLA ───────────────────────── */
function asistenciaQRInit() {
    aqPaso('reg-inicio');
    aqCargarHistorial();
}

/** Se llama en cada cambio de pestaña: al salir de "Asistencia" se apagan el monitor y la cámara. */
function asistenciaQRSalir(tabDestino) {
    if (tabDestino === 'asistencias') return;
    if (aqMonitor.activo) monitorDetener();
    if (aqReg.scanner) registroCancelar();
}

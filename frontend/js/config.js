/* ── CONFIGURACIÓN DE LA API ── */
// La API se toma de la misma dirección desde la que se abre el sistema, así funciona igual en la laptop,
// en el monitor y en el celular (que NO puede usar "localhost"). Para forzar otra URL, define antes
// window.SICAJ_API_URL = 'https://mi-servidor/api'.
const API_BASE_URL = (() => {
    if (window.SICAJ_API_URL) return window.SICAJ_API_URL;
    const { protocol, hostname, port, origin } = location;
    if (protocol === 'file:') return 'http://localhost:4000/api';
    if (port === '4000' || port === '') return `${origin}/api`;   // el backend sirve la página (o hay HTTPS por túnel/hosting)
    return `${protocol}//${hostname}:4000/api`;                   // la página se sirve en otro puerto (p. ej. 3000)
})();

function getToken() {
    return localStorage.getItem('sice_token');
}

function getUsuario() {
    const raw = localStorage.getItem('sice_usuario');
    return raw ? JSON.parse(raw) : null;
}

function guardarSesion(token, usuario) {
    localStorage.setItem('sice_token', token);
    localStorage.setItem('sice_usuario', JSON.stringify(usuario));
}

function borrarSesion() {
    localStorage.removeItem('sice_token');
    localStorage.removeItem('sice_usuario');
}

/**
 * Envoltorio de fetch: agrega la URL base, el token y maneja errores
 * de forma consistente en toda la aplicación.
 */
async function apiFetch(path, options = {}) {
    const headers = options.headers || {};
    headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    } catch (err) {
        throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté corriendo.');
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
        borrarSesion();
        location.reload();
        throw new Error('Sesión expirada, por favor inicia sesión de nuevo.');
    }

    if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error al comunicarse con el servidor.');
    }

    return data;
}

/**
 * Igual que apiFetch, pero para enviar archivos (multipart/form-data).
 * OJO: no se define Content-Type a mano — el navegador debe ponerlo junto
 * con el "boundary" correcto, si lo forzamos se rompe el envío del archivo.
 */
async function apiFetchForm(path, formData, options = {}) {
    const headers = options.headers || {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, body: formData });
    } catch (err) {
        throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté corriendo.');
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
        borrarSesion();
        location.reload();
        throw new Error('Sesión expirada, por favor inicia sesión de nuevo.');
    }
    if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error al comunicarse con el servidor.');
    }
    return data;
}

/**
 * Descarga un archivo protegido (requiere el token) y lo abre en una pestaña
 * nueva. Un <a href> normal no puede mandar el header Authorization, por eso
 * se hace con fetch + blob.
 */
async function abrirArchivoProtegido(path) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}${path}`, { headers });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo obtener el archivo.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
}


/** Descarga un archivo protegido con el token y devuelve una URL temporal (blob) para previsualizarlo. */
async function obtenerBlobProtegido(path) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}${path}`, { headers });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo obtener el archivo.');
    }
    return URL.createObjectURL(await res.blob());
}

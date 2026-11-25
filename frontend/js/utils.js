/* ── VALIDACIÓN CAMPOS (solo para dar feedback rápido antes de llamar a la API) ── */
function requireFields(ids) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (!el || !el.value.trim()) {
            el && (el.style.borderColor = 'var(--secondary)');
            return false;
        }
        el.style.borderColor = '#ddd';
    }
    return true;
}

// Restringe automáticamente lo que se puede escribir según el tipo de campo
document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (!id) return;

    // 1. Solo letras y espacios (Nombres y Apellidos)
    if (id.includes('nombres') || id.includes('apellido') || id.includes('tutor-nombre')) {
        e.target.value = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
    }

    // 2. Solo números (Teléfono)
    if (id.includes('telefono')) {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    }

    // 3. CURP: Mayúsculas, letras y números, máx 18
    if (id.includes('curp')) {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18);
    }

    // 4. Matrícula: Mayúsculas, letras y números
    if (id.includes('matricula')) {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
});


/* ── FILTROS Y MÁSCARAS DE ENTRADA EN TIEMPO REAL ── */
function aplicarMascarasGlobales() {
    // 1. Campos que SOLO permiten letras, espacios, acentos y eñes
    const soloLetrasIds = [
        'pe-nombres', 'pe-ap-pat', 'pe-ap-mat', 'pe-municipio', 'pe-estado',
        'al-nombres', 'al-ap-pat', 'al-ap-mat', 'al-municipio', 'al-estado',
        'tu-nombres', 'tu-ap-pat', 'tu-ap-mat', 'tu-municipio', 'tu-estado'
    ];

    soloLetrasIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                input.value = input.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
            });
        }
    });

    // 2. Teléfonos: SOLO números y máximo 10 dígitos
    ['pe-tel', 'tu-tel'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.maxLength = 10;
            input.addEventListener('input', () => {
                input.value = input.value.replace(/\D/g, '').slice(0, 10);
            });
        }
    });

    // 3. Códigos Postales: SOLO números y máximo 5 dígitos
    ['pe-cp', 'al-cp', 'tu-cp'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.maxLength = 5;
            input.addEventListener('input', () => {
                input.value = input.value.replace(/\D/g, '').slice(0, 5);
            });
        }
    });

    // 4. CURP: Mayúsculas forzadas, alfanumérico y máximo 18 caracteres
    ['pe-curp', 'al-curp', 'tu-curp'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.maxLength = 18;
            input.addEventListener('input', () => {
                input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18);
            });
        }
    });

    // 5. Calles y Números Exteriores: Bloquear caracteres especiales no válidos como {}[]^~`
    ['pe-calle', 'pe-num', 'pe-colonia', 'al-calle', 'al-num', 'al-colonia', 'tu-calle', 'tu-num', 'tu-colonia'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                input.value = input.value.replace(/[{}\[\]^~`+*?<>=_$%&!|]/g, '');
            });
        }
    });
}

// Se ejecuta en cuanto cargue el DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicarMascarasGlobales);
} else {
    aplicarMascarasGlobales();
}

/* ── SANITIZACIÓN ANTI-XSS ── */
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ── VALIDACIÓN DE CAMPOS VACÍOS ── */
function requireFields(ids) {
    let esValido = true;
    for (const id of ids) {
        const el = document.getElementById(id);
        if (!el || !el.value.trim()) {
            if (el) el.style.borderColor = 'var(--secondary, #e74c3c)';
            esValido = false;
        } else {
            el.style.borderColor = '#ddd';
        }
    }
    return esValido;
}

/* ── MÁSCARAS DE ENTRADA EN TIEMPO REAL ── */
function aplicarMascarasGlobales() {
    const soloLetrasIds = [
        'pe-nombres', 'pe-ap-pat', 'pe-ap-mat', 'pe-municipio', 'pe-estado',
        'al-nombres', 'al-ap-pat', 'al-ap-mat', 'al-municipio', 'al-estado',
        'tu-nombres', 'tu-ap-pat', 'tu-ap-mat', 'tu-municipio', 'tu-estado'
    ];

    soloLetrasIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
            });
        }
    });

    ['pe-tel', 'tu-tel'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.maxLength = 10;
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
            });
        }
    });

    ['pe-cp', 'al-cp', 'tu-cp'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.maxLength = 5;
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5);
            });
        }
    });

    ['pe-curp', 'al-curp', 'tu-curp'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.maxLength = 18;
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18);
            });
        }
    });

    ['pe-calle', 'pe-num', 'pe-colonia', 'al-calle', 'al-num', 'al-colonia', 'tu-calle', 'tu-num', 'tu-colonia'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[{}\[\]^~`+*?<>=_$%&!|]/g, '');
            });
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicarMascarasGlobales);
} else {
    aplicarMascarasGlobales();
}

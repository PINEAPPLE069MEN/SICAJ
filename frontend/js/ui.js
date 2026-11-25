/* ── RELOJ ── */
function startClock() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('live-clock').textContent = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
    }, 1000);
}

/* ── GRÁFICA (datos reales) ── */
let chartInasistencias = null;
let chartJustificantes = null;
let chartDocente = null;

// Escribe el valor dentro de cada segmento de barra (solo si es mayor que 0)
const etiquetasEnBarras = {
    id: 'etiquetasEnBarras',
    afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((ds, k) => {
            chart.getDatasetMeta(k).data.forEach((barra, i) => {
                const v = ds.data[i];
                if (!v) return;
                ctx.save();
                ctx.fillStyle = ds.etiquetaColor || '#fff';
                ctx.font = 'bold 13px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(v, barra.x, barra.y + barra.height / 2);
                ctx.restore();
            });
        });
    }
};

/** Etiqueta de estatus con color (A tiempo / Retardo / Inasistencia ...). */
function badgeAsistencia(estatus) {
    const mapa = {
        ASISTENCIA: ['A tiempo', 'ok'], RETARDO: ['Retardo', 'warn'], INASISTENCIA: ['Inasistencia', 'err'],
        PENDIENTE: ['En espera', 'neutral'], SIN_JORNADA: ['Sin clases', 'neutral'], PROXIMO: ['Por venir', 'neutral']
    };
    const [texto, clase] = mapa[estatus] || [estatus || '—', 'neutral'];
    return `<span class="aq-badge ${clase}">${texto}</span>`;
}

function initCharts(incidencias, justificantes) {
    initGraficaDocentes(incidencias || []);
    initGraficaJustificantes(justificantes || { pendientes: 0, aprobados: 0, rechazados: 0 });
}

// Incidencias por docente en la semana: inasistencias (incluidas las automáticas) y retardos
function initGraficaDocentes(items) {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    const vacio = document.getElementById('chart-vacio');
    if (vacio) vacio.style.display = items.length ? 'none' : 'block';
    if (chartInasistencias) chartInasistencias.destroy();
    const maximo = Math.max(0, ...items.map(i => i.inasistencias + i.retardos));
    chartInasistencias = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: items.map(i => i.docente),
            datasets: [
                { label: 'Inasistencias', data: items.map(i => i.inasistencias), backgroundColor: '#b21f1f', borderRadius: 6, maxBarThickness: 64 },
                { label: 'Retardos', data: items.map(i => i.retardos), backgroundColor: '#fdbb2d', etiquetaColor: '#4a3600', borderRadius: 6, maxBarThickness: 64 }
            ]
        },
        plugins: [etiquetasEnBarras],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y}` } }
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, suggestedMax: maximo + 1, ticks: { stepSize: 1, precision: 0 }, title: { display: true, text: 'Incidencias' }, grid: { color: '#eef0f6' } }
            }
        }
    });
}

// Justificantes (permisos) de alumnos por estatus (últimos 30 días)
function initGraficaJustificantes(j) {
    const canvas = document.getElementById('chartJustificantes');
    if (!canvas) return;
    const total = j.pendientes + j.aprobados + j.rechazados;
    const vacio = document.getElementById('chart-justificantes-vacio');
    if (vacio) vacio.style.display = total ? 'none' : 'block';
    canvas.parentElement.style.display = total ? '' : 'none';
    if (chartJustificantes) chartJustificantes.destroy();
    if (!total) return;
    chartJustificantes = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: [`Pendientes (${j.pendientes})`, `Aprobados (${j.aprobados})`, `Rechazados (${j.rechazados})`],
            datasets: [{ data: [j.pendientes, j.aprobados, j.rechazados], backgroundColor: ['#fdbb2d', '#27ae60', '#b21f1f'], borderColor: '#fff', borderWidth: 3 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '58%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 14 }, padding: 18 } },
                tooltip: { callbacks: { label: c => ` ${c.parsed} justificante(s)` } }
            }
        }
    });
}

// Panel del Docente: mis asistencias, retardos e inasistencias (semana y ciclo)
function initGraficaDocentePersonal(semana, ciclo) {
    const canvas = document.getElementById('chartDocente');
    if (!canvas) return;
    if (chartDocente) chartDocente.destroy();
    const etiquetas = ['Esta semana'];
    const lista = [semana];
    if (ciclo) { etiquetas.push(`Ciclo ${ciclo.nombre}`); lista.push(ciclo); }
    const maximo = Math.max(0, ...lista.flatMap(x => [x.asistencias, x.retardos, x.inasistencias]));
    chartDocente = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: etiquetas,
            datasets: [
                { label: 'A tiempo', data: lista.map(x => x.asistencias), backgroundColor: '#27ae60', borderRadius: 6, maxBarThickness: 56 },
                { label: 'Retardos', data: lista.map(x => x.retardos), backgroundColor: '#fdbb2d', borderRadius: 6, maxBarThickness: 56 },
                { label: 'Inasistencias', data: lista.map(x => x.inasistencias), backgroundColor: '#b21f1f', borderRadius: 6, maxBarThickness: 56 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, suggestedMax: maximo + 1, ticks: { stepSize: 1, precision: 0 }, grid: { color: '#eef0f6' } }
            }
        }
    });
}

/* ── SUB-PESTAÑAS ── */
function cambiarSubTab(idPanel, boton) {
    const seccion = boton.closest('.section');
    seccion.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    seccion.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(idPanel).classList.add('active');
    boton.classList.add('active');
}

/* ── MODAL PDF (vista previa + descargar opcional) ── */
function abrirModalPdf(titulo, urlBlob, nombreArchivo) {
    document.getElementById('pdf-modal-title').textContent = titulo;
    document.getElementById('pdf-modal-frame').src = urlBlob;
    const dl = document.getElementById('pdf-modal-download');
    dl.href = urlBlob;
    dl.download = nombreArchivo || 'reporte.pdf';
    document.getElementById('pdf-modal').classList.add('open');
}
function cerrarModalPdf() {
    document.getElementById('pdf-modal').classList.remove('open');
    document.getElementById('pdf-modal-frame').src = 'about:blank';
}

/* ── MODAL ── */
function showModal(title, rows) {
    document.getElementById('modal-title').textContent = title;
    const body = document.getElementById('modal-body');
    body.innerHTML = rows.map(r =>
        `<div class="data-row"><span>${r.label}</span><span>${r.value}</span></div>`
    ).join('');
    document.getElementById('result-modal').classList.add('open');
}
function closeModal() {
    document.getElementById('result-modal').classList.remove('open');
}

/* ── NOTIFICACIONES (toasts) ── */
function showToast(mensaje, tipo = 'info') {
    const contenedor = document.getElementById('toast-container');
    if (!contenedor) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensaje;
    contenedor.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-salir');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/* ── ESTADO DE CARGA EN BOTONES (evita doble clic) ── */
async function conEstadoCarga(boton, textoCargando, tarea) {
    if (!boton) { await tarea(); return; }
    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = textoCargando;
    try {
        await tarea();
    } finally {
        boton.disabled = false;
        boton.textContent = textoOriginal;
    }
}

/* ── MENÚ MÓVIL ── */
function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('abierto');
}

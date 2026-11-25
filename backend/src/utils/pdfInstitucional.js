const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Reportes PDF con formato institucional:
 *  - Encabezado con logo, nombre oficial de la escuela, título, fecha de generación y periodo.
 *  - Tabla con encabezado repetido en cada página.
 *  - Pie de página con numeración "Página X de Y" y, al final, espacio para la firma de Dirección.
 *
 * El logo se carga de backend/assets/logo-escuela.png. Si el archivo no existe (o no es una imagen
 * válida) se dibuja un recuadro punteado en su lugar y el reporte se genera con normalidad.
 */
const RUTA_LOGO = path.join(__dirname, '..', '..', 'assets', 'logo-escuela.png');
const INSTITUCION = {
  nombre: 'ESCUELA SECUNDARIA TÉCNICA NÚM. 9',
  lugar: 'Apizaco, Tlaxcala',
  sistema: 'Sistema Integral de Control Escolar (SICAJ)'
};
const AZUL = '#1a2a6c';

const dos = n => String(n).padStart(2, '0');
function fmtFecha(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
function fmtFechaHora(d) {
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

function crearReporte({ titulo, desde, hasta, nombreArchivo = 'reporte.pdf' }, res) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 40, bottom: 75, left: 50, right: 50 },
    bufferPages: true,
    info: { Title: titulo, Author: 'SICAJ', Subject: `${INSTITUCION.nombre} — ${titulo}` }
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  doc.pipe(res);

  const generado = new Date();
  const izq = doc.page.margins.left;
  const ancho = doc.page.width - izq - doc.page.margins.right;
  const limiteInferior = () => doc.page.height - doc.page.margins.bottom;

  function dibujarLogo(x, y, lado) {
    let dibujado = false;
    if (fs.existsSync(RUTA_LOGO)) {
      try { doc.image(RUTA_LOGO, x, y, { fit: [lado, lado], align: 'center', valign: 'center' }); dibujado = true; } catch (e) { /* imagen inválida */ }
    }
    if (!dibujado) {
      doc.save();
      doc.roundedRect(x, y, lado, lado, 6).dash(3, { space: 2 }).lineWidth(0.8).stroke('#9aa3b8');
      doc.undash();
      doc.font('Helvetica').fontSize(8).fillColor('#9aa3b8').text('LOGO', x, y + lado / 2 - 4, { width: lado, align: 'center', lineBreak: false });
      doc.restore();
    }
  }

  function encabezado(primera) {
    const top = doc.page.margins.top;
    dibujarLogo(izq, top, 66);
    const xTexto = izq + 76, anchoTexto = ancho - 76;
    doc.font('Helvetica-Bold').fontSize(15).fillColor(AZUL).text(INSTITUCION.nombre, xTexto, top + 8, { width: anchoTexto, align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor('#222').text(INSTITUCION.lugar, xTexto, doc.y + 2, { width: anchoTexto, align: 'center' });
    doc.fontSize(8.5).fillColor('#666').text(INSTITUCION.sistema, xTexto, doc.y + 2, { width: anchoTexto, align: 'center' });

    const yLinea = top + 76;
    doc.moveTo(izq, yLinea).lineTo(izq + ancho, yLinea).lineWidth(1.6).stroke(AZUL);

    let y = yLinea + 12;
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000')
      .text(primera ? titulo : `${titulo} (continuación)`, izq, y, { width: ancho, align: 'center' });
    y = doc.y + 5;
    if (primera) {
      doc.font('Helvetica').fontSize(9).fillColor('#444');
      doc.text(`Fecha de generación: ${fmtFechaHora(generado)}`, izq, y, { width: ancho / 2, align: 'left', lineBreak: false });
      doc.text(`Periodo: ${fmtFecha(desde)} al ${fmtFecha(hasta)}`, izq + ancho / 2, y, { width: ancho / 2, align: 'right', lineBreak: false });
      y += 18;
    }
    doc.x = izq;
    doc.y = y + 6;
  }

  encabezado(true);
  doc.on('pageAdded', () => encabezado(false));

  const api = {
    doc,

    parrafo(texto, opciones = {}) {
      doc.font(opciones.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(opciones.tam || 10).fillColor(opciones.color || '#000')
        .text(texto, izq, doc.y, { width: ancho });
      doc.moveDown(0.5);
    },

    /** columnas: encabezados; filas: arreglos (cada celda puede ser texto o {texto, color}); fracciones: ancho relativo de cada columna */
    tabla(columnas, filas, fracciones) {
      const suma = fracciones.reduce((a, b) => a + b, 0);
      const anchos = fracciones.map(f => (ancho * f) / suma);
      const altoFila = 20;
      let y = doc.y;

      const cabecera = () => {
        doc.rect(izq, y, ancho, altoFila + 2).fill(AZUL);
        let x = izq;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff');
        columnas.forEach((c, i) => { doc.text(c, x + 5, y + 6, { width: anchos[i] - 10, lineBreak: false, ellipsis: true }); x += anchos[i]; });
        y += altoFila + 2;
      };
      cabecera();

      if (filas.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#666').text('Sin registros en el periodo seleccionado.', izq + 5, y + 8, { lineBreak: false });
        doc.x = izq; doc.y = y + 34;
        return;
      }
      filas.forEach((fila, idx) => {
        if (y + altoFila > limiteInferior()) { doc.addPage(); y = doc.y; cabecera(); }
        if (idx % 2 === 0) doc.rect(izq, y, ancho, altoFila).fill('#EEF2FB');
        let x = izq;
        doc.font('Helvetica').fontSize(9);
        fila.forEach((celda, i) => {
          const texto = celda && typeof celda === 'object' ? celda.texto : celda;
          doc.fillColor((celda && celda.color) || '#000')
            .text(String(texto == null ? '' : texto), x + 5, y + 6, { width: anchos[i] - 10, lineBreak: false, ellipsis: true });
          x += anchos[i];
        });
        y += altoFila;
      });
      doc.x = izq;
      doc.y = y + 10;
    },

    /** Firma de Dirección, pie con numeración y cierre del documento. */
    finalizar() {
      const altoFirma = 120;
      let y = doc.y + 30;
      if (y + altoFirma > limiteInferior()) { doc.addPage(); y = doc.y + 30; }
      const cx = izq + ancho / 2;
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      doc.text('Vo. Bo.', izq, y, { width: ancho, align: 'center', lineBreak: false });
      doc.moveTo(cx - 120, y + 62).lineTo(cx + 120, y + 62).lineWidth(0.8).stroke('#000');
      doc.font('Helvetica-Bold').text('DIRECTOR(A) DE LA ESCUELA', izq, y + 67, { width: ancho, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor('#555').text('Nombre, firma y sello', izq, y + 82, { width: ancho, align: 'center', lineBreak: false });

      const rango = doc.bufferedPageRange();
      for (let i = 0; i < rango.count; i++) {
        doc.switchToPage(rango.start + i);
        const margenOriginal = doc.page.margins.bottom;
        doc.page.margins.bottom = 0; // permite escribir en la franja del pie sin saltar de página
        const yPie = doc.page.height - 48;
        doc.moveTo(izq, yPie - 8).lineTo(izq + ancho, yPie - 8).lineWidth(0.5).stroke('#999');
        doc.font('Helvetica').fontSize(8).fillColor('#666');
        doc.text(`${INSTITUCION.nombre} · ${INSTITUCION.lugar}`, izq, yPie, { width: ancho * 0.7, align: 'left', lineBreak: false });
        doc.text(`Página ${i + 1} de ${rango.count}`, izq, yPie, { width: ancho, align: 'right', lineBreak: false });
        doc.page.margins.bottom = margenOriginal;
      }
      doc.end();
    }
  };
  return api;
}

module.exports = { crearReporte, fmtFecha, fmtFechaHora, RUTA_LOGO };

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const carpeta = path.join(__dirname, '..', '..', 'uploads', 'asistencia');
fs.mkdirSync(carpeta, { recursive: true });

// La foto se recibe en memoria y solo se escribe a disco cuando todas las validaciones pasaron
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(Object.assign(new Error('La evidencia debe ser una fotografía (JPG, PNG o WEBP)'), { status: 400 }));
    }
    cb(null, true);
  }
}).single('foto');

/** Middleware: recibe el campo "foto" y responde con errores claros (400) en lugar de un 500. */
function recibirFoto(req, res, next) {
  subida(req, res, err => {
    if (!err) return next();
    const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'La fotografía es demasiado pesada (máximo 4 MB)' : err.message;
    return res.status(err.status || 400).json({ error: mensaje });
  });
}

/** Devuelve la extensión si el contenido REAL del archivo es una imagen válida; si no, null. */
function extensionPorContenido(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}

/** Guarda la foto y devuelve la ruta relativa que se guarda en la BD (p. ej. "asistencia/5_2026-11-23_entrada_1700.jpg"). */
function guardarFoto(buf, extension, nombreBase) {
  const archivo = `${nombreBase}${extension}`;
  fs.writeFileSync(path.join(carpeta, archivo), buf);
  return `asistencia/${archivo}`;
}

function borrarFoto(rutaRelativa) {
  if (!rutaRelativa) return;
  fs.unlink(path.join(carpeta, path.basename(rutaRelativa)), () => {});
}

function rutaAbsoluta(rutaRelativa) {
  return path.join(carpeta, path.basename(rutaRelativa));
}

module.exports = { recibirFoto, extensionPorContenido, guardarFoto, borrarFoto, rutaAbsoluta };

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const carpetaDestino = path.join(__dirname, '..', '..', 'uploads', 'justificantes');
fs.mkdirSync(carpetaDestino, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, carpetaDestino),
  filename: (req, file, cb) => {
    const nombreUnico = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, nombreUnico);
  }
});

const EXTENSIONES_PERMITIDAS = ['.pdf', '.jpg', '.jpeg', '.png'];

function filtroArchivo(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
    return cb(new Error('Solo se permiten archivos PDF, JPG o PNG'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter: filtroArchivo,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = upload;

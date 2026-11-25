require('dotenv').config();
// La hora de entrada/salida se calcula con la hora de este servidor: se fija la zona horaria de la escuela
process.env.TZ = process.env.TZ || 'America/Mexico_City';
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const routes = require('./src/routes');
const errorHandler = require('./src/middleware/errorHandler');
const { asegurarEsquemaPermisos } = require('./src/utils/permisos');
const { asegurarEsquemaSuspensiones } = require('./src/utils/suspensiones');
const { asegurarEsquemaQR } = require('./src/utils/qr');
const { asegurarEsquemaRecuperacion } = require('./src/controllers/recuperacionController');

const app = express();

app.use(cors());
app.use(express.json());

// Comprobación rápida de que el servidor está vivo
app.get('/api/health', (req, res) => res.json({ ok: true, hora: new Date().toISOString() }));

// API
app.use('/api', routes);

// El frontend se sirve desde el mismo servidor (http://localhost:4000).
// Así el celular y el monitor usan el mismo servidor (y la cámara del celular exige HTTPS, ver README).
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Ruta de API inexistente
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use(errorHandler);

const PORT = process.env.PORT || 4000;

async function iniciar() {
  try {
    await asegurarEsquemaRecuperacion();
  } catch (err) {
    console.error('No se pudo preparar la tabla de recuperación de contraseña:', err.message);
  }
  try {
    await asegurarEsquemaQR();
  } catch (err) {
    console.error('No se pudo preparar el esquema de asistencia por QR:', err.message);
  }
  try {
    await asegurarEsquemaSuspensiones();
  } catch (err) {
    console.error('No se pudieron preparar las tablas de suspensión de clases:', err.message);
  }
  try {
    await asegurarEsquemaPermisos();
  } catch (err) {
    console.error('No se pudieron preparar las tablas de permisos (se usarán los permisos por defecto):', err.message);
  }
  const { SSL_KEY_PATH, SSL_CERT_PATH } = process.env;
  if (SSL_KEY_PATH && SSL_CERT_PATH) {
    // HTTPS directo (la cámara del celular solo funciona en sitios HTTPS)
    require('https').createServer({ key: fs.readFileSync(SSL_KEY_PATH), cert: fs.readFileSync(SSL_CERT_PATH) }, app)
      .listen(PORT, () => console.log(`SICE backend corriendo en https://localhost:${PORT}`));
  } else {
    app.listen(PORT, () => console.log(`SICE backend corriendo en http://localhost:${PORT}`));
  }
}

iniciar();

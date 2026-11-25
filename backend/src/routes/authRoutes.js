const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const { login, me, cambiarPassword } = require('../controllers/authController');
const recuperacion = require('../controllers/recuperacionController');

router.post('/login', asyncHandler(login));
// Recuperación de contraseña (públicas: el usuario aún no puede iniciar sesión)
router.post('/recuperar/solicitar', asyncHandler(recuperacion.solicitar));
router.post('/recuperar/confirmar', asyncHandler(recuperacion.confirmar));
router.get('/me', verifyToken, asyncHandler(me));
router.put('/password', verifyToken, asyncHandler(cambiarPassword));

module.exports = router;

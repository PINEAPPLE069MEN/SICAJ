const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requirePermission, requireRoleEstricto, requireRolOPermiso } = require('../middleware/auth');
const ctrl = require('../controllers/asistenciaController');

router.use(verifyToken);

// Monitor de la escuela: Administrador (o quien tenga el permiso asistencia.monitor)
router.get('/qr-monitor', requirePermission('asistencia.monitor'), asyncHandler(ctrl.monitor));
router.get('/qr-monitor/stream', requirePermission('asistencia.monitor'), asyncHandler(ctrl.streamMonitor));

// Registro: SOLO Docente y Administrativo (403 para cualquier otro rol, incluido el Administrador)
router.post('/registrar-qr', requireRoleEstricto('Docente', 'Administrativo'), asyncHandler(ctrl.registrarQR));

// Historial: el personal ve únicamente lo suyo; los demás necesitan el permiso asistencia.ver
router.get('/', requireRolOPermiso(['Docente', 'Administrativo'], ['asistencia.ver']), asyncHandler(ctrl.listar));

module.exports = router;

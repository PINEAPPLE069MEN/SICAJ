const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requireRolOPermiso } = require('../middleware/auth');
const ctrl = require('../controllers/dashboardController');

router.use(verifyToken);

// El Docente siempre entra (y el controlador solo le devuelve SUS estadísticas); el resto necesita el permiso panel.ver
router.get('/', requireRolOPermiso(['Docente'], ['panel.ver']), asyncHandler(ctrl.resumen));

module.exports = router;

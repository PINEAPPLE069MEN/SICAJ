const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/personalController');

router.use(verifyToken);

// Rutas generales del módulo de personal
router.get('/', requirePermission('personal.ver', 'personal.gestionar'), asyncHandler(ctrl.listar));
router.get('/:id', requirePermission('personal.ver', 'personal.gestionar'), asyncHandler(ctrl.obtener));
router.post('/', requirePermission('personal.gestionar'), asyncHandler(ctrl.crear));
router.put('/:id', requirePermission('personal.gestionar'), asyncHandler(ctrl.actualizar));
router.delete('/:id', requirePermission('personal.gestionar'), asyncHandler(ctrl.eliminar));

module.exports = router;
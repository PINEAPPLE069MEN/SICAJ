const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/materiaController');

router.use(verifyToken);

router.get('/', asyncHandler(ctrl.listar));
router.get('/:id', asyncHandler(ctrl.obtener));

router.post('/', requirePermission('ciclos.gestionar'), asyncHandler(ctrl.crear));
router.put('/:id', requirePermission('ciclos.gestionar'), asyncHandler(ctrl.actualizar));
router.delete('/:id', requirePermission('ciclos.gestionar'), asyncHandler(ctrl.eliminar));

module.exports = router;

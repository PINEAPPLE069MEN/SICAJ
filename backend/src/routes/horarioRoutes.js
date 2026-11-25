const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/horarioController');

router.use(verifyToken);

// Docente ve solo su propio horario (filtrado dentro del controlador), Admin ve todo
router.get('/', asyncHandler(ctrl.listar));
router.post('/', requirePermission('horarios.gestionar'), asyncHandler(ctrl.crear));
router.put('/:id', requirePermission('horarios.gestionar'), asyncHandler(ctrl.actualizar));
router.delete('/:id', requirePermission('horarios.gestionar'), asyncHandler(ctrl.eliminar));

module.exports = router;

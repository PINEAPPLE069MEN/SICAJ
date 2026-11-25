const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/alumnoController');

router.use(verifyToken);

// El filtrado por rol (alumno ve solo lo suyo, tutor solo a sus hijos) pasa dentro del controlador
router.get('/', asyncHandler(ctrl.listar));
router.get('/:id', asyncHandler(ctrl.obtener));

router.post('/', requirePermission('alumnos.gestionar'), asyncHandler(ctrl.crear));
router.put('/:id', requirePermission('alumnos.gestionar'), asyncHandler(ctrl.actualizar));
router.delete('/:id', requirePermission('alumnos.gestionar'), asyncHandler(ctrl.eliminar));

module.exports = router;

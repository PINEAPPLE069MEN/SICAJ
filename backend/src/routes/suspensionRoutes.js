const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/suspensionController');

router.use(verifyToken);

// Cualquier usuario con sesión puede saber si hoy hay suspensión (aviso del panel)
router.get('/hoy', asyncHandler(ctrl.hoy));

router.get('/catalogo', requirePermission('suspensiones.ver', 'suspensiones.gestionar'), asyncHandler(ctrl.catalogo));
router.get('/', requirePermission('suspensiones.ver', 'suspensiones.gestionar'), asyncHandler(ctrl.listar));
router.post('/', requirePermission('suspensiones.gestionar'), asyncHandler(ctrl.crear));
router.delete('/:id', requirePermission('suspensiones.gestionar'), asyncHandler(ctrl.eliminar));

module.exports = router;

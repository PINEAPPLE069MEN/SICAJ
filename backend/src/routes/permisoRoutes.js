const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/permisoController');

router.use(verifyToken, requirePermission('permisos.gestionar'));

router.get('/catalogo', asyncHandler(ctrl.catalogo));
router.get('/roles', asyncHandler(ctrl.roles));
router.get('/rol/:id', asyncHandler(ctrl.obtenerRol));
router.put('/rol/:id', asyncHandler(ctrl.guardarRol));
router.get('/usuarios', asyncHandler(ctrl.usuarios));
router.get('/usuario/:id', asyncHandler(ctrl.obtenerUsuario));
router.put('/usuario/:id', asyncHandler(ctrl.guardarUsuario));
router.delete('/usuario/:id', asyncHandler(ctrl.restablecerUsuario));

module.exports = router;

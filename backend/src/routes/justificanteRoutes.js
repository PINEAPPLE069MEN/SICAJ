const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/justificanteController');

router.use(verifyToken);

router.get('/', asyncHandler(ctrl.listar));
router.post('/', requireRole('Alumno'), upload.single('evidencia'), asyncHandler(ctrl.crear));
router.put('/:id/resolver', requirePermission('justificantes.resolver'), asyncHandler(ctrl.resolver));
router.get('/:id/evidencia', asyncHandler(ctrl.obtenerEvidencia));

module.exports = router;

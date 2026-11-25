const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const ctrl = require('../controllers/reportesController');

router.use(verifyToken, requirePermission('reportes.ver'));
router.get('/tipos', asyncHandler(ctrl.catalogo));
router.get('/pdf', asyncHandler(ctrl.generarPdf));

module.exports = router;

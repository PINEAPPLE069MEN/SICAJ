const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/personal', require('./personalRoutes'));
router.use('/alumnos', require('./alumnoRoutes'));
router.use('/grupos', require('./grupoRoutes'));
router.use('/grados', require('./gradoRoutes'));
router.use('/ciclos', require('./cicloRoutes'));
router.use('/materias', require('./materiaRoutes'));
router.use('/horarios', require('./horarioRoutes'));
router.use('/asistencia', require('./asistenciaRoutes'));
router.use('/justificantes', require('./justificanteRoutes'));
router.use('/dashboard', require('./dashboardRoutes'));
router.use('/reportes', require('./reportesRoutes'));
router.use('/permisos', require('./permisoRoutes'));
router.use('/suspensiones', require('./suspensionRoutes'));

module.exports = router;

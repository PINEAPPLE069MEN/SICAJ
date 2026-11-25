const crearCrudSimple = require('../utils/simpleCrud');

module.exports = crearCrudSimple({
  tabla: 'grado',
  idCampo: 'id_grado',
  camposPermitidos: ['nombre', 'nivel_educativo'],
  etiqueta: 'GRADO'
});

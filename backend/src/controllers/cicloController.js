const crearCrudSimple = require('../utils/simpleCrud');

module.exports = crearCrudSimple({
  tabla: 'ciclo_escolar',
  idCampo: 'id_ciclo',
  camposPermitidos: ['nombre', 'fecha_inicio', 'fecha_fin'],
  etiqueta: 'CICLO'
});

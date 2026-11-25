// Evita tener que escribir try/catch en cada controlador.
// Si la función async truena, el error se manda directo al errorHandler.
module.exports = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

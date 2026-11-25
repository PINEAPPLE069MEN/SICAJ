// Validar texto alfabético estricto (solo letras, espacios, acentos, diéresis y eñes)
function validarTexto(texto, min = 2, max = 50) {
  if (!texto || typeof texto !== 'string') return false;
  const regex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
  const limpio = texto.trim();
  return regex.test(limpio) && limpio.length >= min && limpio.length <= max;
}

// CURP oficial mexicana (18 caracteres con estructura reglamentaria)
function validarCurp(curp) {
  if (!curp || typeof curp !== 'string') return false;
  const regex = /^[A-Z]{4}\d{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
  return regex.test(curp.trim().toUpperCase());
}

// Correo electrónico estándar
function validarCorreo(correo) {
  if (!correo || typeof correo !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(correo.trim()) && correo.trim().length <= 60;
}

// Teléfono a 10 dígitos exactos
function validarTelefono(tel) {
  if (!tel) return false;
  const regex = /^\d{10}$/;
  return regex.test(String(tel).trim());
}

// Código Postal mexicano (5 dígitos numéricos)
function validarCodigoPostal(cp) {
  if (!cp) return false;
  const regex = /^\d{5}$/;
  return regex.test(String(cp).trim());
}

// Número exterior (números y posibles letras como 12-A, Mz 4, s/n)
function validarNumeroExterior(num) {
  if (!num) return false;
  const regex = /^[a-zA-Z0-9\s\-\#\/]+$/;
  return regex.test(String(num).trim()) && String(num).trim().length <= 10;
}

// Fecha en formato válido YYYY-MM-DD y que no sea fecha futura
function validarFechaPasada(fechaStr) {
  if (!fechaStr) return false;
  const fecha = new Date(fechaStr);
  if (isNaN(fecha.getTime())) return false;
  const hoy = new Date();
  return fecha <= hoy;
}

module.exports = {
  validarTexto,
  validarCurp,
  validarCorreo,
  validarTelefono,
  validarCodigoPostal,
  validarNumeroExterior,
  validarFechaPasada
};
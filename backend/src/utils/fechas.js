// Fecha LOCAL del servidor como YYYY-MM-DD (toISOString() usa UTC y cambia el día en la tarde/noche en México)
function fechaLocal(d = new Date()) {
  const dos = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// Valida que sea una fecha real en formato YYYY-MM-DD
function fechaValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto))) return false;
  const d = new Date(`${texto}T00:00:00`);
  return !Number.isNaN(d.getTime()) && fechaLocal(d) === texto;
}

module.exports = { fechaLocal, fechaValida };

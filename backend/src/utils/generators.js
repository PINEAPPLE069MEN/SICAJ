function genNumeroControl() {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `${year}${seq}`;
}

function genClaveEmpleado() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefix = letters[Math.floor(Math.random() * 26)] + letters[Math.floor(Math.random() * 26)];
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `EMP-${prefix}-${seq}`;
}

function genPassword(base) {
  const num = String(Math.floor(Math.random() * 900) + 100);
  return `${base}${num}`;
}

function genFolio() {
  return `JUS-${Date.now()}`;
}

function genIdentificadorTutor() {
  return `T${Date.now().toString().slice(-8)}`;
}

module.exports = { genNumeroControl, genClaveEmpleado, genPassword, genFolio, genIdentificadorTutor };

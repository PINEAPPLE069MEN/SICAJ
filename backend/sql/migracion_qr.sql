-- ====================================================================
-- MIGRACIÓN: asistencia por huella digital  ->  asistencia por código QR
-- Ejecútalo UNA sola vez sobre tu base de datos actual.
-- (Si arrancas el servidor sin correrlo, el servidor crea solo lo que falta
--  — columnas y tabla de tokens —, pero NO borra huella_id: eso es solo de aquí.)
-- ====================================================================

-- 1) Personal: se elimina la dependencia de la huella
ALTER TABLE personal DROP COLUMN huella_id;

-- 2) Asistencia del personal: resultado de la salida
--    (hora_entrada y hora_salida ya existen en esta tabla; ya NO se guardan fotografías)
ALTER TABLE asistencia_docente
  ADD COLUMN estatus_salida ENUM('CUMPLIDA','ANTICIPADA') NULL;

-- 3) Horarios: el personal Administrativo no tiene materia ni grupo, y se guarda desde cuándo existe
--    cada horario (para no contar inasistencias de días anteriores a que se asignara)
ALTER TABLE horario_clase
  MODIFY id_materia INT NULL,
  MODIFY id_grupo INT NULL,
  ADD COLUMN fecha_creacion TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE horario_clase h
  JOIN personal p ON p.id_personal = h.id_docente
  JOIN usuario u ON u.id_usuario = p.id_usuario
  SET h.fecha_creacion = u.fecha_creacion;

-- 4) Token QR activo de un solo uso
CREATE TABLE IF NOT EXISTS qr_tokens_activos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token CHAR(36) NOT NULL UNIQUE,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en DATETIME NOT NULL,
  usado TINYINT(1) NOT NULL DEFAULT 0,
  usado_por INT NULL,
  usado_en DATETIME NULL,
  INDEX idx_qr_estado (usado, expira_en)
);

-- Borra todas las tablas del sistema, en orden seguro (respetando llaves foráneas).
-- Úsalo cuando quieras recargar el esquema desde cero (por ejemplo, si los
-- acentos se guardaron mal por no usar --default-character-set=utf8mb4).

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS bitacora;
DROP TABLE IF EXISTS justificante;
DROP TABLE IF EXISTS alumno_padre;
DROP TABLE IF EXISTS padre_tutor;
DROP TABLE IF EXISTS alumno;
DROP TABLE IF EXISTS asistencia_docente;
DROP TABLE IF EXISTS horario_clase;
DROP TABLE IF EXISTS personal;
DROP TABLE IF EXISTS materia;
DROP TABLE IF EXISTS grupo;
DROP TABLE IF EXISTS grado;
DROP TABLE IF EXISTS ciclo_escolar;
DROP TABLE IF EXISTS usuario;
DROP TABLE IF EXISTS rol;

SET FOREIGN_KEY_CHECKS = 1;

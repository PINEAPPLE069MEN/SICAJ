-- Datos iniciales de SICAJ/SICE (usa --default-character-set=utf8mb4 al cargarlo).
-- Seguro de volver a correr: no duplica registros.

INSERT IGNORE INTO rol (nombre_rol) VALUES
  ('Administrador'), ('Director'), ('Subdirector'), ('Docente'),
  ('Administrativo'), ('Alumno'), ('Padre_Tutor');

-- Usuario administrador de prueba: admin / Admin123  (cámbialo antes de entregar)
INSERT INTO usuario (identificador, password_hash, password_temporal, id_rol)
SELECT 'admin', '$2b$10$SrRUI5Yy3XtXOYcc7Of1Qev60lX896PntsgCTD4Pk3RO/aX3LriGe', 0, id_rol FROM rol WHERE nombre_rol = 'Administrador'
  AND NOT EXISTS (SELECT 1 FROM usuario WHERE identificador = 'admin');

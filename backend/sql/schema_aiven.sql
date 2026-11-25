
-- ================================
-- ROLES Y USUARIOS (login)
-- ================================
CREATE TABLE rol (
  id_rol INT AUTO_INCREMENT PRIMARY KEY,
  nombre_rol ENUM('Administrador','Director','Subdirector','Docente','Administrativo','Alumno','Padre_Tutor') NOT NULL UNIQUE
);

CREATE TABLE usuario (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  identificador VARCHAR(20) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  password_temporal TINYINT(1) NOT NULL DEFAULT 1,
  id_rol INT NOT NULL,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_rol) REFERENCES rol(id_rol)
);

-- ================================
-- CATÁLOGOS ACADÉMICOS
-- ================================
CREATE TABLE ciclo_escolar (
  id_ciclo INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL
);

-- Catálogo independiente de grados (1°, 2°, 3°...). Antes era solo un
-- número suelto dentro de materia/grupo; ahora Materia y Grupo dependen de él.
CREATE TABLE grado (
  id_grado INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(20) NOT NULL,
  nivel_educativo VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_grado (nombre, nivel_educativo)
);

CREATE TABLE grupo (
  id_grupo INT AUTO_INCREMENT PRIMARY KEY,
  id_grado INT NOT NULL,
  letra CHAR(1) NOT NULL,
  turno ENUM('Matutino','Vespertino') NOT NULL,
  id_ciclo INT NOT NULL,
  FOREIGN KEY (id_grado) REFERENCES grado(id_grado),
  FOREIGN KEY (id_ciclo) REFERENCES ciclo_escolar(id_ciclo)
);

CREATE TABLE materia (
  id_materia INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  id_grado INT NOT NULL,
  es_taller TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (id_grado) REFERENCES grado(id_grado)
);

-- ================================
-- PERSONAL (docentes, administrativos, directivos)
-- ================================
CREATE TABLE personal (
  id_personal INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL UNIQUE,
  clave_empleado VARCHAR(15) NOT NULL UNIQUE,
  nombres VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(50) NOT NULL,
  apellido_materno VARCHAR(50) NOT NULL,
  curp CHAR(18) NOT NULL UNIQUE,
  calle VARCHAR(100),
  numero_exterior VARCHAR(10),
  colonia VARCHAR(100),
  municipio VARCHAR(100),
  estado VARCHAR(100),
  codigo_postal CHAR(5),
  telefono VARCHAR(15),
  correo_electronico VARCHAR(100) UNIQUE,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
);

CREATE TABLE horario_clase (
  id_horario INT AUTO_INCREMENT PRIMARY KEY,
  id_docente INT NOT NULL,
  id_materia INT NULL,   -- NULL = jornada administrativa
  id_grupo INT NULL,     -- NULL = jornada administrativa
  fecha_creacion TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  dia_semana ENUM('Lunes','Martes','Miércoles','Jueves','Viernes') NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  FOREIGN KEY (id_docente) REFERENCES personal(id_personal),
  FOREIGN KEY (id_materia) REFERENCES materia(id_materia),
  FOREIGN KEY (id_grupo) REFERENCES grupo(id_grupo)
);

CREATE TABLE asistencia_docente (
  id_asistencia INT AUTO_INCREMENT PRIMARY KEY,
  id_docente INT NOT NULL,
  fecha DATE NOT NULL,
  hora_entrada TIME,
  hora_salida TIME,
  id_horario_referencia INT NOT NULL,
  estatus ENUM('PUNTUAL','RETARDO','FALTA') NOT NULL,
  estatus_salida ENUM('CUMPLIDA','ANTICIPADA') NULL,
  FOREIGN KEY (id_docente) REFERENCES personal(id_personal),
  FOREIGN KEY (id_horario_referencia) REFERENCES horario_clase(id_horario)
);

-- Código QR del monitor: un solo token activo; se invalida al usarse o al expirar
CREATE TABLE qr_tokens_activos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token CHAR(36) NOT NULL UNIQUE,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en DATETIME NOT NULL,
  usado TINYINT(1) NOT NULL DEFAULT 0,
  usado_por INT NULL,
  usado_en DATETIME NULL,
  INDEX idx_qr_estado (usado, expira_en)
);

-- ================================
-- ALUMNOS Y TUTORES
-- ================================
CREATE TABLE alumno (
  id_alumno INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL UNIQUE,
  numero_control VARCHAR(15) NOT NULL UNIQUE,
  nombres VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(50) NOT NULL,
  apellido_materno VARCHAR(50) NOT NULL,
  curp CHAR(18) NOT NULL UNIQUE,
  sexo ENUM('M','F') NOT NULL,
  fecha_nacimiento DATE NOT NULL,
  calle VARCHAR(100),
  numero_exterior VARCHAR(10),
  colonia VARCHAR(100),
  municipio VARCHAR(100),
  estado VARCHAR(100),
  codigo_postal CHAR(5),
  id_grupo INT,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_grupo) REFERENCES grupo(id_grupo)
);

CREATE TABLE padre_tutor (
  id_padre INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL UNIQUE,
  nombres VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(50) NOT NULL,
  apellido_materno VARCHAR(50) NOT NULL,
  curp CHAR(18) NOT NULL UNIQUE,
  parentesco VARCHAR(30) NOT NULL,
  calle VARCHAR(100),
  numero_exterior VARCHAR(10),
  colonia VARCHAR(100),
  municipio VARCHAR(100),
  estado VARCHAR(100),
  codigo_postal CHAR(5),
  telefono VARCHAR(15),
  correo_electronico VARCHAR(100),
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
);

CREATE TABLE alumno_talleres (
  id_alumno INT NOT NULL,
  id_materia INT NOT NULL,
  PRIMARY KEY (id_alumno, id_materia),
  FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno) ON DELETE CASCADE,
  FOREIGN KEY (id_materia) REFERENCES materia(id_materia) ON DELETE CASCADE
);

CREATE TABLE alumno_padre (
  id_alumno INT NOT NULL,
  id_padre INT NOT NULL,
  PRIMARY KEY (id_alumno, id_padre),
  FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno) ON DELETE CASCADE,
  FOREIGN KEY (id_padre) REFERENCES padre_tutor(id_padre) ON DELETE CASCADE
);

-- ================================
-- JUSTIFICANTES
-- Ahora los solicita el Alumno (antes lo daba de alta el Administrador),
-- requieren evidencia adjunta obligatoria, y pasan por un flujo de
-- aprobación (Pendiente -> Aprobado/Rechazado) a cargo de un "Encargado".
-- Mientras la institución no defina exactamente quién es el "Encargado",
-- el sistema permite resolver a Administrador y Directivo.
-- ================================
CREATE TABLE justificante (
  id_justificante INT AUTO_INCREMENT PRIMARY KEY,
  folio VARCHAR(20) NOT NULL UNIQUE,
  id_alumno INT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  archivo_adjunto VARCHAR(255) NOT NULL,
  estatus ENUM('Pendiente','Aprobado','Rechazado') NOT NULL DEFAULT 'Pendiente',
  id_usuario_creador INT NOT NULL,
  id_usuario_resolutor INT,
  comentario_resolucion VARCHAR(255),
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_resolucion TIMESTAMP NULL,
  FOREIGN KEY (id_alumno) REFERENCES alumno(id_alumno),
  FOREIGN KEY (id_usuario_creador) REFERENCES usuario(id_usuario),
  FOREIGN KEY (id_usuario_resolutor) REFERENCES usuario(id_usuario)
);

-- ================================
-- BITÁCORA (auditoría de acciones)
-- ================================
CREATE TABLE bitacora (
  id_bitacora BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  accion VARCHAR(100) NOT NULL,
  detalle TEXT,
  fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
);

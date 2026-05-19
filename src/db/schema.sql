-- =====================================================================
-- SISTEMA DE GESTIÓN DE CHOFERES E INCENTIVOS
-- Migración a MySQL
-- =====================================================================

-- Deshabilitar temporalmente las verificaciones de claves foráneas
SET FOREIGN_KEY_CHECKS = 0;

-- Eliminar tablas en orden inverso a las dependencias
DROP TABLE IF EXISTS incentivos;
DROP TABLE IF EXISTS limpieza_cuidado;
DROP TABLE IF EXISTS servicio_clientes;
DROP TABLE IF EXISTS puntualidad;
DROP TABLE IF EXISTS rendimiento_diario;
DROP TABLE IF EXISTS check_unidad_fotos;
DROP TABLE IF EXISTS check_unidad_items;
DROP TABLE IF EXISTS check_unidad;
DROP TABLE IF EXISTS verificaciones;
DROP TABLE IF EXISTS horarios_ruta;
DROP TABLE IF EXISTS factores_rendimiento;
DROP TABLE IF EXISTS unidades;
DROP TABLE IF EXISTS choferes;
DROP TABLE IF EXISTS rutas;
DROP TABLE IF EXISTS usuarios;

-- Volver a habilitar verificaciones
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- CREACIÓN DE TABLAS
-- =====================================================================

-- Usuarios
CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('supervisor', 'chofer', 'checador_unidad') NOT NULL,
  nombre_completo VARCHAR(120) NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rutas (debe crearse antes que choferes por la FK)
CREATE TABLE rutas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) UNIQUE NOT NULL,
  descripcion TEXT,
  activa BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Choferes (depende de usuarios y rutas)
CREATE TABLE choferes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  numero_licencia VARCHAR(50),
  tipo_licencia VARCHAR(20),
  vigencia_licencia DATE,
  telefono VARCHAR(20),
  foto_url TEXT,
  ruta_asignada_id INT,
  fecha_ingreso DATE DEFAULT (CURRENT_DATE),
  activo BOOLEAN DEFAULT TRUE,
  notas TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (ruta_asignada_id) REFERENCES rutas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Unidades
CREATE TABLE unidades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  placas VARCHAR(20) UNIQUE NOT NULL,
  numero_economico VARCHAR(30),
  kilometraje_actual INT NOT NULL DEFAULT 0,
  fecha_ultima_verificacion DATE,
  proxima_verificacion DATE,
  activa BOOLEAN DEFAULT TRUE,
  notas TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Factores de rendimiento histórico
CREATE TABLE factores_rendimiento (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ruta_id INT UNIQUE NOT NULL,
  km_por_litro_objetivo DECIMAL(8,3) NOT NULL,
  vigente_desde DATE DEFAULT (CURRENT_DATE),
  notas TEXT,
  FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Horarios de ruta
CREATE TABLE horarios_ruta (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ruta_id INT NOT NULL,
  fecha DATE NOT NULL,
  hora_salida TIME NOT NULL,
  tolerancia_minutos INT DEFAULT 20,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (ruta_id, fecha),
  FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verificaciones vehiculares
CREATE TABLE verificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unidad_id INT NOT NULL,
  fecha_verificacion DATE NOT NULL,
  proxima_verificacion DATE NOT NULL,
  folio VARCHAR(50),
  costo DECIMAL(10,2),
  notas TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (unidad_id) REFERENCES unidades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Check de unidad (cabecera)
CREATE TABLE check_unidad (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('chofer', 'checador') NOT NULL,
  fecha DATE NOT NULL DEFAULT (CURRENT_DATE),
  hora TIME NOT NULL DEFAULT (CURRENT_TIME),
  unidad_id INT NOT NULL,
  chofer_id INT,
  usuario_id INT,
  kilometraje INT,
  reporta_servicio_preventivo BOOLEAN DEFAULT FALSE,
  detalle_servicio_preventivo TEXT,
  observaciones TEXT,
  observaciones_unidad TEXT,
  folio VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (unidad_id) REFERENCES unidades(id) ON DELETE CASCADE,
  FOREIGN KEY (chofer_id) REFERENCES choferes(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_check_unidad_fecha ON check_unidad(fecha);
CREATE INDEX idx_check_unidad_chofer ON check_unidad(chofer_id);
CREATE INDEX idx_check_unidad_unidad ON check_unidad(unidad_id);

-- Items del check de unidad
CREATE TABLE check_unidad_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  check_id INT NOT NULL,
  categoria ENUM('documentos', 'sistema_luces', 'estado_neumaticos', 'accesorios_seguridad', 'parte_interna', 'parte_externa') NOT NULL,
  item VARCHAR(100) NOT NULL,
  estado ENUM('si', 'no', 'na') NOT NULL DEFAULT 'na',
  comentario TEXT,
  FOREIGN KEY (check_id) REFERENCES check_unidad(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fotos del check de unidad
CREATE TABLE check_unidad_fotos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  check_id INT NOT NULL,
  tipo ENUM('frente', 'lado_derecho', 'lado_izquierdo', 'atras', 'incidente', 'falla') NOT NULL,
  url TEXT NOT NULL,
  public_id VARCHAR(255),
  descripcion TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (check_id) REFERENCES check_unidad(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rendimiento diario (con columnas generadas)
CREATE TABLE rendimiento_diario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  chofer_id INT NOT NULL,
  unidad_id INT NOT NULL,
  ruta_id INT NOT NULL,
  km_inicial INT NOT NULL,
  km_final INT NOT NULL,
  km_recorridos INT GENERATED ALWAYS AS (km_final - km_inicial) STORED,
  litros DECIMAL(10,3) NOT NULL,
  precio_litro DECIMAL(10,3) NOT NULL,
  total_combustible DECIMAL(12,2) GENERATED ALWAYS AS (litros * precio_litro) STORED,
  total_mercancia DECIMAL(12,2) DEFAULT 0,
  casetas DECIMAL(10,2) DEFAULT 0,
  rendimiento DECIMAL(10,3) GENERATED ALWAYS AS (
    CASE WHEN litros > 0 THEN (km_final - km_inicial) / litros ELSE 0 END
  ) STORED,
  cumple_objetivo BOOLEAN DEFAULT FALSE,
  notas TEXT,
  registrado_por INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (fecha, chofer_id, unidad_id),
  FOREIGN KEY (chofer_id) REFERENCES choferes(id) ON DELETE CASCADE,
  FOREIGN KEY (unidad_id) REFERENCES unidades(id) ON DELETE CASCADE,
  FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_rendimiento_fecha ON rendimiento_diario(fecha);
CREATE INDEX idx_rendimiento_chofer ON rendimiento_diario(chofer_id);

-- Puntualidad (minutos_retraso y a_tiempo se calculan mediante triggers)
CREATE TABLE puntualidad (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  chofer_id INT NOT NULL,
  ruta_id INT NOT NULL,
  hora_programada TIME NOT NULL,
  hora_salida_real TIME NOT NULL,
  tolerancia_minutos INT DEFAULT 20,
  minutos_retraso INT,
  a_tiempo BOOLEAN,
  notas TEXT,
  registrado_por INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (fecha, chofer_id),
  FOREIGN KEY (chofer_id) REFERENCES choferes(id) ON DELETE CASCADE,
  FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_puntualidad_fecha ON puntualidad(fecha);

-- Servicio a clientes
CREATE TABLE servicio_clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  chofer_id INT NOT NULL,
  ruta_id INT NOT NULL,
  clientes_esperados INT NOT NULL DEFAULT 0,
  clientes_visitados INT NOT NULL DEFAULT 0,
  incidencias INT DEFAULT 0,
  comentarios TEXT,
  registrado_por INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (fecha, chofer_id),
  FOREIGN KEY (chofer_id) REFERENCES choferes(id) ON DELETE CASCADE,
  FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_servicio_fecha ON servicio_clientes(fecha);

-- Limpieza y cuidado
CREATE TABLE limpieza_cuidado (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  chofer_id INT NOT NULL,
  unidad_id INT NOT NULL,
  lavada_semana BOOLEAN DEFAULT FALSE,
  reporto_falla BOOLEAN DEFAULT FALSE,
  detalle_falla TEXT,
  mantenimiento_realizado BOOLEAN DEFAULT TRUE,
  mantenimiento_a_tiempo BOOLEAN DEFAULT TRUE,
  chofer_reporto_preventivo BOOLEAN DEFAULT FALSE,
  notas TEXT,
  registrado_por INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (fecha, chofer_id, unidad_id),
  FOREIGN KEY (chofer_id) REFERENCES choferes(id) ON DELETE CASCADE,
  FOREIGN KEY (unidad_id) REFERENCES unidades(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_limpieza_fecha ON limpieza_cuidado(fecha);

-- Incentivos mensuales
CREATE TABLE incentivos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  chofer_id INT NOT NULL,
  ruta_id INT,
  dias_trabajados INT DEFAULT 0,
  score_rendimiento DECIMAL(5,4) DEFAULT 0,
  score_puntualidad DECIMAL(5,4) DEFAULT 0,
  score_servicio DECIMAL(5,4) DEFAULT 0,
  score_limpieza DECIMAL(5,4) DEFAULT 0,
  score_total DECIMAL(5,4) DEFAULT 0,
  monto DECIMAL(10,2) DEFAULT 0,
  monto_maximo DECIMAL(10,2) DEFAULT 4000,
  notas TEXT,
  calculado_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (anio, mes, chofer_id),
  FOREIGN KEY (chofer_id) REFERENCES choferes(id) ON DELETE CASCADE,
  FOREIGN KEY (ruta_id) REFERENCES rutas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_incentivos_periodo ON incentivos(anio, mes);

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- Actualizar kilometraje de la unidad tras insertar o actualizar rendimiento
DELIMITER //

CREATE TRIGGER tg_actualizar_km_insert
AFTER INSERT ON rendimiento_diario
FOR EACH ROW
BEGIN
  UPDATE unidades
  SET kilometraje_actual = NEW.km_final,
      updated_at = NOW()
  WHERE id = NEW.unidad_id;
END;//

CREATE TRIGGER tg_actualizar_km_update
AFTER UPDATE ON rendimiento_diario
FOR EACH ROW
BEGIN
  IF NEW.km_final <> OLD.km_final THEN
    UPDATE unidades
    SET kilometraje_actual = NEW.km_final,
        updated_at = NOW()
    WHERE id = NEW.unidad_id;
  END IF;
END;//

-- Calcular minutos de retraso y puntualidad antes de insertar o actualizar
CREATE TRIGGER tg_calc_puntualidad_insert
BEFORE INSERT ON puntualidad
FOR EACH ROW
BEGIN
  DECLARE diff_min INT;
  SET diff_min = (TIME_TO_SEC(NEW.hora_salida_real) - TIME_TO_SEC(NEW.hora_programada)) / 60;
  SET NEW.minutos_retraso = GREATEST(diff_min, 0);
  SET NEW.a_tiempo = diff_min <= COALESCE(NEW.tolerancia_minutos, 20);
END;//

CREATE TRIGGER tg_calc_puntualidad_update
BEFORE UPDATE ON puntualidad
FOR EACH ROW
BEGIN
  DECLARE diff_min INT;
  SET diff_min = (TIME_TO_SEC(NEW.hora_salida_real) - TIME_TO_SEC(NEW.hora_programada)) / 60;
  SET NEW.minutos_retraso = GREATEST(diff_min, 0);
  SET NEW.a_tiempo = diff_min <= COALESCE(NEW.tolerancia_minutos, 20);
END;//

DROP FUNCTION IF EXISTS limpiar_chequeos_antiguos;
-- Función para limpiar chequeos antiguos (más de 60 días)
CREATE FUNCTION limpiar_chequeos_antiguos()
RETURNS INT
MODIFIES SQL DATA
BEGIN
  DECLARE filas_eliminadas INT;
  DELETE FROM check_unidad
  WHERE fecha < CURDATE() - INTERVAL 60 DAY;
  SET filas_eliminadas = ROW_COUNT();
  RETURN filas_eliminadas;
END;//

DELIMITER ;

-- Índice adicional para próxima verificación
CREATE INDEX idx_verificaciones_proxima ON verificaciones(proxima_verificacion);

CREATE TABLE IF NOT EXISTS chofer_rutas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chofer_id INT NOT NULL,
  ruta_id INT NOT NULL,
  es_principal BOOLEAN DEFAULT FALSE,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_chofer_ruta (chofer_id, ruta_id),

  CONSTRAINT fk_chofer_rutas_chofer
    FOREIGN KEY (chofer_id) REFERENCES choferes(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_chofer_rutas_ruta
    FOREIGN KEY (ruta_id) REFERENCES rutas(id)
    ON DELETE CASCADE
);

INSERT INTO chofer_rutas (chofer_id, ruta_id, es_principal)
SELECT id, ruta_asignada_id, TRUE
FROM choferes
WHERE ruta_asignada_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  es_principal = VALUES(es_principal),
  activo = TRUE;
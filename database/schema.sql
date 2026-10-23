CREATE DATABASE IF NOT EXISTS arinc429
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE arinc429;

CREATE TABLE IF NOT EXISTS instrument_shipments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  instrument_id VARCHAR(40) NOT NULL,
  instrument VARCHAR(120) NOT NULL,
  parameter VARCHAR(120) NOT NULL,
  value DECIMAL(20, 6) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'sent',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_shipments_created_at (created_at),
  INDEX idx_shipments_instrument_id (instrument_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
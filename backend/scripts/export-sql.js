// Genera un dump SQL autocontenido e importable desde cualquier IDE / cliente MySQL
// (phpMyAdmin, HeidiSQL, MySQL Workbench, DBeaver, consola mysql, etc.).
// Incluye: CREATE DATABASE + USE + esquema (schema.sql) + datos de ejemplo.
// Uso: npm run db:export   ->   genera sql/stockify_import.sql
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/core/password.js';
import { config } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(__dirname, '..', 'sql');
const dbName = config.db.database || 'stockify';

function q(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function main() {
  const schema = fs.readFileSync(path.join(sqlDir, 'schema.sql'), 'utf8').trim();
  const pass = await hashPassword('12345');

  const seed = `
-- ============================================================
--  Datos de ejemplo (usuarios de prueba, contrasenia = "12345")
-- ============================================================

INSERT INTO empresa (id, nombre, rut, direccion, telefono) VALUES
  (1, ${q('Distribuidora Demo S.A.')}, ${q('210000000012')}, ${q('Av. Siempre Viva 742')}, ${q('099111222')});

INSERT INTO sucursal (id, nombre, direccion, telefono, empresa_id) VALUES
  (1, ${q('Sucursal Centro')},  ${q('Calle 18 de Julio 1234')}, ${q('099333444')}, 1),
  (2, ${q('Sucursal Pocitos')}, ${q('Av. Brasil 2500')},        ${q('099555666')}, 1);

INSERT INTO usuario (id, nombre, apellido, nombre_usuario, contrasenia, rol, sucursal_id) VALUES
  (1, ${q('Sofia')},  ${q('Perez')},     ${q('superadmin')}, ${q(pass)}, ${q('SUPERADMINISTRADOR')}, 1),
  (2, ${q('Martin')}, ${q('Gomez')},     ${q('admin')},      ${q(pass)}, ${q('ADMINISTRADOR')},      1),
  (3, ${q('Lucia')},  ${q('Fernandez')}, ${q('empleado')},   ${q(pass)}, ${q('EMPLEADO')},           1);

INSERT INTO categoria (id, nombre, descripcion, codigo_categoria, sucursal_id) VALUES
  (1, ${q('Bebidas')}, ${q('Bebidas y refrescos')}, ${q('BEB')}, 1),
  (2, ${q('Almacen')}, ${q('Productos de almacen')}, ${q('ALM')}, 1);

INSERT INTO proveedor (id, rut, nombre, direccion, telefono, nombre_vendedor) VALUES
  (1, ${q('215000000018')}, ${q('Proveedor Central')}, ${q('Ruta 8 km 20')}, ${q('098000111')}, ${q('Juan Vendedor')});

INSERT INTO producto (id, codigo_producto, nombre, detalle, precio, cantidad_stock, sucursal_id, categoria_id) VALUES
  (1, ${q('P001')}, ${q('Agua mineral 500ml')},  ${q('Botella 500ml')}, 32.5, 120, 1, 1),
  (2, ${q('P002')}, ${q('Refresco cola 1.5L')},  ${q('Botella 1.5L')},  89.0, 60,  1, 1),
  (3, ${q('P003')}, ${q('Arroz 1kg')},           ${q('Paquete 1kg')},   54.0, 80,  1, 2),
  (4, ${q('P004')}, ${q('Fideos 500g')},         ${q('Paquete 500g')},  41.0, 95,  1, 2);

INSERT INTO codigo_barra (codigo, producto_id) VALUES
  (${q('7791234500011')}, 1),
  (${q('7791234500028')}, 2),
  (${q('7791234500035')}, 3),
  (${q('7791234500042')}, 4);

INSERT INTO producto_proveedor (producto_id, proveedor_id) VALUES
  (1, 1), (2, 1), (3, 1), (4, 1);
`.trim();

  const out = `-- ============================================================
--  Stockify 2.0 - Dump completo importable (MySQL / MariaDB)
--  Generado por: npm run db:export
--
--  Como importar:
--   * IDE/cliente (HeidiSQL, Workbench, DBeaver, phpMyAdmin):
--       abrir este archivo y ejecutarlo, o "Importar" este .sql.
--   * Consola:  mysql -u root -p < stockify_import.sql
--
--  Crea la base "${dbName}", todas las tablas y datos de ejemplo.
--  Usuarios de prueba (contrasenia = "12345"): superadmin / admin / empleado
-- ============================================================

CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`${dbName}\`;

${schema}

${seed}
`;

  const outPath = path.join(sqlDir, 'stockify_import.sql');
  fs.writeFileSync(outPath, out, 'utf8');
  console.log(`✅ Dump generado: ${path.relative(process.cwd(), outPath)}`);
}

main().catch((err) => {
  console.error('❌ Error generando el dump:', err.message);
  process.exit(1);
});

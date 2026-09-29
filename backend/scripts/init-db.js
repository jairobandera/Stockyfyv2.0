// Inicializa la base de datos: crea el esquema y carga datos de ejemplo.
// Uso: npm run db:init
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config/env.js';
import { hashPassword } from '../src/core/password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(__dirname, '..', 'sql');

async function main() {
  // Conexion sin base seleccionada para poder crearla.
  const root = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  console.log(`> Creando base de datos "${config.db.database}" si no existe...`);
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await root.query(`USE \`${config.db.database}\``);

  console.log('> Ejecutando schema.sql...');
  const schema = fs.readFileSync(path.join(sqlDir, 'schema.sql'), 'utf8');
  await root.query(schema);

  console.log('> Cargando datos de ejemplo...');
  await seed(root);

  await root.end();
  console.log('\n✅ Base de datos lista.');
  console.log('   Usuarios de prueba (contrasenia = "12345"):');
  console.log('     - superadmin   (SUPERADMINISTRADOR)');
  console.log('     - admin        (ADMINISTRADOR, Sucursal Centro)');
  console.log('     - empleado     (EMPLEADO, Sucursal Centro)');
}

async function seed(conn) {
  // Empresa
  const [empRes] = await conn.query(
    `INSERT INTO empresa (nombre, rut, direccion, telefono) VALUES (?,?,?,?)`,
    ['Distribuidora Demo S.A.', '210000000012', 'Av. Siempre Viva 742', '099111222']
  );
  const empresaId = empRes.insertId;

  // Sucursales
  const [suc1] = await conn.query(
    `INSERT INTO sucursal (nombre, direccion, telefono, empresa_id) VALUES (?,?,?,?)`,
    ['Sucursal Centro', 'Calle 18 de Julio 1234', '099333444', empresaId]
  );
  const sucursalId = suc1.insertId;
  await conn.query(
    `INSERT INTO sucursal (nombre, direccion, telefono, empresa_id) VALUES (?,?,?,?)`,
    ['Sucursal Pocitos', 'Av. Brasil 2500', '099555666', empresaId]
  );

  // Usuarios
  const pass = await hashPassword('12345');
  await conn.query(
    `INSERT INTO usuario (nombre, apellido, nombre_usuario, contrasenia, rol, sucursal_id) VALUES
      (?,?,?,?,?,?), (?,?,?,?,?,?), (?,?,?,?,?,?)`,
    [
      'Sofia', 'Perez', 'superadmin', pass, 'SUPERADMINISTRADOR', sucursalId,
      'Martin', 'Gomez', 'admin', pass, 'ADMINISTRADOR', sucursalId,
      'Lucia', 'Fernandez', 'empleado', pass, 'EMPLEADO', sucursalId,
    ]
  );

  // Categorias
  const [catBebidas] = await conn.query(
    `INSERT INTO categoria (nombre, descripcion, codigo_categoria, sucursal_id) VALUES (?,?,?,?)`,
    ['Bebidas', 'Bebidas y refrescos', 'BEB', sucursalId]
  );
  const [catAlmacen] = await conn.query(
    `INSERT INTO categoria (nombre, descripcion, codigo_categoria, sucursal_id) VALUES (?,?,?,?)`,
    ['Almacen', 'Productos de almacen', 'ALM', sucursalId]
  );

  // Proveedor
  const [prov] = await conn.query(
    `INSERT INTO proveedor (rut, nombre, direccion, telefono, nombre_vendedor) VALUES (?,?,?,?,?)`,
    ['215000000018', 'Proveedor Central', 'Ruta 8 km 20', '098000111', 'Juan Vendedor']
  );

  // Productos de ejemplo
  const productos = [
    ['P001', 'Agua mineral 500ml', 'Botella 500ml', 32.5, 120, catBebidas.insertId, '7791234500011'],
    ['P002', 'Refresco cola 1.5L', 'Botella 1.5L', 89.0, 60, catBebidas.insertId, '7791234500028'],
    ['P003', 'Arroz 1kg', 'Paquete 1kg', 54.0, 80, catAlmacen.insertId, '7791234500035'],
    ['P004', 'Fideos 500g', 'Paquete 500g', 41.0, 95, catAlmacen.insertId, '7791234500042'],
  ];
  for (const [cod, nombre, detalle, precio, stock, categoriaId, barra] of productos) {
    const [pr] = await conn.query(
      `INSERT INTO producto (codigo_producto, nombre, detalle, precio, cantidad_stock, sucursal_id, categoria_id)
       VALUES (?,?,?,?,?,?,?)`,
      [cod, nombre, detalle, precio, stock, sucursalId, categoriaId]
    );
    await conn.query(`INSERT INTO codigo_barra (codigo, producto_id) VALUES (?,?)`, [barra, pr.insertId]);
    await conn.query(`INSERT INTO producto_proveedor (producto_id, proveedor_id) VALUES (?,?)`, [pr.insertId, prov.insertId]);
  }
}

main().catch((err) => {
  console.error('❌ Error inicializando la base de datos:', err.message);
  process.exit(1);
});

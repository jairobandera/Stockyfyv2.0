import { query } from '../../config/db.js';

const SELECT = `
  SELECT id, codigo_producto AS codigoProducto, imagen, nombre, detalle, precio,
         cantidad_stock AS cantidadStock, activo,
         sucursal_id AS sucursalId, categoria_id AS categoriaId
  FROM producto`;

export function normalizeProducto(row, codigosBarra = [], proveedorIds = []) {
  if (!row) return row;
  return {
    ...row,
    activo: !!row.activo,
    precio: row.precio === null ? null : Number(row.precio),
    cantidadStock: row.cantidadStock === null ? null : Number(row.cantidadStock),
    codigosBarra,
    proveedorIds,
  };
}

async function hydrate(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const inClause = ids.map(() => '?').join(',');
  const barras = await query(
    `SELECT producto_id AS productoId, codigo FROM codigo_barra WHERE producto_id IN (${inClause})`,
    ids
  );
  const provs = await query(
    `SELECT producto_id AS productoId, proveedor_id AS proveedorId
     FROM producto_proveedor WHERE producto_id IN (${inClause})`,
    ids
  );
  const barrasBy = groupBy(barras, 'productoId', 'codigo');
  const provsBy = groupBy(provs, 'productoId', 'proveedorId');
  return rows.map((r) => normalizeProducto(r, barrasBy.get(r.id) || [], provsBy.get(r.id) || []));
}

function groupBy(list, key, value) {
  const map = new Map();
  for (const item of list) {
    if (!map.has(item[key])) map.set(item[key], []);
    map.get(item[key]).push(item[value]);
  }
  return map;
}

export const productoRepository = {
  async findAllActive() { return hydrate(await query(`${SELECT} WHERE activo = 1`)); },
  async findAll() { return hydrate(await query(SELECT)); },
  async findActiveBySucursal(sucursalId) {
    return hydrate(await query(`${SELECT} WHERE sucursal_id = ? AND activo = 1`, [sucursalId]));
  },
  async findByIdActive(id) { return (await hydrate(await query(`${SELECT} WHERE id = ? AND activo = 1`, [id])))[0] || null; },
  async findByIdHydrated(id) { return (await hydrate(await query(`${SELECT} WHERE id = ?`, [id])))[0] || null; },
  async findByIdRaw(id) { const r = await query(`${SELECT} WHERE id = ?`, [id]); return r[0] || null; },
  async findByCodigoProductoActive(codigo) {
    return (await hydrate(await query(`${SELECT} WHERE codigo_producto = ? AND activo = 1`, [codigo])))[0] || null;
  },
  async findByCodigoProductoRaw(codigo) {
    const r = await query(`${SELECT} WHERE codigo_producto = ?`, [codigo]);
    return r[0] || null;
  },
  async findByCodigoProductoAndSucursal(codigo, sucursalId) {
    const r = await query(`${SELECT} WHERE codigo_producto = ? AND sucursal_id = ?`, [codigo, sucursalId]);
    return r[0] || null;
  },
  async findByCodigoBarra(codigo) {
    const r = await query(
      `${SELECT} WHERE id = (SELECT producto_id FROM codigo_barra WHERE codigo = ? LIMIT 1)`,
      [codigo]
    );
    return r[0] || null;
  },
};

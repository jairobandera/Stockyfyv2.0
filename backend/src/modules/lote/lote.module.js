import { query, transaction } from '../../config/db.js';
import { Router } from '../../core/router.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { badRequest, notFound } from '../../core/httpError.js';

const SELECT = `
  SELECT id, numero_lote AS numeroLote, fecha_ingreso AS fechaIngreso,
         fecha_vencimiento AS fechaVencimiento, cantidad_stock AS cantidadStock,
         activo, producto_id AS productoId
  FROM lote`;

function normalize(row) {
  if (!row) return row;
  return { ...row, activo: !!row.activo };
}

async function validate(dto) {
  if (!dto.numeroLote) throw badRequest('El numero de lote es requerido');
  if (!dto.fechaIngreso) throw badRequest('La fecha de ingreso es requerida');
  if (dto.cantidadStock === undefined || dto.cantidadStock === null || dto.cantidadStock < 0) {
    throw badRequest('La cantidad de stock debe ser mayor o igual a 0');
  }
  if (!dto.productoId) throw badRequest('Debe seleccionar un producto');
  const prod = await query(`SELECT id, activo FROM producto WHERE id = ?`, [dto.productoId]);
  if (!prod.length) throw badRequest(`Producto no encontrado con id: ${dto.productoId}`);
  if (!prod[0].activo) throw badRequest(`El producto con id ${dto.productoId} no esta activo`);
}

export const loteService = {
  async getAllActive() { return (await query(`${SELECT} WHERE activo = 1`)).map(normalize); },
  async getAllIncludingInactive() { return (await query(SELECT)).map(normalize); },
  async getBySucursal(sucursalId) {
    return (await query(
      `${SELECT} WHERE producto_id IN (SELECT id FROM producto WHERE sucursal_id = ?)`, [sucursalId]
    )).map(normalize);
  },
  async getActiveBySucursal(sucursalId) {
    return (await query(
      `${SELECT} WHERE activo = 1 AND producto_id IN (SELECT id FROM producto WHERE sucursal_id = ?)`, [sucursalId]
    )).map(normalize);
  },
  async getById(id) {
    const r = await query(`${SELECT} WHERE id = ? AND activo = 1`, [id]);
    return normalize(r[0] || null);
  },
  async create(dto) {
    await validate(dto);
    const id = await transaction(async (conn) => {
      const [res] = await conn.execute(
        `INSERT INTO lote (numero_lote, fecha_ingreso, fecha_vencimiento, cantidad_stock, activo, producto_id)
         VALUES (?,?,?,?,1,?)`,
        [dto.numeroLote, dto.fechaIngreso, dto.fechaVencimiento ?? null, dto.cantidadStock, dto.productoId]
      );
      await adjustStock(conn, dto.productoId, dto.cantidadStock);
      return res.insertId;
    });
    return this.getById(id);
  },
  async update(id, dto) {
    await validate(dto);
    const existing = (await query(`${SELECT} WHERE id = ?`, [id]))[0];
    if (!existing) return null;
    await transaction(async (conn) => {
      const oldStock = existing.cantidadStock;
      const newStock = dto.cantidadStock ?? oldStock;
      await adjustStock(conn, existing.productoId, newStock - oldStock);
      await conn.execute(
        `UPDATE lote SET numero_lote = ?, fecha_ingreso = ?, fecha_vencimiento = ?, cantidad_stock = ?, producto_id = ?
         WHERE id = ?`,
        [dto.numeroLote ?? existing.numeroLote, dto.fechaIngreso ?? existing.fechaIngreso,
         dto.fechaVencimiento ?? null, newStock, dto.productoId ?? existing.productoId, id]
      );
    });
    return this.getById(id);
  },
  async deactivate(id) {
    const existing = (await query(`${SELECT} WHERE id = ?`, [id]))[0];
    if (!existing) throw notFound(`Lote no encontrado con id: ${id}`);
    if (!existing.activo) throw badRequest('El lote ya esta inactivo');
    await transaction(async (conn) => {
      await adjustStock(conn, existing.productoId, -existing.cantidadStock);
      await conn.execute(`UPDATE lote SET activo = 0 WHERE id = ?`, [id]);
    });
  },
};

async function adjustStock(conn, productoId, delta) {
  const [rows] = await conn.execute(`SELECT cantidad_stock FROM producto WHERE id = ?`, [productoId]);
  const nuevo = Number(rows[0].cantidad_stock) + Number(delta);
  if (nuevo < 0) throw badRequest('El stock del producto no puede ser negativo');
  await conn.execute(`UPDATE producto SET cantidad_stock = ? WHERE id = ?`, [nuevo, productoId]);
}

export const loteRoutes = new Router();
loteRoutes.get('/', async (ctx, res) => sendJson(res, 200, await loteService.getAllActive()));
loteRoutes.get('/all', async (ctx, res) => sendJson(res, 200, await loteService.getAllIncludingInactive()));
loteRoutes.get('/sucursal/:sucursalId/activos', async (ctx, res) =>
  sendJson(res, 200, await loteService.getActiveBySucursal(ctx.params.sucursalId)));
loteRoutes.get('/sucursal/:sucursalId', async (ctx, res) =>
  sendJson(res, 200, await loteService.getBySucursal(ctx.params.sucursalId)));
loteRoutes.get('/:id', async (ctx, res) => {
  const l = await loteService.getById(ctx.params.id);
  l ? sendJson(res, 200, l) : sendJson(res, 404, null);
});
loteRoutes.post('/', async (ctx, res) => sendJson(res, 201, await loteService.create(ctx.body)));
loteRoutes.put('/:id', async (ctx, res) => {
  const updated = await loteService.update(ctx.params.id, ctx.body);
  updated ? sendJson(res, 200, updated) : sendJson(res, 404, null);
});
loteRoutes.delete('/:id', async (ctx, res) => {
  await loteService.deactivate(ctx.params.id);
  sendNoContent(res);
});

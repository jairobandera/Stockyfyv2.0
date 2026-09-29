import { createCrud } from '../../core/crud.js';
import { query } from '../../config/db.js';
import { sendJson } from '../../core/http.js';

export const categoriaCrud = createCrud({
  table: 'categoria',
  entityLabel: 'Categoria',
  fields: [
    { col: 'nombre', field: 'nombre' },
    { col: 'descripcion', field: 'descripcion' },
    { col: 'codigo_categoria', field: 'codigoCategoria' },
    { col: 'sucursal_id', field: 'sucursalId' },
  ],
});

const SELECT = `
  SELECT id, nombre, descripcion, codigo_categoria AS codigoCategoria,
         sucursal_id AS sucursalId, activo
  FROM categoria`;

export const categoriaService = categoriaCrud.service;

export const categoriaRoutes = categoriaCrud.buildRoutes((routes, { normalize }) => {
  // GET /categorias/codigo/:codigoCategoria/sucursal/:sucursalId
  routes.get('/codigo/:codigoCategoria/sucursal/:sucursalId', async (ctx, res) => {
    const rows = await query(
      `${SELECT} WHERE codigo_categoria = ? AND sucursal_id = ? AND activo = 1`,
      [ctx.params.codigoCategoria, ctx.params.sucursalId]
    );
    rows[0] ? sendJson(res, 200, normalize(rows[0])) : sendJson(res, 404, null);
  });

  // GET /categorias/codigo/:codigoCategoria
  routes.get('/codigo/:codigoCategoria', async (ctx, res) => {
    const rows = await query(`${SELECT} WHERE codigo_categoria = ? AND activo = 1`, [ctx.params.codigoCategoria]);
    rows[0] ? sendJson(res, 200, normalize(rows[0])) : sendJson(res, 404, null);
  });

  // GET /categorias/sucursal/:sucursalId  (categorias activas de la sucursal)
  routes.get('/sucursal/:sucursalId', async (ctx, res) => {
    const rows = await query(`${SELECT} WHERE sucursal_id = ? AND activo = 1`, [ctx.params.sucursalId]);
    sendJson(res, 200, rows.map(normalize));
  });
});

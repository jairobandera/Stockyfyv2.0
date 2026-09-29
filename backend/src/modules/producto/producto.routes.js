import { Router } from '../../core/router.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';
import { productoService } from './producto.service.js';

export const productoRoutes = new Router();

productoRoutes.get('/', async (ctx, res) => sendJson(res, 200, await productoService.getAllActive()));
productoRoutes.get('/all', async (ctx, res) => sendJson(res, 200, await productoService.getAllIncludingInactive()));

productoRoutes.get('/sucursal/:sucursalId/activos', async (ctx, res) =>
  sendJson(res, 200, await productoService.getActiveBySucursal(ctx.params.sucursalId)));

productoRoutes.get('/codigo/:codigoProducto', async (ctx, res) => {
  const p = await productoService.getByCodigoProducto(ctx.params.codigoProducto);
  p ? sendJson(res, 200, p) : sendJson(res, 404, null);
});

productoRoutes.post('/actualizar-masivo', async (ctx, res) => {
  const sucursalId = ctx.query.sucursalId;
  if (!sucursalId) throw badRequest('sucursalId es requerido');
  sendJson(res, 200, await productoService.actualizarMasivo(ctx.body, sucursalId));
});

productoRoutes.post('/crear-simples', async (ctx, res) => {
  const sucursalId = ctx.query.sucursalId;
  if (!sucursalId) throw badRequest('sucursalId es requerido');
  sendJson(res, 200, await productoService.crearSimples(ctx.body, sucursalId));
});

productoRoutes.get('/:id', async (ctx, res) => {
  const p = await productoService.getById(ctx.params.id);
  p ? sendJson(res, 200, p) : sendJson(res, 404, null);
});

productoRoutes.post('/', async (ctx, res) => sendJson(res, 201, await productoService.create(ctx.body)));
productoRoutes.put('/:id', async (ctx, res) => {
  const updated = await productoService.update(ctx.params.id, ctx.body);
  updated ? sendJson(res, 200, updated) : sendJson(res, 404, null);
});
productoRoutes.delete('/:id', async (ctx, res) => {
  await productoService.deactivate(ctx.params.id);
  sendNoContent(res);
});

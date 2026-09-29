import { createCrud } from '../../core/crud.js';

export const sucursalCrud = createCrud({
  table: 'sucursal',
  entityLabel: 'Sucursal',
  fields: [
    { col: 'nombre', field: 'nombre' },
    { col: 'direccion', field: 'direccion' },
    { col: 'telefono', field: 'telefono' },
    { col: 'empresa_id', field: 'empresaId' },
  ],
});

export const sucursalService = sucursalCrud.service;
export const sucursalRoutes = sucursalCrud.buildRoutes();

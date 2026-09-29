import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';
import { fmt } from '../../core/ui.js';

export function gestionarLotes() {
  const sucursalId = auth.getSucursalId();
  let productos = [];
  const nombreProd = (id) => productos.find((p) => p.id === id)?.nombre || `#${id}`;

  return crudPage({
    navTitle: 'Lotes',
    title: 'Lotes',
    subtitle: 'Lotes de stock por producto.',
    entityName: 'lote',
    load: async () => {
      productos = sucursalId ? await api.get(`/productos/sucursal/${sucursalId}/activos`) : await api.get('/productos');
      return sucursalId ? api.get(`/lotes/sucursal/${sucursalId}/activos`) : api.get('/lotes');
    },
    searchKeys: ['numeroLote'],
    columns: [
      { key: 'numeroLote', label: 'N° Lote' },
      { key: 'productoId', label: 'Producto', render: (r) => nombreProd(r.productoId) },
      { key: 'cantidadStock', label: 'Cantidad' },
      { key: 'fechaIngreso', label: 'Ingreso', render: (r) => fmt.date(r.fechaIngreso) },
      { key: 'fechaVencimiento', label: 'Vencimiento', render: (r) => fmt.date(r.fechaVencimiento) },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      { name: 'numeroLote', label: 'Número de lote', required: true, value: row?.numeroLote, colClass: 'col-md-6' },
      { name: 'productoId', label: 'Producto', type: 'select', required: true, value: row?.productoId, options: productos.map((p) => ({ value: p.id, label: `${p.nombre} (${p.codigoProducto})` })), placeholder: 'Seleccionar producto', colClass: 'col-md-6' },
      { name: 'cantidadStock', label: 'Cantidad de stock', type: 'number', min: 0, required: true, value: row?.cantidadStock, colClass: 'col-md-4' },
      { name: 'fechaIngreso', label: 'Fecha de ingreso', type: 'date', required: true, value: row?.fechaIngreso, colClass: 'col-md-4' },
      { name: 'fechaVencimiento', label: 'Fecha de vencimiento', type: 'date', value: row?.fechaVencimiento, colClass: 'col-md-4' },
    ],
    toDto: (v) => ({
      numeroLote: v.numeroLote, productoId: Number(v.productoId),
      cantidadStock: Number(v.cantidadStock), fechaIngreso: v.fechaIngreso,
      fechaVencimiento: v.fechaVencimiento || null,
    }),
    create: (dto) => api.post('/lotes', dto),
    update: (id, dto) => api.put(`/lotes/${id}`, dto),
    remove: (row) => api.del(`/lotes/${row.id}`),
  });
}

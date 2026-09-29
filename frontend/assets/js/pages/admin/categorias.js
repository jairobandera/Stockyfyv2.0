import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';
import { exportToExcel, excelButton } from '../../components/excel.js';

export function gestionarCategorias() {
  const sucursalId = auth.getSucursalId();
  let current = [];

  const page = crudPage({
    navTitle: 'Categorías',
    title: 'Categorías',
    subtitle: 'Categorías de productos de tu sucursal.',
    entityName: 'categoría',
    load: async () => {
      current = sucursalId ? await api.get(`/categorias/sucursal/${sucursalId}`) : await api.get('/categorias');
      return current;
    },
    searchKeys: ['nombre', 'descripcion', 'codigoCategoria'],
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'codigoCategoria', label: 'Código' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'descripcion', label: 'Descripción' },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      { name: 'nombre', label: 'Nombre', required: true, value: row?.nombre, colClass: 'col-md-6' },
      { name: 'codigoCategoria', label: 'Código de categoría', value: row?.codigoCategoria, colClass: 'col-md-6' },
      { name: 'descripcion', label: 'Descripción', type: 'textarea', value: row?.descripcion },
      ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
    ],
    toDto: (v) => ({ nombre: v.nombre, codigoCategoria: v.codigoCategoria, descripcion: v.descripcion, sucursalId, activo: v.activo }),
    create: (dto) => api.post('/categorias', dto),
    update: (id, dto) => api.put(`/categorias/${id}`, dto),
    remove: (row) => api.del(`/categorias/${row.id}`),
    toolbar: excelButton('Exportar', 'bi-file-earmark-excel', () => {
      exportToExcel(current.map((c) => ({
        Codigo: c.codigoCategoria, Nombre: c.nombre, Descripcion: c.descripcion, Activo: c.activo ? 'Sí' : 'No',
      })), 'categorias');
    }),
  });
  return page;
}

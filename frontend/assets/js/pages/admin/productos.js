import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { ui, fmt } from '../../core/ui.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';
import { exportToExcel, importFromExcel, excelButton } from '../../components/excel.js';

export function gestionarProductos() {
  const sucursalId = auth.getSucursalId();
  let categorias = [];
  let proveedores = [];
  let current = [];
  let pageRef;

  async function loadRefs() {
    [categorias, proveedores] = await Promise.all([
      sucursalId ? api.get(`/categorias/sucursal/${sucursalId}`) : api.get('/categorias'),
      sucursalId ? api.get(`/proveedores/sucursal/${sucursalId}/activos`) : api.get('/proveedores'),
    ]);
  }

  const nombreCat = (id) => categorias.find((c) => c.id === id)?.nombre || '-';

  const importBtn = excelButton('Importar', 'bi-upload', () => onImport(), 'btn-outline-primary');
  const exportBtn = excelButton('Exportar', 'bi-file-earmark-excel', () => {
    exportToExcel(current.map((p) => ({
      CodigoProducto: p.codigoProducto, Nombre: p.nombre, Detalle: p.detalle,
      Precio: p.precio, Stock: p.cantidadStock, Categoria: nombreCat(p.categoriaId),
      CodigosBarra: (p.codigosBarra || []).join(' | '), Activo: p.activo ? 'Sí' : 'No',
    })), 'productos');
  });

  async function onImport() {
    const filas = await importFromExcel();
    if (!filas || filas.length === 0) return;
    ui.loading('Importando productos...');
    const productos = filas.map((f) => ({
      codigoProducto: String(f.CodigoProducto ?? f.Codigo ?? f.codigoProducto ?? '').trim(),
      nombre: String(f.Nombre ?? f.nombre ?? '').trim(),
      detalle: f.Detalle ?? f.detalle ?? null,
      precio: Number(f.Precio ?? f.precio ?? 0),
      cantidadStock: Number(f.Stock ?? f.stock ?? f.CantidadStock ?? 0),
      codigosBarra: String(f.CodigosBarra ?? f.CodigoBarra ?? f.codigosBarra ?? '')
        .split(/[|,;]/).map((s) => s.trim()).filter(Boolean),
    }));
    try {
      const res = await api.post(`/productos/crear-simples?sucursalId=${sucursalId}`, productos);
      ui.close();
      ui.info('Importación finalizada',
        `Creados: ${res.creados?.length || 0}<br>Errores: ${res.errores?.length || 0}` +
        (res.errores?.length ? `<hr><div class="text-start small">${res.errores.slice(0, 15).join('<br>')}</div>` : ''));
      pageRef.refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  pageRef = crudPage({
    navTitle: 'Productos',
    title: 'Productos',
    subtitle: 'Inventario de productos de tu sucursal.',
    entityName: 'producto',
    load: async () => {
      await loadRefs();
      current = sucursalId ? await api.get(`/productos/sucursal/${sucursalId}/activos`) : await api.get('/productos');
      return current;
    },
    searchKeys: ['codigoProducto', 'nombre', 'detalle'],
    columns: [
      { key: 'codigoProducto', label: 'Código' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'categoriaId', label: 'Categoría', render: (r) => nombreCat(r.categoriaId) },
      { key: 'precio', label: 'Precio', render: (r) => fmt.money(r.precio) },
      { key: 'cantidadStock', label: 'Stock' },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      { name: 'codigoProducto', label: 'Código de producto', required: true, value: row?.codigoProducto, colClass: 'col-md-4' },
      { name: 'nombre', label: 'Nombre', required: true, value: row?.nombre, colClass: 'col-md-8' },
      { name: 'precio', label: 'Precio', type: 'number', min: 0, step: '0.01', required: true, value: row?.precio, colClass: 'col-md-4' },
      { name: 'cantidadStock', label: 'Stock', type: 'number', min: 0, required: true, value: row?.cantidadStock, colClass: 'col-md-4' },
      { name: 'categoriaId', label: 'Categoría', type: 'select', value: row?.categoriaId, options: categorias.map((c) => ({ value: c.id, label: c.nombre })), placeholder: 'Sin categoría', colClass: 'col-md-4' },
      { name: 'codigosBarra', label: 'Códigos de barra', type: 'tags', required: true, value: row?.codigosBarra, help: 'Separar múltiples códigos con comas.', colClass: 'col-md-6' },
      { name: 'proveedorIds', label: 'Proveedores', type: 'multiselect', value: row?.proveedorIds, options: proveedores.map((p) => ({ value: p.id, label: p.nombre })), colClass: 'col-md-6' },
      { name: 'detalle', label: 'Detalle', type: 'textarea', value: row?.detalle },
      { name: 'imagen', label: 'Imagen', type: 'image', value: row?.imagen },
      ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
    ],
    toDto: (v) => ({
      codigoProducto: v.codigoProducto, nombre: v.nombre, detalle: v.detalle,
      precio: Number(v.precio), cantidadStock: Number(v.cantidadStock),
      categoriaId: v.categoriaId ? Number(v.categoriaId) : null,
      sucursalId, codigosBarra: v.codigosBarra,
      proveedorIds: (v.proveedorIds || []).map(Number),
      imagen: v.imagen || null, activo: v.activo,
    }),
    create: (dto) => api.post('/productos', dto),
    update: (id, dto) => api.put(`/productos/${id}`, dto),
    remove: (row) => api.del(`/productos/${row.id}`),
    toolbar: h('div', { class: 'd-flex gap-2' }, [importBtn, exportBtn]),
  });
  return pageRef;
}

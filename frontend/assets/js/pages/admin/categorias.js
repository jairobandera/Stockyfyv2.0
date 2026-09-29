import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { ui } from '../../core/ui.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';
import {
  exportToExcel, excelButton, importFromExcelRaw, findHeaderRow,
} from '../../components/excel.js';
import { descargarPlantilla } from '../../components/plantillas.js';

const ALIAS_CATEGORIA = {
  codigo: ['codigo', 'codigo_categoria', 'id', 'id_cat', 'id_categoria'],
  nombre: ['nombre', 'nombre_categoria', 'categoria', 'rubro'],
  descripcion: ['descripcion', 'detalle'],
};

export function gestionarCategorias() {
  const sucursalId = auth.getSucursalId();
  let current = [];
  let pageRef;

  async function onImport() {
    const matriz = await importFromExcelRaw();
    if (!matriz || matriz.length === 0) return;
    const header = findHeaderRow(matriz, ALIAS_CATEGORIA, ['nombre']);
    if (!header) {
      ui.error('No se encontró una columna de nombre de categoría en el archivo.');
      return;
    }
    const { index, cols } = header;
    const cell = (row, field) => (cols[field] !== undefined ? row[cols[field]] : null);
    const categorias = [];
    for (let i = index + 1; i < matriz.length; i++) {
      const row = matriz[i] || [];
      const nombre = String(cell(row, 'nombre') ?? '').trim();
      if (!nombre) continue;
      categorias.push({
        nombre,
        codigoCategoria: String(cell(row, 'codigo') ?? '').trim() || null,
        descripcion: cell(row, 'descripcion') != null ? String(cell(row, 'descripcion')).trim() : null,
      });
    }
    if (categorias.length === 0) { ui.error('No se encontraron categorías para importar.'); return; }
    ui.loading('Importando categorías...');
    try {
      const res = await api.post(`/categorias/crear-lote?sucursalId=${sucursalId}`, categorias);
      ui.close();
      ui.info('Importación finalizada',
        `Creadas: ${res.creadas?.length || 0}<br>Duplicadas (omitidas): ${res.duplicadas?.length || 0}<br>Errores: ${res.errores?.length || 0}` +
        (res.errores?.length ? `<hr><div class="text-start small">${res.errores.slice(0, 15).join('<br>')}</div>` : ''));
      pageRef.refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  pageRef = crudPage({
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
    toolbar: h('div', { class: 'd-flex flex-wrap gap-2' }, [
      excelButton('Plantilla', 'bi-file-earmark-arrow-down', () => descargarPlantilla('categorias'), 'btn-outline-secondary'),
      excelButton('Importar', 'bi-upload', () => onImport(), 'btn-outline-primary'),
      excelButton('Exportar', 'bi-file-earmark-excel', () => {
        exportToExcel(current.map((c) => ({
          Codigo: c.codigoCategoria, Nombre: c.nombre, Descripcion: c.descripcion, Activo: c.activo ? 'Sí' : 'No',
        })), 'categorias');
      }),
    ]),
  });
  return pageRef;
}

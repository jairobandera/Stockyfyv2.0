import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { ui, fmt } from '../../core/ui.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';
import {
  exportToExcel, excelButton, importFromExcelRaw, findHeaderRow,
  parsePrecio, parseNumeroEntero,
} from '../../components/excel.js';
import { descargarPlantilla } from '../../components/plantillas.js';

const ALIAS_PRODUCTO = {
  codigo: ['codigo_producto', 'codigoproducto', 'id_prod', 'id_producto', 'codigo'],
  nombre: ['nombre_producto', 'nombre', 'producto', 'descripcion'],
  categoriaCodigo: ['id_cat', 'id_categoria', 'codigo_categoria'],
  categoriaNombre: ['nombre_categoria', 'categoria', 'rubro'],
  precio: ['precio', 'precio_venta', 'pvp'],
  stock: ['stock', 'cantidad_stock', 'existencia'],
  detalle: ['detalle', 'observacion'],
  barras: ['codigos_barra', 'codigosbarra', 'codigo_de_barras', 'codigo_barra', 'barras', 'ean'],
};

const ALIAS_BARRAS = {
  codigo: ['codigo_producto', 'codigoproducto', 'id_prod', 'id_producto', 'codigo'],
  barras: ['codigo_de_barras', 'codigos_barra', 'codigosbarra', 'codigo_barra', 'barras', 'ean'],
};

const ALIAS_STOCK_CONTEO = {
  codigo: ['codigo', 'codigo_producto', 'id_prod', 'id_producto'],
  stock: ['stock_final', 'stockfinal', 'stock', 'existencia', 'cantidad_final'],
};

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

  const plantillaBtn = excelButton('Plantilla', 'bi-file-earmark-arrow-down', () => descargarPlantilla('productos'), 'btn-outline-secondary');
  const importBtn = excelButton('Importar catálogo', 'bi-upload', () => onImport(), 'btn-outline-primary');
  const stockBtn = excelButton('Cargar stock (conteo)', 'bi-clipboard-data', () => onCargarStock(), 'btn-outline-warning');
  const exportBtn = excelButton('Exportar', 'bi-file-earmark-excel', () => {
    exportToExcel(current.map((p) => ({
      CodigoProducto: p.codigoProducto, Nombre: p.nombre, Detalle: p.detalle,
      Precio: p.precio, Stock: p.cantidadStock, Categoria: nombreCat(p.categoriaId),
      CodigosBarra: (p.codigosBarra || []).join(' | '), Activo: p.activo ? 'Sí' : 'No',
    })), 'productos');
  });

  // Resuelve el id de categoria a partir del codigo (ID_CAT) o el nombre del Excel.
  function resolveCategoriaId(codigoCat, nombreCat) {
    const cod = String(codigoCat ?? '').trim();
    if (cod) {
      const porCodigo = categorias.find((c) => String(c.codigoCategoria ?? '').trim() === cod);
      if (porCodigo) return porCodigo.id;
    }
    const nom = String(nombreCat ?? '').trim().toLowerCase();
    if (nom) {
      const porNombre = categorias.find((c) => (c.nombre ?? '').trim().toLowerCase() === nom);
      if (porNombre) return porNombre.id;
    }
    return null; // el backend usa "Sin categoria" por defecto
  }

  // Lee el archivo de codigos de barra (opcional) y devuelve un mapa codigoProducto -> [barras].
  async function pedirBarras() {
    const ok = await ui.confirm(
      'Los códigos de barra suelen venir en un archivo aparte. ¿Querés adjuntarlo ahora?',
      { title: 'Códigos de barra', confirmText: 'Sí, adjuntar', cancelText: 'No, continuar sin barras', danger: false }
    );
    if (!ok) return {};
    const matriz = await importFromExcelRaw();
    if (!matriz || matriz.length === 0) return {};
    const header = findHeaderRow(matriz, ALIAS_BARRAS, ['codigo', 'barras']);
    if (!header) { ui.error('No se reconocieron las columnas del archivo de códigos de barra. Se continúa sin barras.'); return {}; }
    const { index, cols } = header;
    const mapa = {};
    for (let i = index + 1; i < matriz.length; i++) {
      const row = matriz[i] || [];
      const codigo = String(row[cols.codigo] ?? '').trim();
      if (!codigo) continue;
      const barras = String(row[cols.barras] ?? '')
        .split(/[|,;]/).map((s) => s.trim()).filter(Boolean);
      if (barras.length) mapa[codigo] = (mapa[codigo] || []).concat(barras);
    }
    return mapa;
  }

  async function onImport() {
    const matriz = await importFromExcelRaw();
    if (!matriz || matriz.length === 0) return;
    const header = findHeaderRow(matriz, ALIAS_PRODUCTO, ['codigo', 'nombre']);
    if (!header) {
      ui.error('No se reconocieron las columnas de código y nombre en el archivo de productos.');
      return;
    }
    const barrasPorCodigo = await pedirBarras();
    ui.loading('Importando productos...');
    await loadRefs(); // refresca categorias por si se importaron recien
    const { index, cols } = header;
    const cell = (row, field) => (cols[field] !== undefined ? row[cols[field]] : null);
    const productos = [];
    for (let i = index + 1; i < matriz.length; i++) {
      const row = matriz[i] || [];
      const codigoProducto = String(cell(row, 'codigo') ?? '').trim();
      const nombre = String(cell(row, 'nombre') ?? '').trim();
      if (!codigoProducto && !nombre) continue;
      const stock = parseNumeroEntero(cell(row, 'stock'));
      // Codigos de barra: los de la misma planilla (columna inline) + los del archivo aparte.
      const barrasInline = String(cell(row, 'barras') ?? '')
        .split(/[|,;]/).map((s) => s.trim()).filter(Boolean);
      const codigosBarra = [...new Set([...barrasInline, ...(barrasPorCodigo[codigoProducto] || [])])];
      productos.push({
        codigoProducto,
        nombre,
        detalle: cell(row, 'detalle') != null ? String(cell(row, 'detalle')).trim() : null,
        precio: parsePrecio(cell(row, 'precio')),
        cantidadStock: stock ?? 0,
        categoriaId: resolveCategoriaId(cell(row, 'categoriaCodigo'), cell(row, 'categoriaNombre')),
        codigosBarra,
      });
    }
    if (productos.length === 0) { ui.close(); ui.error('No se encontraron productos para importar.'); return; }
    try {
      const res = await api.post(`/productos/crear-simples?sucursalId=${sucursalId}`, productos);
      ui.close();
      ui.info('Importación finalizada',
        `Creados: ${res.creados?.length || 0}<br>Errores: ${res.errores?.length || 0}` +
        (res.errores?.length ? `<hr><div class="text-start small">${res.errores.slice(0, 15).join('<br>')}</div>` : ''));
      pageRef.refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  // Carga el "Stock Final" de un reporte (general.xls) como stock esperado del conteo.
  async function onCargarStock() {
    const matriz = await importFromExcelRaw();
    if (!matriz || matriz.length === 0) return;
    const header = findHeaderRow(matriz, ALIAS_STOCK_CONTEO, ['codigo', 'stock']);
    if (!header) {
      ui.error('No se reconocieron las columnas de código y stock final en el archivo.');
      return;
    }
    const { index, cols } = header;
    const productos = [];
    let ignorados = 0;
    for (let i = index + 1; i < matriz.length; i++) {
      const row = matriz[i] || [];
      const codigoProducto = String(row[cols.codigo] ?? '').trim();
      if (!codigoProducto) continue;
      // El valor numerico puede estar en la columna del encabezado o en la siguiente
      // (en el reporte, la columna del encabezado "Stock Final" contiene la unidad).
      let stock = parseNumeroEntero(row[cols.stock]);
      if (stock === null) stock = parseNumeroEntero(row[cols.stock + 1]);
      if (stock === null) { ignorados++; continue; }
      productos.push({ codigoProducto, cantidadStock: stock });
    }
    if (productos.length === 0) {
      ui.error(`No se encontró stock válido para cargar. Filas ignoradas (vacías o con decimales): ${ignorados}.`);
      return;
    }
    ui.loading('Cargando stock esperado...');
    try {
      const res = await api.post(`/productos/actualizar-masivo?sucursalId=${sucursalId}`, productos);
      ui.close();
      ui.info('Carga de stock finalizada',
        `Actualizados: ${res.actualizados?.length || 0}<br>No encontrados: ${res.noEncontrados?.length || 0}<br>Ignorados (vacíos/decimales): ${ignorados}` +
        (res.noEncontrados?.length ? `<hr><div class="text-start small">Sin coincidencia: ${res.noEncontrados.slice(0, 15).join(', ')}</div>` : ''));
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
    toolbar: h('div', { class: 'd-flex flex-wrap gap-2' }, [plantillaBtn, importBtn, stockBtn, exportBtn]),
  });
  return pageRef;
}

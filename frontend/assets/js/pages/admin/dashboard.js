import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner } from '../../components/page.js';
import { statCard, quickCard } from '../../components/cards.js';

export async function adminDashboard() {
  const content = renderShell('Dashboard');
  content.append(pageHeader('Panel de Administrador', 'Inventario y conteos de tu sucursal.'));
  const loading = spinner();
  content.append(loading);

  const sucursalId = auth.getSucursalId();
  try {
    const [productos, categorias, proveedores, conteos] = await Promise.all([
      sucursalId ? api.get(`/productos/sucursal/${sucursalId}/activos`) : api.get('/productos'),
      sucursalId ? api.get(`/categorias/sucursal/${sucursalId}`) : api.get('/categorias'),
      sucursalId ? api.get(`/proveedores/sucursal/${sucursalId}/activos`) : api.get('/proveedores'),
      api.get('/conteos'),
    ]);
    loading.remove();

    content.append(h('div', { class: 'row g-3 mb-4' }, [
      col(statCard('Productos', productos.length, 'bi-box-seam', '#2563eb')),
      col(statCard('Categorías', categorias.length, 'bi-tags', '#0891b2')),
      col(statCard('Proveedores', proveedores.length, 'bi-truck', '#7c3aed')),
      col(statCard('Conteos activos', conteos.length, 'bi-clipboard-check', '#16a34a')),
    ]));

    content.append(h('h5', { class: 'fw-semibold mb-3' }, 'Accesos rápidos'));
    content.append(h('div', { class: 'row g-3' }, [
      col(quickCard('Productos', 'bi-box-seam', '#/admin/gestionar-productos')),
      col(quickCard('Categorías', 'bi-tags', '#/admin/gestionar-categorias')),
      col(quickCard('Lotes', 'bi-boxes', '#/admin/gestionar-lotes')),
      col(quickCard('Proveedores', 'bi-truck', '#/admin/gestionar-proveedores')),
      col(quickCard('Conteos', 'bi-clipboard-check', '#/admin/gestionar-conteos')),
      col(quickCard('Empleados', 'bi-people', '#/admin/gestionar-empleados')),
      col(quickCard('Estadísticas', 'bi-graph-up', '#/admin/estadisticas')),
    ]));
  } catch (err) {
    loading.remove();
    content.append(h('div', { class: 'alert alert-danger' }, `No se pudieron cargar los datos: ${err.message}`));
  }
}

const col = (child) => h('div', { class: 'col-12 col-sm-6 col-lg-3' }, child);

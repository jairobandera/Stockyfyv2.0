import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { ws } from '../../core/ws.js';
import { ui, fmt } from '../../core/ui.js';
import { router } from '../../core/router.js';
import { renderShell } from '../../core/layout.js';
import { onCleanup } from '../../core/lifecycle.js';
import { pageHeader, primaryButton, outlineButton, spinner, badge } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { formModal } from '../../components/formModal.js';
import { resolveUsuarioId } from '../shared/session.js';
import { reabrirConteo } from '../shared/conteoActions.js';

export function gestionarConteos() {
  const content = renderShell('Conteos');
  const sucursalId = auth.getSucursalId();

  content.append(pageHeader('Conteos', 'Creá y gestioná los conteos de inventario.', [
    primaryButton('Conteo libre', 'bi-plus-lg', () => crearLibre()),
    outlineButton('Conteo por categorías', 'bi-tags', () => crearCategorias(), 'btn-outline-primary'),
    h('span', { class: 'sk-conteo-live d-flex align-items-center gap-2 text-muted ms-2' },
      [h('span', { class: 'sk-dot on', id: 'ws-dot' }), 'En vivo']),
  ]));

  const activosWrap = h('div', { class: 'mb-4' });
  const finalizadosWrap = h('div');
  content.append(
    h('h5', { class: 'fw-semibold mb-2' }, 'Conteos activos'), activosWrap,
    h('div', { class: 'd-flex flex-wrap justify-content-between align-items-center mb-2 mt-4 gap-2' }, [
      h('h5', { class: 'fw-semibold mb-0' }, 'Conteos finalizados este mes'),
      outlineButton('Buscar por fecha', 'bi-calendar-range',
        () => router.navigate('#/admin/conteos-finalizados'), 'btn-outline-secondary btn-sm'),
    ]),
    finalizadosWrap,
  );

  async function refresh() {
    clear(activosWrap); clear(finalizadosWrap);
    activosWrap.append(spinner());
    try {
      const [conteos, finalizados] = await Promise.all([
        api.get('/conteos/all'),
        api.get(`/conteos/finalizados?desde=${inicioDeMes()}&hasta=${hoyStr()}`),
      ]);
      const activos = conteos.filter((c) => c.activo && !c.conteoFinalizado);
      clear(activosWrap); clear(finalizadosWrap);
      activosWrap.append(renderActivos(activos));
      finalizadosWrap.append(renderFinalizados(finalizados));
    } catch (err) {
      clear(activosWrap);
      activosWrap.append(h('div', { class: 'alert alert-danger' }, `Error: ${err.message}`));
    }
  }

  const tipoBadge = (c) => badge(c.tipoConteo === 'CATEGORIAS' ? 'Categorías' : 'Libre',
    c.tipoConteo === 'CATEGORIAS' ? 'info' : 'primary');

  function renderActivos(rows) {
    return dataTable({
      columns: [
        { key: 'id', label: 'ID', render: (r) => `#${r.id}` },
        { key: 'tipoConteo', label: 'Tipo', render: tipoBadge },
        { key: 'fechaHora', label: 'Iniciado', render: (r) => fmt.dateTime(r.fechaHora) },
      ],
      rows, searchKeys: ['id', 'tipoConteo'],
      emptyText: 'No hay conteos activos.',
      actions: [
        { icon: 'bi-box-arrow-in-right', title: 'Unirse', className: 'btn-outline-primary', onClick: (r) => unirse(r) },
        { icon: 'bi-check2-circle', title: 'Finalizar', className: 'btn-outline-success', onClick: (r) => finalizar(r) },
        { icon: 'bi-trash', title: 'Eliminar', className: 'btn-outline-danger', onClick: (r) => eliminar(r) },
      ],
    });
  }

  function renderFinalizados(rows) {
    return dataTable({
      columns: [
        { key: 'id', label: 'ID', render: (r) => `#${r.id}` },
        { key: 'tipoConteo', label: 'Tipo', render: tipoBadge },
        { key: 'fechaHora', label: 'Fecha', render: (r) => fmt.dateTime(r.fechaHora) },
      ],
      rows, searchKeys: ['id', 'tipoConteo'],
      emptyText: 'No hay conteos finalizados este mes.',
      actions: [
        { icon: 'bi-file-earmark-bar-graph', title: 'Ver reporte', className: 'btn-outline-primary', onClick: (r) => router.navigate(`#/admin/reporte-conteo/${r.id}`) },
        { icon: 'bi-arrow-counterclockwise', title: 'Reabrir', className: 'btn-outline-warning', onClick: (r) => reabrirConteo(r) },
      ],
    });
  }

  function unirse(c) {
    const target = c.tipoConteo === 'CATEGORIAS'
      ? `#/admin/gestionar-conteos/unirse-conteo-categorias/${c.id}`
      : `#/admin/gestionar-conteos/unirse-conteo-libre/${c.id}`;
    router.navigate(target);
  }

  async function crearLibre() {
    const ok = await ui.confirm('¿Crear un nuevo conteo libre?', { confirmText: 'Sí, crear', danger: false });
    if (!ok) return;
    ui.loading('Creando conteo...');
    try {
      const usuarioId = await resolveUsuarioId();
      await api.post('/conteos', { tipoConteo: 'LIBRE', usuarioId, fechaHora: now() });
      ui.close(); ui.success('Conteo libre creado.'); refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function crearCategorias() {
    let categorias;
    try { categorias = await api.get(`/categorias/sucursal/${sucursalId}`); }
    catch (err) { ui.error(err.message); return; }
    if (categorias.length === 0) { ui.error('No hay categorías en tu sucursal.'); return; }

    const values = await formModal({
      title: 'Nuevo conteo por categorías',
      submitText: 'Crear conteo',
      fields: [{
        name: 'categoriaIds', label: 'Categorías a contar', type: 'checkboxgroup', required: true,
        options: categorias.map((c) => ({ value: c.id, label: c.nombre })),
        help: 'Elegí una o más categorías. Se cargarán todos sus productos activos.',
      }],
    });
    if (!values) return;
    ui.loading('Creando conteo...');
    try {
      const usuarioId = await resolveUsuarioId();
      await api.post('/conteos/categorias', {
        tipoConteo: 'CATEGORIAS', usuarioId, fechaHora: now(),
        categoriaIds: values.categoriaIds.map(Number),
      });
      ui.close(); ui.success('Conteo por categorías creado.'); refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function finalizar(c) {
    const ok = await ui.confirm(`¿Finalizar el conteo #${c.id}?`, { confirmText: 'Sí, finalizar', danger: false });
    if (!ok) return;
    ui.loading('Finalizando...');
    try { await api.put(`/conteos/${c.id}`, { conteoFinalizado: true }); ui.close(); ui.success('Finalizado.'); refresh(); }
    catch (err) { ui.close(); ui.error(err.message); }
  }

  async function eliminar(c) {
    const ok = await ui.confirm(`¿Eliminar el conteo #${c.id}?`);
    if (!ok) return;
    ui.loading('Eliminando...');
    try { await api.del(`/conteos/${c.id}`); ui.close(); ui.success('Eliminado.'); refresh(); }
    catch (err) { ui.close(); ui.error(err.message); }
  }

  refresh();
  const u1 = ws.subscribe('conteo-activo', refresh);
  const u2 = ws.subscribe('conteo-finalizado', refresh);
  const dotTimer = setInterval(() => {
    const d = document.getElementById('ws-dot');
    if (d) d.className = 'sk-dot ' + (ws.isConnected() ? 'on' : 'off');
  }, 1500);
  onCleanup(() => { u1(); u2(); clearInterval(dotTimer); });
}

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** Fecha local YYYY-MM-DD (sin desfase de zona horaria). */
function hoyStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Primer dia del mes actual, en formato YYYY-MM-01. */
function inicioDeMes() {
  return hoyStr().slice(0, 8) + '01';
}

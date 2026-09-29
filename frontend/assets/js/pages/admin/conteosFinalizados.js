// Busqueda de conteos finalizados por rango de fechas.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { fmt } from '../../core/ui.js';
import { router } from '../../core/router.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, badge } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { reabrirConteo } from '../shared/conteoActions.js';

/** Fecha local en formato YYYY-MM-DD (sin desfase de zona horaria). */
function hoyStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function conteosFinalizados() {
  const content = renderShell('Conteos finalizados');
  const hoy = hoyStr();

  content.append(pageHeader('Conteos finalizados', 'Buscá conteos finalizados por rango de fechas.'));

  const desde = h('input', { class: 'form-control', type: 'date', value: hoy });
  const hasta = h('input', { class: 'form-control', type: 'date', value: hoy });
  const buscarBtn = h('button', { class: 'btn btn-primary' }, [h('i', { class: 'bi bi-search me-1' }), 'Buscar']);

  const filtros = h('div', { class: 'sk-card p-3 mb-3' }, [
    h('div', { class: 'row g-2 align-items-end' }, [
      h('div', { class: 'col-sm-4 col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Desde'), desde]),
      h('div', { class: 'col-sm-4 col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Hasta'), hasta]),
      h('div', { class: 'col-sm-4 col-md-3' }, [buscarBtn]),
    ]),
  ]);

  const resultWrap = h('div');
  content.append(filtros, resultWrap);

  const tipoBadge = (c) => {
    if (c.tipoConteo !== 'CATEGORIAS') return badge('Libre', 'primary');
    const cats = (c.categorias && c.categorias.length) ? c.categorias.join(', ') : null;
    return h('span', { class: 'd-inline-flex align-items-center gap-1 flex-wrap' }, [
      badge('Categorías', 'info'),
      cats ? h('span', { class: 'text-muted small' }, `- ${cats}`) : null,
    ]);
  };

  async function buscar() {
    if (desde.value && hasta.value && desde.value > hasta.value) {
      clear(resultWrap);
      resultWrap.append(h('div', { class: 'alert alert-warning' }, 'La fecha "Desde" no puede ser mayor que "Hasta".'));
      return;
    }
    clear(resultWrap);
    resultWrap.append(spinner('Buscando...'));
    try {
      const q = new URLSearchParams({ desde: desde.value, hasta: hasta.value }).toString();
      const rows = await api.get(`/conteos/finalizados?${q}`);
      clear(resultWrap);
      resultWrap.append(
        h('div', { class: 'text-muted small mb-2' }, `${rows.length} conteo(s) encontrado(s).`),
        dataTable({
          columns: [
            { key: 'id', label: 'ID', render: (r) => `#${r.id}` },
            { key: 'tipoConteo', label: 'Tipo', render: tipoBadge },
            { key: 'fechaHora', label: 'Fecha', render: (r) => fmt.dateTime(r.fechaHora) },
          ],
          rows, searchKeys: ['id', 'tipoConteo'],
          emptyText: 'No hay conteos finalizados en ese rango.',
          actions: [
            { icon: 'bi-file-earmark-bar-graph', title: 'Ver reporte', className: 'btn-outline-primary',
              onClick: (r) => router.navigate(`#/admin/reporte-conteo/${r.id}`) },
            { icon: 'bi-arrow-counterclockwise', title: 'Reabrir', className: 'btn-outline-warning',
              onClick: (r) => reabrirConteo(r) },
          ],
        }),
      );
    } catch (err) {
      clear(resultWrap);
      resultWrap.append(h('div', { class: 'alert alert-danger' }, `Error: ${err.message}`));
    }
  }

  buscarBtn.addEventListener('click', buscar);
  buscar(); // carga inicial con el dia de hoy
}

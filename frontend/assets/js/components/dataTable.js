// Tabla de datos con busqueda y acciones. Renderiza dentro de un contenedor.
import { h, clear } from '../core/dom.js';

/**
 * @param {object} opts
 * @param {Array} opts.columns  [{ key, label, render?(row), className? }]
 * @param {Array} opts.rows
 * @param {Array} [opts.actions]  [{ icon, title, className, onClick(row), show?(row) }]
 * @param {string} [opts.searchPlaceholder]
 * @param {Array<string>} [opts.searchKeys]  claves por las que filtrar
 * @param {Node|Array} [opts.toolbar]  elementos extra a la izquierda del buscador
 * @param {string} [opts.emptyText]
 */
export function dataTable(opts) {
  const {
    columns, rows, actions = [], searchPlaceholder = 'Buscar...',
    searchKeys = null, toolbar = null, emptyText = 'No hay registros para mostrar.',
  } = opts;

  const state = { term: '' };
  const tbody = h('tbody');

  const search = h('input', {
    class: 'form-control sk-search', type: 'search', placeholder: searchPlaceholder,
    oninput: (e) => { state.term = e.target.value.toLowerCase(); renderRows(); },
  });

  function filtered() {
    if (!state.term) return rows;
    const keys = searchKeys || columns.map((c) => c.key).filter(Boolean);
    return rows.filter((row) =>
      keys.some((k) => String(row[k] ?? '').toLowerCase().includes(state.term)));
  }

  function renderRows() {
    clear(tbody);
    const list = filtered();
    if (list.length === 0) {
      tbody.append(h('tr', {}, [
        h('td', { colspan: columns.length + (actions.length ? 1 : 0), class: 'text-center text-muted py-4' }, emptyText),
      ]));
      return;
    }
    for (const row of list) {
      const cells = columns.map((c) => {
        const content = c.render ? c.render(row) : row[c.key];
        return h('td', { class: c.className || '' }, content instanceof Node ? content : (content ?? ''));
      });
      if (actions.length) {
        const btns = actions
          .filter((a) => !a.show || a.show(row))
          .map((a) => h('button', {
            class: `btn btn-sm ${a.className || 'btn-outline-primary'} me-1`,
            title: a.title || '', onClick: () => a.onClick(row),
          }, [h('i', { class: `bi ${a.icon}` })]));
        cells.push(h('td', { class: 'text-nowrap text-end' }, btns));
      }
      tbody.append(h('tr', {}, cells));
    }
  }

  renderRows();

  const head = h('thead', {}, [
    h('tr', {}, [
      ...columns.map((c) => h('th', {}, c.label)),
      actions.length ? h('th', { class: 'text-end' }, 'Acciones') : null,
    ]),
  ]);

  return h('div', {}, [
    h('div', { class: 'sk-table-toolbar' }, [
      toolbar,
      h('div', { class: 'ms-auto' }, [search]),
    ]),
    h('div', { class: 'sk-card p-0' }, [
      h('div', { class: 'table-responsive' }, [
        h('table', { class: 'table table-hover align-middle mb-0' }, [head, tbody]),
      ]),
    ]),
  ]);
}

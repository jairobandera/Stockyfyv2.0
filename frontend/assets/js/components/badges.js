import { h } from '../core/dom.js';

export function activoBadge(activo) {
  return activo
    ? h('span', { class: 'badge text-bg-success' }, 'Activo')
    : h('span', { class: 'badge text-bg-secondary' }, 'Inactivo');
}

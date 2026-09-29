// Tarjetas de estadistica y de acceso rapido.
import { h } from '../core/dom.js';
import { router } from '../core/router.js';

export function statCard(label, value, icon, color) {
  return h('div', { class: 'sk-card sk-stat h-100' }, [
    h('div', { class: 'sk-stat-icon', style: { background: color } }, [h('i', { class: `bi ${icon}` })]),
    h('div', {}, [h('h3', {}, String(value)), h('span', {}, label)]),
  ]);
}

export function quickCard(label, icon, href) {
  return h('div', {
    class: 'sk-card sk-dash-card p-4 text-center h-100',
    onClick: () => router.navigate(href),
  }, [
    h('i', { class: `bi ${icon}`, style: { fontSize: '2rem', color: '#2563eb' } }),
    h('div', { class: 'mt-2 fw-semibold' }, label),
  ]);
}

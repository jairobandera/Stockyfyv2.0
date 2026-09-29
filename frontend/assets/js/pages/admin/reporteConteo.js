import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { fmt } from '../../core/ui.js';
import { router } from '../../core/router.js';
import { renderShell } from '../../core/layout.js';
import { spinner, outlineButton } from '../../components/page.js';
import { statCard } from '../../components/cards.js';

export async function reporteConteo({ params }) {
  const conteoId = Number(params.id);
  const content = renderShell(`Reporte del conteo #${conteoId}`);
  const loading = spinner('Generando reporte...');
  content.append(loading);

  try {
    const [conteo, renglones, productos, usuarios] = await Promise.all([
      api.get(`/conteos/${conteoId}`),
      api.get(`/conteoproducto/conteo/${conteoId}`),
      api.get('/productos/all'),
      api.get('/usuarios/all'),
    ]);
    const nombreProd = new Map(productos.map((p) => [p.id, p.nombre]));
    const nombreUsuario = new Map(usuarios.map((u) =>
      [u.id, `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.nombreUsuario]));
    loading.remove();

    let totalFaltante = 0, totalSobrante = 0, dineroFaltante = 0, dineroSobrante = 0;
    const filas = renglones.map((cp) => {
      const esperada = cp.cantidadEsperada ?? 0;
      const contada = cp.cantidadContada;
      const diff = contada == null ? 0 : contada - esperada;
      if (diff < 0) { totalFaltante += -diff; dineroFaltante += -diff * cp.precioActual; }
      if (diff > 0) { totalSobrante += diff; dineroSobrante += diff * cp.precioActual; }
      return {
        nombre: nombreProd.get(cp.productoId) || `#${cp.productoId}`,
        esperada, contada, diff, precio: cp.precioActual,
        contadoPor: cp.usuarioId != null ? (nombreUsuario.get(cp.usuarioId) || '—') : '—',
      };
    });
    const diferenciaMonetaria = dineroSobrante - dineroFaltante;

    content.append(
      h('div', { class: 'd-flex justify-content-between align-items-center mb-3 flex-wrap gap-2' }, [
        h('div', {}, [
          outlineButton('Volver', 'bi-arrow-left', () => router.navigate('#/admin/gestionar-conteos')),
        ]),
        h('div', { class: 'd-flex gap-2' }, [
          outlineButton('Exportar PDF', 'bi-file-earmark-pdf', () => exportPdf(conteo, filas, { totalFaltante, totalSobrante, diferenciaMonetaria }), 'btn-outline-danger'),
        ]),
      ]),
      h('div', { class: 'text-muted mb-3' }, `Conteo ${conteo?.tipoConteo === 'CATEGORIAS' ? 'por categorías' : 'libre'} · ${fmt.dateTime(conteo?.fechaHora)}`),
      h('div', { class: 'row g-3 mb-4' }, [
        col(statCard('Unidades faltantes', totalFaltante, 'bi-arrow-down-circle', '#dc2626')),
        col(statCard('Unidades sobrantes', totalSobrante, 'bi-arrow-up-circle', '#2563eb')),
        col(statCard('Diferencia monetaria', fmt.money(diferenciaMonetaria), 'bi-cash-stack', diferenciaMonetaria < 0 ? '#dc2626' : '#16a34a')),
      ]),
      buildTable(filas),
    );
  } catch (err) {
    loading.remove();
    content.append(h('div', { class: 'alert alert-danger' }, `No se pudo generar el reporte: ${err.message}`));
  }
}

const col = (child) => h('div', { class: 'col-12 col-md-4' }, child);

function buildTable(filas) {
  const body = filas.map((f) => {
    let cls = '', diffTxt;
    if (f.contada == null) { diffTxt = '—'; }
    else if (f.diff < 0) { cls = 'sk-diff-faltante'; diffTxt = String(f.diff); }
    else if (f.diff > 0) { cls = 'sk-diff-sobrante'; diffTxt = `+${f.diff}`; }
    else { cls = 'sk-diff-ok'; diffTxt = '0'; }
    return h('tr', { class: cls }, [
      h('td', {}, f.nombre),
      h('td', { class: 'text-center' }, String(f.esperada)),
      h('td', { class: 'text-center' }, f.contada == null ? '—' : String(f.contada)),
      h('td', { class: 'text-center fw-semibold' }, diffTxt),
      h('td', {}, f.contadoPor),
      h('td', { class: 'text-end' }, fmt.money(f.precio)),
    ]);
  });
  return h('div', { class: 'sk-card p-0' }, [
    h('div', { class: 'table-responsive' }, [
      h('table', { class: 'table table-hover align-middle mb-0' }, [
        h('thead', {}, [h('tr', {}, [
          h('th', {}, 'Producto'),
          h('th', { class: 'text-center' }, 'Esperado'),
          h('th', { class: 'text-center' }, 'Contado'),
          h('th', { class: 'text-center' }, 'Diferencia'),
          h('th', {}, 'Contado por'),
          h('th', { class: 'text-end' }, 'Precio'),
        ])]),
        h('tbody', {}, body.length ? body : [h('tr', {}, [h('td', { colspan: 6, class: 'text-center text-muted py-4' }, 'Sin datos.')])]),
      ]),
    ]),
  ]);
}

function exportPdf(conteo, filas, totales) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Reporte de conteo #${conteo?.id ?? ''}`, 14, 18);
  doc.setFontSize(10);
  doc.text(`Tipo: ${conteo?.tipoConteo === 'CATEGORIAS' ? 'Por categorías' : 'Libre'}`, 14, 26);
  doc.text(`Fecha: ${fmt.dateTime(conteo?.fechaHora)}`, 14, 32);
  doc.autoTable({
    startY: 38,
    head: [['Producto', 'Esperado', 'Contado', 'Diferencia', 'Contado por', 'Precio']],
    body: filas.map((f) => [f.nombre, f.esperada, f.contada == null ? '-' : f.contada, f.contada == null ? '-' : f.diff, f.contadoPor, fmt.money(f.precio)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  const y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.text(`Unidades faltantes: ${totales.totalFaltante}`, 14, y);
  doc.text(`Unidades sobrantes: ${totales.totalSobrante}`, 14, y + 6);
  doc.text(`Diferencia monetaria: ${fmt.money(totales.diferenciaMonetaria)}`, 14, y + 12);
  doc.save(`reporte-conteo-${conteo?.id ?? ''}.pdf`);
}

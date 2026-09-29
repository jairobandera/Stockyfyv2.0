// Escaneo de codigos de barra y popups de busqueda/registro de productos.
// - scanBarcode(): abre un modal con camara (html5-qrcode) + input para lector fisico.
// - manualSearch(productos): busca por codigo, codigo de barra o nombre (con seleccion multiple).
// - askCantidad({...}): popup con datos del producto + input de cantidad contada.
import { ui } from '../core/ui.js';

const Swal = window.Swal;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Formatos de codigo de barra 1D mas comunes (si la libreria esta disponible). */
function barcodeFormats() {
  const F = window.Html5QrcodeSupportedFormats;
  if (!F) return undefined;
  return [
    F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E,
    F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR,
  ];
}

/**
 * Abre el modal de escaneo. Resuelve con el codigo leido (string) o null si se cancela.
 * Funciona con la camara del dispositivo y con un lector fisico (que actua como teclado).
 */
export function scanBarcode() {
  return new Promise((resolve) => {
    let scanner = null;
    let settled = false;

    const stopScanner = async () => {
      if (!scanner) return;
      try { await scanner.stop(); scanner.clear(); } catch { /* ignore */ }
      scanner = null;
    };

    const finish = async (code) => {
      if (settled) return;
      settled = true;
      await stopScanner();
      Swal.close();
      resolve(code);
    };

    Swal.fire({
      title: 'Escanear código de barra',
      html: `
        <div id="sk-reader" style="width:100%;min-height:200px"></div>
        <p class="text-muted small mt-2 mb-1">Apuntá la cámara al código de barra,
           o escaneá con un lector (el código aparecerá abajo).</p>
        <input id="sk-scan-input" class="form-control" placeholder="Código..." autocomplete="off" inputmode="none" />
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      cancelButtonColor: '#64748b',
      width: 420,
      didOpen: () => {
        const input = document.getElementById('sk-scan-input');
        if (input) {
          input.focus();
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = input.value.trim();
              if (v) finish(v);
            }
          });
        }
        if (window.Html5Qrcode) {
          try {
            scanner = new Html5Qrcode('sk-reader', { formatsToSupport: barcodeFormats(), verbose: false });
            scanner.start(
              { facingMode: 'environment' },
              { fps: 10, qrbox: { width: 260, height: 130 } },
              (decodedText) => finish(String(decodedText).trim()),
              () => { /* fallo por frame: ignorar */ }
            ).catch(() => {
              const r = document.getElementById('sk-reader');
              if (r) r.innerHTML = '<div class="text-muted small py-4">Cámara no disponible. Usá un lector o escribí el código.</div>';
            });
          } catch {
            /* sin camara: queda el input manual */
          }
        }
      },
      willClose: () => {
        if (!settled) { settled = true; stopScanner(); resolve(null); }
      },
    });
  });
}

/** Popup con la lista de coincidencias para que el usuario elija una. Resuelve producto o null. */
function pickProducto(matches) {
  const html = '<div class="list-group text-start">' + matches.map((p, i) =>
    `<button type="button" class="list-group-item list-group-item-action" data-i="${i}">
       <div class="fw-semibold">${escapeHtml(p.nombre)}</div>
       <small class="text-muted">Cód: ${escapeHtml(p.codigoProducto)}${
         (p.codigosBarra && p.codigosBarra.length) ? ' · Barra: ' + escapeHtml(p.codigosBarra.join(', ')) : ''}</small>
     </button>`).join('') + '</div>';

  return new Promise((resolve) => {
    let picked = null;
    Swal.fire({
      title: 'Seleccioná el producto',
      html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      cancelButtonColor: '#64748b',
      didOpen: () => {
        document.querySelectorAll('#swal2-html-container .list-group-item-action').forEach((btn) => {
          btn.addEventListener('click', () => { picked = matches[Number(btn.dataset.i)]; Swal.close(); });
        });
      },
      willClose: () => resolve(picked),
    });
  });
}

/**
 * Busqueda manual por codigo / codigo de barra / nombre.
 * Resuelve el producto elegido o null.
 */
export async function manualSearch(productos) {
  const { value: term, isConfirmed } = await Swal.fire({
    title: 'Búsqueda manual',
    input: 'text',
    inputPlaceholder: 'Código, código de barra o nombre',
    showCancelButton: true,
    confirmButtonText: 'Buscar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#2563eb',
    cancelButtonColor: '#64748b',
    inputValidator: (v) => (!v || !v.trim()) ? 'Ingresá algo para buscar.' : undefined,
  });
  if (!isConfirmed) return null;

  const t = term.trim().toLowerCase();

  // 1) Coincidencia exacta por codigo o codigo de barra.
  let matches = productos.filter((p) =>
    (p.codigoProducto || '').toLowerCase() === t ||
    (p.codigosBarra || []).some((b) => (b || '').toLowerCase() === t));

  // 2) Si no hubo exacta, buscar por substring en nombre / codigo / barra.
  if (matches.length === 0) {
    matches = productos.filter((p) =>
      (p.nombre || '').toLowerCase().includes(t) ||
      (p.codigoProducto || '').toLowerCase().includes(t) ||
      (p.codigosBarra || []).some((b) => (b || '').toLowerCase().includes(t)));
  }

  if (matches.length === 0) { ui.error('No se encontró ningún producto con ese criterio.'); return null; }
  if (matches.length === 1) return matches[0];
  return pickProducto(matches);
}

/** Busca un producto por codigo de barra (o codigo). Devuelve producto o null. */
export function findByCode(productos, code) {
  const t = String(code).trim().toLowerCase();
  return productos.find((p) =>
    (p.codigosBarra || []).some((b) => (b || '').toLowerCase() === t) ||
    (p.codigoProducto || '').toLowerCase() === t) || null;
}

/**
 * Popup con los datos del producto + input de cantidad contada.
 * Resuelve el numero ingresado o null si se cancela.
 */
export async function askCantidad({ producto, esperada, nota }) {
  const { value, isConfirmed } = await Swal.fire({
    title: escapeHtml(producto.nombre),
    html: `
      <div class="text-start small mb-2">
        <div><b>Código:</b> ${escapeHtml(producto.codigoProducto)}</div>
        ${(producto.codigosBarra && producto.codigosBarra.length)
          ? `<div><b>Código de barra:</b> ${escapeHtml(producto.codigosBarra.join(', '))}</div>` : ''}
        <div><b>Cantidad esperada:</b> ${escapeHtml(esperada)}</div>
        ${nota ? `<div class="text-warning-emphasis mt-1"><i class="bi bi-exclamation-triangle me-1"></i>${escapeHtml(nota)}</div>` : ''}
      </div>
      <input id="sk-qty" type="number" min="0" class="form-control" placeholder="Cantidad contada" />
    `,
    showCancelButton: true,
    confirmButtonText: 'Registrar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#2563eb',
    cancelButtonColor: '#64748b',
    focusConfirm: false,
    didOpen: () => { const el = document.getElementById('sk-qty'); if (el) el.focus(); },
    preConfirm: () => {
      const v = document.getElementById('sk-qty').value;
      if (v === '' || Number(v) < 0 || Number.isNaN(Number(v))) {
        Swal.showValidationMessage('Ingresá una cantidad válida.');
        return false;
      }
      return Number(v);
    },
  });
  return isConfirmed ? value : null;
}

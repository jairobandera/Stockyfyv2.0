// Utilidades para exportar/importar datos a Excel usando la libreria XLSX (CDN).
import { h } from '../core/dom.js';

/** Exporta un arreglo de objetos a un archivo .xlsx. */
export function exportToExcel(rows, filename, sheetName = 'Datos') {
  const XLSX = window.XLSX;
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Abre un selector de archivos y devuelve las filas del primer sheet como objetos. */
export function importFromExcel() {
  return new Promise((resolve, reject) => {
    const input = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', style: { display: 'none' } });
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const XLSX = window.XLSX;
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet, { defval: null }));
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 1000);
  });
}

export function excelButton(label, icon, onClick, cls = 'btn-outline-success') {
  return h('button', { class: `btn ${cls} btn-sm`, onClick }, [
    h('i', { class: `bi ${icon} me-1` }), label,
  ]);
}

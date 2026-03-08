import { toCsv } from './csv.js';

/**
 * Descarga el contenido CSV generado a partir de la tabla de trabajo.
 */
export function downloadWorkingCsv(filename, rows, delimiter) {
  const csv = toCsv(rows, delimiter);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

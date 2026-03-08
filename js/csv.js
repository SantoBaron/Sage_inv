// Módulo responsable de parsear y serializar CSV manteniendo estructura posicional.
// Está pensado para preservar exactamente los registros E/L/S de Sage X3.

/**
 * Parseador CSV sencillo con soporte de comillas dobles y separador configurable.
 * @param {string} text
 * @param {string} delimiter
 * @returns {string[][]}
 */
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delimiter) {
      row.push(value);
      value = '';
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(value);
      value = '';
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
      row = [];
    } else {
      value += ch;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

/**
 * Detecta delimitador probable según recuento de separadores en la primera línea.
 * @param {string} text
 * @returns {string}
 */
export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

/**
 * Serializa filas en CSV, entrecomillando todo para máxima compatibilidad.
 * @param {string[][]} rows
 * @param {string} delimiter
 * @returns {string}
 */
export function toCsv(rows, delimiter = ',') {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const safe = String(cell ?? '').replaceAll('"', '""');
          return `"${safe}"`;
        })
        .join(delimiter)
    )
    .join('\n');
}

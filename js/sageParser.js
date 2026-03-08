import { detectDelimiter, parseCsv } from './csv.js';

// Índices de campos de líneas S según orden definido en el XML del modelo Sage.
export const S_IDX = {
  TYPE: 0,
  CUNSSSNUM: 1,
  CUNLISNUM: 2,
  ITMLISNUM: 3,
  STOFCY: 4,
  QTYPCUNEW: 5,
  QTYSTUNEW: 6,
  ZERSTOFLG: 7,
  ITMREF: 8,
  LOT: 9,
  SLO: 10,
  LPNNUM: 11,
  LOC: 12,
};

/**
 * Convierte vacíos/espacios a null para que la búsqueda sea consistente.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizeNullable(value) {
  const clean = (value ?? '').trim();
  return clean ? clean : null;
}

/**
 * Importa el CSV original de Sage y extrae metadatos para motor de inventario.
 * @param {string} csvText
 */
export function parseSageSession(csvText) {
  const delimiter = detectDelimiter(csvText);
  const rows = parseCsv(csvText, delimiter);
  const sourceRows = rows.map((r) => [...r]);
  const workingRows = rows.map((r) => [...r]);

  const sRows = rows.filter((r) => r[0] === 'S');
  const eRow = rows.find((r) => r[0] === 'E') || null;
  const lRows = rows.filter((r) => r[0] === 'L');

  if (!eRow || sRows.length === 0) {
    throw new Error('El CSV no contiene estructura mínima E y S requerida por Sage.');
  }

  // Inventario por ubicación si alguna línea S tiene LOC no vacío.
  const requiresLocation = sRows.some((r) => normalizeNullable(r[S_IDX.LOC]) !== null);

  return {
    delimiter,
    sourceRows,
    workingRows,
    eRow,
    lRows,
    sRowsCount: sRows.length,
    sessionCode: eRow[1] || 'SIN_CODIGO',
    requiresLocation,
  };
}

/**
 * Devuelve la última línea S de la tabla de trabajo y su índice absoluto.
 * @param {string[][]} rows
 */
export function getLastSRowInfo(rows) {
  let lastRow = null;
  let index = -1;
  rows.forEach((row, i) => {
    if (row[0] === 'S') {
      lastRow = row;
      index = i;
    }
  });
  return { lastRow, index };
}

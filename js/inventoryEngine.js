import { getLastSRowInfo, normalizeNullable, S_IDX } from './sageParser.js';

/**
 * Construye clave de coincidencia exacta según si la sesión usa ubicación.
 */
function buildMatchKey({ requiresLocation, location, reference, lot, sublot }) {
  const parts = [];
  if (requiresLocation) parts.push(normalizeNullable(location) ?? '__NULL__');
  parts.push(normalizeNullable(reference) ?? '__NULL__');
  parts.push(normalizeNullable(lot) ?? '__NULL__');
  parts.push(normalizeNullable(sublot) ?? '__NULL__');
  return parts.join('|');
}

/**
 * Busca coincidencia exacta sobre tabla de trabajo (solo filas S).
 */
function findMatchingSRow(workingRows, payload, requiresLocation) {
  const target = buildMatchKey({ requiresLocation, ...payload });
  for (let i = 0; i < workingRows.length; i += 1) {
    const row = workingRows[i];
    if (row[0] !== 'S') continue;

    const key = buildMatchKey({
      requiresLocation,
      location: row[S_IDX.LOC],
      reference: row[S_IDX.ITMREF],
      lot: row[S_IDX.LOT],
      sublot: row[S_IDX.SLO],
    });

    if (key === target) return { row, index: i };
  }
  return null;
}

/**
 * Actualiza o crea línea S aplicando reglas exactas de negocio.
 */
export function applyReadingToWorkingTable({
  workingRows,
  sourceRows,
  requiresLocation,
  payload,
  quantity,
}) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('La cantidad debe ser numérica y mayor que cero.');
  }

  const match = findMatchingSRow(workingRows, payload, requiresLocation);
  if (match) {
    const current = Number(match.row[S_IDX.QTYPCUNEW] || 0);
    match.row[S_IDX.QTYPCUNEW] = String(current + qty);
    return { action: 'updated', rowIndex: match.index, lineNumber: match.row[S_IDX.ITMLISNUM] };
  }

  const { lastRow, index } = getLastSRowInfo(workingRows);
  if (!lastRow || index < 0) throw new Error('No existe línea S base para crear nuevas líneas.');

  // Se copia íntegramente la última línea S para preservar estructura técnica.
  const newRow = [...lastRow];
  // Regla Sage: para altas nuevas en importación, ITMLISNUM debe ir a 0.
  // Sage asignará automáticamente el número real de línea al importar.
  newRow[S_IDX.ITMLISNUM] = '0';
  newRow[S_IDX.ITMREF] = payload.reference;
  newRow[S_IDX.LOT] = payload.lot ?? '';
  newRow[S_IDX.SLO] = payload.sublot ?? '';
  if (requiresLocation) newRow[S_IDX.LOC] = payload.location ?? '';
  newRow[S_IDX.QTYPCUNEW] = String(qty);

  // Inserción tras la última S: no altera orden previo y añade al final del bloque S.
  workingRows.splice(index + 1, 0, newRow);

  const originalSCount = sourceRows.filter((r) => r[0] === 'S').length;
  const currentSCount = workingRows.filter((r) => r[0] === 'S').length;
  return {
    action: 'created',
    rowIndex: index + 1,
    lineNumber: newRow[S_IDX.ITMLISNUM],
    newLinesCount: currentSCount - originalSCount,
  };
}

/**
 * Calcula métricas de sesión para pantalla de exportación.
 */
export function calculateStats(sourceRows, workingRows) {
  const sourceS = sourceRows.filter((r) => r[0] === 'S');
  const workS = workingRows.filter((r) => r[0] === 'S');

  let modified = 0;
  sourceS.forEach((src, idx) => {
    const wrk = workS[idx];
    if (!wrk) return;
    if (String(src[S_IDX.QTYPCUNEW] ?? '0') !== String(wrk[S_IDX.QTYPCUNEW] ?? '0')) modified += 1;
  });

  const newLines = Math.max(workS.length - sourceS.length, 0);
  return { modified, newLines, totalS: workS.length };
}

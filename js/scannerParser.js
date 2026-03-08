import { normalizeNullable } from './sageParser.js';

// Parser específico de la cadena enviada por el lector del cliente.
// No implementa GS1 general, solo el formato solicitado con marcadores Ê02/Ê10/Ê04/Ê21.
const TOKENS = ['Ê02', 'Ê10', 'Ê04', 'Ê21'];

/**
 * Detector de ubicaciones según patrón de almacén:
 * - 1 letra (A-Z)
 * - 2 dígitos de mueble
 * - 2 dígitos de balda
 * Ejemplos válidos: A0101, B0101, C0203
 */
export function detectLocationCode(rawCode) {
  const raw = String(rawCode ?? '').trim().toUpperCase();
  const match = /^[A-Z]\d{4}$/.test(raw);
  return {
    isLocation: match,
    location: match ? raw : null,
  };
}

/**
 * Obtiene texto entre dos tokens; permite detectar vacío cuando los tokens son consecutivos.
 */
function extractBetween(raw, startToken, endToken) {
  const start = raw.indexOf(startToken);
  if (start < 0) return null;
  const from = start + startToken.length;
  const end = raw.indexOf(endToken, from);
  if (end < 0) return null;
  return raw.slice(from, end);
}

/**
 * Parsea lectura de artículo según reglas jerárquicas del proyecto.
 * @param {string} rawCode
 */
export function parseScannedArticle(rawCode) {
  const raw = String(rawCode ?? '').trim();
  const errors = [];
  const warnings = [];

  const hasEndMarker = raw.includes('Ê21');
  if (!hasEndMarker) warnings.push('No se detectó marca de fin Ê21.');

  const pos = TOKENS.map((t) => raw.indexOf(t));
  const [p02, p10, p04, p21] = pos;

  if (p02 < 0) errors.push('No existe identificador Ê02 (referencia).');
  if (p10 >= 0 && p10 < p02) errors.push('Orden inválido: Ê10 aparece antes de Ê02.');
  if (p04 >= 0 && (p10 < 0 || p04 < p10)) errors.push('Orden inválido: sublote sin lote válido.');
  if (p21 >= 0 && ((p04 >= 0 && p21 < p04) || (p10 >= 0 && p04 < 0 && p21 < p10))) {
    errors.push('Orden inválido: Ê21 aparece antes de finalizar campos.');
  }

  let referenceRaw = null;
  let lotRaw = null;
  let sublotRaw = null;

  if (p02 >= 0) {
    const endRef = p10 >= 0 ? 'Ê10' : p21 >= 0 ? 'Ê21' : null;
    if (endRef) referenceRaw = extractBetween(raw, 'Ê02', endRef);
  }

  if (p10 >= 0) {
    const endLot = p04 >= 0 ? 'Ê04' : p21 >= 0 ? 'Ê21' : null;
    if (endLot) lotRaw = extractBetween(raw, 'Ê10', endLot);
  }

  if (p04 >= 0 && p21 >= 0) {
    sublotRaw = extractBetween(raw, 'Ê04', 'Ê21');
  }

  const reference = normalizeNullable(referenceRaw);
  const lot = normalizeNullable(lotRaw);
  const sublot = normalizeNullable(sublotRaw);

  if (!reference) errors.push('Referencia vacía o no interpretable.');
  if (sublot && !lot) errors.push('Sublote informado con lote vacío.');

  return {
    rawCode: raw,
    reference,
    lot,
    sublot,
    hasEndMarker,
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Clasifica una lectura cruda en ubicación, artículo o inválida.
 * Esto permite mantener un único foco de entrada y procesar automáticamente.
 */
export function classifyScan(rawCode) {
  const raw = String(rawCode ?? '').trim();
  const loc = detectLocationCode(raw);
  if (loc.isLocation) {
    return {
      kind: 'location',
      location: loc.location,
      rawCode: raw,
      isValid: true,
      errors: [],
      warnings: [],
    };
  }

  const article = parseScannedArticle(raw);
  if (article.isValid) {
    return {
      kind: 'article',
      ...article,
    };
  }

  // Fallback operativo: lectura sin tokens se interpreta como referencia directa de artículo.
  if (!raw.includes('Ê02') && raw.length > 0) {
    return {
      kind: 'article',
      rawCode: raw,
      reference: raw,
      lot: null,
      sublot: null,
      hasEndMarker: false,
      isValid: true,
      errors: [],
      warnings: ['Lectura sin tokens Êxx: usada como referencia directa.'],
    };
  }

  return {
    kind: 'invalid',
    rawCode: raw,
    isValid: false,
    errors: article.errors,
    warnings: article.warnings,
  };
}

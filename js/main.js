import { parseSageSession, normalizeNullable } from './sageParser.js';
import { classifyScan, hasAnyEndMarker } from './scannerParser.js';
import { applyReadingToWorkingTable, calculateStats } from './inventoryEngine.js';
import { downloadWorkingCsv } from './exporter.js';
import { getSession, listSessions, saveSession } from './storage.js';
import { detectDelimiter, parseCsv } from './csv.js';

// Estado principal de la sesión en curso.
let currentSession = null;
// Cantidad que se aplicará a la siguiente lectura por escáner.
let nextScanQuantity = 1;
// Permite mostrar/ocultar el log de lecturas bajo demanda del operario.
let isLogVisible = false;

const els = {
  tabs: [...document.querySelectorAll('.tab-btn')],
  tabPanels: [...document.querySelectorAll('.tab-panel')],
  inventoryFile: document.getElementById('inventoryFile'),
  mapFile: document.getElementById('mapFile'),
  btnImport: document.getElementById('btnImport'),
  importSummary: document.getElementById('importSummary'),
  savedSessions: document.getElementById('savedSessions'),
  btnLoadSession: document.getElementById('btnLoadSession'),
  btnRefreshSessions: document.getElementById('btnRefreshSessions'),
  statusSession: document.getElementById('statusSession'),
  statusLocationRequired: document.getElementById('statusLocationRequired'),
  statusActiveLocation: document.getElementById('statusActiveLocation'),
  scanInput: document.getElementById('scanInput'),
  btnScanQty: document.getElementById('btnScanQty'),
  qtyDialog: document.getElementById('qtyDialog'),
  qtyForm: document.getElementById('qtyForm'),
  qtyInput: document.getElementById('qtyInput'),
  btnQtyCancel: document.getElementById('btnQtyCancel'),
  btnProcessScan: document.getElementById('btnProcessScan'),
  btnOpenManual: document.getElementById('btnOpenManual'),
  manualDialog: document.getElementById('manualDialog'),
  manualForm: document.getElementById('manualForm'),
  btnManualCancel: document.getElementById('btnManualCancel'),
  manualRef: document.getElementById('manualRef'),
  manualLot: document.getElementById('manualLot'),
  manualSublot: document.getElementById('manualSublot'),
  manualQty: document.getElementById('manualQty'),
  btnToggleLog: document.getElementById('btnToggleLog'),
  logContainer: document.getElementById('logContainer'),
  logTableBody: document.getElementById('logTableBody'),
  exportSummary: document.getElementById('exportSummary'),
  btnExportCsv: document.getElementById('btnExportCsv'),
  toast: document.getElementById('toast'),
};

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.className = isError ? 'error' : '';
  els.toast.style.display = 'block';
  setTimeout(() => {
    els.toast.style.display = 'none';
  }, 2800);
}

function switchTab(tabName) {
  els.tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  els.tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${tabName}`));
}



/**
 * Refresca el texto del botón de cantidad para la siguiente lectura.
 */
function updateScanQtyButton() {
  els.btnScanQty.textContent = `Cantidad: ${nextScanQuantity}`;
}


/**
 * Actualiza visibilidad del panel de log para reducir ruido visual en conteo.
 */
function updateLogVisibilityUI() {
  els.logContainer.classList.toggle('hidden', !isLogVisible);
  els.btnToggleLog.textContent = isLogVisible ? 'Ocultar log' : 'Mostrar log';
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

function buildLocalSessionId(sessionCode, allSessions) {
  const same = allSessions.filter((s) => s.sourceMeta?.sessionCode === sessionCode).length + 1;
  return `SESSINV_${sessionCode}-${same}`;
}

function parseMapLocations(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  const locations = new Set();
  rows.forEach((r) => {
    const loc = normalizeNullable(r[1]);
    if (loc && loc !== 'LOC') locations.add(loc.toUpperCase());
  });
  return [...locations];
}

async function refreshSavedSessions() {
  const sessions = await listSessions();
  els.savedSessions.innerHTML = '';
  if (sessions.length === 0) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = 'No hay sesiones guardadas';
    els.savedSessions.appendChild(o);
    return;
  }

  sessions.forEach((s) => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = `${s.id} | ${s.sourceMeta.sessionCode} | ${new Date(s.createdAt).toLocaleString()}`;
    els.savedSessions.appendChild(o);
  });
}

function updateSummaryUI() {
  if (!currentSession) {
    els.importSummary.textContent = 'Sin sesión cargada.';
    els.exportSummary.textContent = 'Sin sesión cargada.';
    return;
  }

  const stats = calculateStats(currentSession.sourceRows, currentSession.workingRows);

  els.importSummary.textContent = [
    `SessionId local: ${currentSession.id}`,
    `Código de sesión Sage: ${currentSession.sourceMeta.sessionCode}`,
    `Gestión por ubicación: ${currentSession.sourceMeta.requiresLocation ? 'Sí' : 'No'}`,
    `Líneas S importadas: ${currentSession.sourceMeta.sRowsCount}`,
    `Ubicaciones válidas cargadas: ${currentSession.validLocations.length}`,
  ].join('\n');

  els.exportSummary.textContent = [
    `SessionId local: ${currentSession.id}`,
    `Líneas S totales en trabajo: ${stats.totalS}`,
    `Líneas modificadas (existentes): ${stats.modified}`,
    `Líneas nuevas: ${stats.newLines}`,
    `Eventos en log: ${currentSession.logRows.length}`,
  ].join('\n');

  els.statusSession.textContent = currentSession.id;
  els.statusLocationRequired.textContent = currentSession.sourceMeta.requiresLocation ? 'Sí' : 'No';
  els.statusActiveLocation.textContent = currentSession.activeLocation || '(sin ubicación activa)';

  const last = currentSession.logRows.slice(-20).reverse();
  els.logTableBody.innerHTML = last
    .map(
      (l) => `<tr>
        <td>${new Date(l.timestamp).toLocaleString()}</td>
        <td>${l.tipoLectura}</td>
        <td>${l.ubicacion ?? ''}</td>
        <td>${l.referencia ?? ''}</td>
        <td>${l.lote ?? ''}</td>
        <td>${l.sublote ?? ''}</td>
        <td>${l.cantidad}</td>
        <td>${l.rawCode ?? ''}</td>
        <td>${l.resultado}</td>
      </tr>`
    )
    .join('');
}

function requireSessionLoaded() {
  if (!currentSession) throw new Error('Debe cargar/importar una sesión primero.');
}

/**
 * Valida ubicación activa únicamente cuando el inventario trabaja por ubicación.
 */
function validateActiveLocation() {
  requireSessionLoaded();
  if (!currentSession.sourceMeta.requiresLocation) return;

  const loc = normalizeNullable(currentSession.activeLocation);
  if (!loc) throw new Error('Debe establecer ubicación activa para inventario con ubicación.');
  if (!currentSession.validLocations.includes(loc.toUpperCase())) {
    throw new Error('La ubicación activa no existe en MAPA.csv.');
  }
}

/**
 * Aplica cambio de ubicación activa desde una lectura detectada automáticamente.
 */
async function processLocationScan(locationCode) {
  requireSessionLoaded();
  const loc = normalizeNullable(locationCode)?.toUpperCase();
  if (!loc) throw new Error('Ubicación vacía.');

  if (currentSession.sourceMeta.requiresLocation && !currentSession.validLocations.includes(loc)) {
    throw new Error(`Ubicación inválida según MAPA: ${loc}`);
  }

  currentSession.activeLocation = loc;
  currentSession.logRows.push({
    timestamp: new Date().toISOString(),
    sessionId: currentSession.id,
    tipoLectura: 'UBI',
    ubicacion: loc,
    referencia: null,
    lote: null,
    sublote: null,
    cantidad: 0,
    rawCode: loc,
    resultado: 'location_changed',
  });

  await persistAndRefresh();
  showToast(`Ubicación activa: ${loc}`);
}

async function persistAndRefresh() {
  await saveSession(currentSession);
  updateSummaryUI();
}

async function processItem({ reference, lot, sublot, quantity, tipoLectura, rawCode }) {
  requireSessionLoaded();
  validateActiveLocation();

  const payload = {
    location: currentSession.sourceMeta.requiresLocation ? currentSession.activeLocation : null,
    reference,
    lot: normalizeNullable(lot),
    sublot: normalizeNullable(sublot),
  };

  if (!payload.reference) throw new Error('La referencia es obligatoria.');
  if (payload.sublot && !payload.lot) throw new Error('No se permite sublote sin lote.');

  const result = applyReadingToWorkingTable({
    workingRows: currentSession.workingRows,
    sourceRows: currentSession.sourceRows,
    requiresLocation: currentSession.sourceMeta.requiresLocation,
    payload,
    quantity,
  });

  currentSession.logRows.push({
    timestamp: new Date().toISOString(),
    sessionId: currentSession.id,
    tipoLectura,
    ubicacion: payload.location,
    referencia: payload.reference,
    lote: payload.lot,
    sublote: payload.sublot,
    cantidad: Number(quantity),
    rawCode: rawCode || null,
    resultado: result.action,
  });

  await persistAndRefresh();
  showToast(`Lectura procesada (${result.action}).`);
}

els.tabs.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

els.btnScanQty.addEventListener('click', () => {
  els.qtyInput.value = String(nextScanQuantity);
  els.qtyDialog.showModal();
  els.qtyInput.focus();
});

els.btnQtyCancel.addEventListener('click', () => {
  els.qtyDialog.close();
  els.scanInput.focus();
});

els.btnToggleLog.addEventListener('click', () => {
  isLogVisible = !isLogVisible;
  updateLogVisibilityUI();
});

els.qtyForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const qty = Number(els.qtyInput.value);
  if (!Number.isFinite(qty) || qty <= 0) {
    showToast('La cantidad debe ser mayor que cero.', true);
    return;
  }
  nextScanQuantity = qty;
  updateScanQtyButton();
  els.qtyDialog.close();
  els.scanInput.focus();
});

els.btnImport.addEventListener('click', async () => {
  try {
    const inventory = els.inventoryFile.files?.[0];
    if (!inventory) throw new Error('Debe cargar el CSV de sesión de inventario.');

    const csvText = await readFileText(inventory);
    const parsed = parseSageSession(csvText);

    const sessions = await listSessions();
    const id = buildLocalSessionId(parsed.sessionCode, sessions);

    let validLocations = [];
    if (parsed.requiresLocation) {
      const map = els.mapFile.files?.[0];
      if (!map) throw new Error('Este inventario requiere ubicación: debe cargar MAPA.csv.');
      validLocations = parseMapLocations(await readFileText(map));
      if (validLocations.length === 0) throw new Error('No se detectaron ubicaciones válidas en MAPA.csv.');
    }

    currentSession = {
      id,
      createdAt: new Date().toISOString(),
      sourceRows: parsed.sourceRows,
      workingRows: parsed.workingRows,
      sourceMeta: {
        sessionCode: parsed.sessionCode,
        requiresLocation: parsed.requiresLocation,
        sRowsCount: parsed.sRowsCount,
        delimiter: parsed.delimiter,
      },
      validLocations,
      activeLocation: null,
      logRows: [],
    };

    await persistAndRefresh();
    await refreshSavedSessions();
    switchTab('conteo');
    showToast('Sesión importada correctamente.');
  } catch (err) {
    showToast(err.message, true);
  }
});

els.btnRefreshSessions.addEventListener('click', async () => {
  await refreshSavedSessions();
  showToast('Listado de sesiones actualizado.');
});

els.btnLoadSession.addEventListener('click', async () => {
  try {
    const id = els.savedSessions.value;
    if (!id) throw new Error('Seleccione una sesión guardada.');
    const loaded = await getSession(id);
    if (!loaded) throw new Error('No se encontró la sesión seleccionada.');
    currentSession = loaded;
    updateSummaryUI();
    switchTab('conteo');
    showToast('Sesión cargada.');
  } catch (err) {
    showToast(err.message, true);
  }
});

/**
 * Procesa lectura unificada del input principal:
 * - Ubicación: cambia ubicación activa.
 * - Artículo: actualiza/crea línea de inventario.
 */
els.btnProcessScan.addEventListener('click', async () => {
  try {
    requireSessionLoaded();
    const raw = els.scanInput.value.trim();
    const qty = Number(nextScanQuantity || 1);
    if (!raw) throw new Error('Lectura vacía.');

    const detected = classifyScan(raw);

    if (detected.kind === 'location') {
      await processLocationScan(detected.location);
    } else if (detected.kind === 'article') {
      const tipoLectura = qty === 1 ? 'L' : 'LC';
      await processItem({
        reference: detected.reference,
        lot: detected.lot,
        sublot: detected.sublot,
        quantity: qty,
        tipoLectura,
        rawCode: detected.rawCode,
      });
    } else {
      throw new Error(detected.errors.join(' | ') || 'Lectura inválida.');
    }

    els.scanInput.value = '';

    // Si la lectura registrada es un artículo, la cantidad vuelve automáticamente a 1.
    if (detected.kind === 'article') {
      nextScanQuantity = 1;
      updateScanQtyButton();
    }
  } catch (err) {
    showToast(err.message, true);
  }
});


els.scanInput.addEventListener('keydown', (ev) => {
  // Muchos lectores USB envían Enter al terminar: esto procesa tanto ubicaciones
  // en texto plano como referencias de artículo sin requerir marcador Ê21.
  if (ev.key === 'Enter') {
    ev.preventDefault();
    els.btnProcessScan.click();
  }
});

els.scanInput.addEventListener('input', () => {
  // Si hay marca de fin de artículo (21 con prefijo Ê/É/�) o patrón de ubicación, procesa automáticamente.
  const raw = els.scanInput.value.trim();
  if (hasAnyEndMarker(raw) || /^[A-Za-z]\d{4}$/.test(raw)) {
    els.btnProcessScan.click();
  }
});

els.btnOpenManual.addEventListener('click', () => {
  try {
    requireSessionLoaded();
    els.manualDialog.showModal();
    els.manualRef.focus();
  } catch (err) {
    showToast(err.message, true);
  }
});

els.btnManualCancel.addEventListener('click', () => {
  els.manualDialog.close();
  els.scanInput.focus();
});

els.manualForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const qty = Number(els.manualQty.value || 1);
    const tipoLectura = qty === 1 ? 'M' : 'MC';

    await processItem({
      reference: normalizeNullable(els.manualRef.value),
      lot: normalizeNullable(els.manualLot.value),
      sublot: normalizeNullable(els.manualSublot.value),
      quantity: qty,
      tipoLectura,
      rawCode: null,
    });

    els.manualRef.value = '';
    els.manualLot.value = '';
    els.manualSublot.value = '';
    els.manualQty.value = '1';

    els.manualDialog.close();
    els.scanInput.focus();
  } catch (err) {
    showToast(err.message, true);
  }
});

els.btnExportCsv.addEventListener('click', () => {
  try {
    requireSessionLoaded();
    const filename = `EXPORT_${currentSession.id}.csv`;
    downloadWorkingCsv(filename, currentSession.workingRows, currentSession.sourceMeta.delimiter);
    showToast(`CSV generado: ${filename}`);
  } catch (err) {
    showToast(err.message, true);
  }
});

// Mantiene foco operativo para lector USB que actúa como teclado.
setInterval(() => {
  if (!els.manualDialog.open && !els.qtyDialog.open && document.activeElement !== els.scanInput) {
    els.scanInput.focus({ preventScroll: true });
  }
}, 900);

updateScanQtyButton();
updateLogVisibilityUI();
refreshSavedSessions().then(() => updateSummaryUI());

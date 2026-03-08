import { parseSageSession, normalizeNullable } from './sageParser.js';
import { parseScannedArticle } from './scannerParser.js';
import { applyReadingToWorkingTable, calculateStats } from './inventoryEngine.js';
import { downloadWorkingCsv } from './exporter.js';
import { getSession, listSessions, saveSession } from './storage.js';
import { detectDelimiter, parseCsv } from './csv.js';

// Estado principal de la sesión en curso.
let currentSession = null;

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
  locationInput: document.getElementById('locationInput'),
  btnSetLocation: document.getElementById('btnSetLocation'),
  scanInput: document.getElementById('scanInput'),
  scanQty: document.getElementById('scanQty'),
  btnProcessScan: document.getElementById('btnProcessScan'),
  manualRef: document.getElementById('manualRef'),
  manualLot: document.getElementById('manualLot'),
  manualSublot: document.getElementById('manualSublot'),
  manualQty: document.getElementById('manualQty'),
  btnProcessManual: document.getElementById('btnProcessManual'),
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

function validateActiveLocation() {
  requireSessionLoaded();
  if (!currentSession.sourceMeta.requiresLocation) return;

  const loc = normalizeNullable(currentSession.activeLocation);
  if (!loc) throw new Error('Debe establecer ubicación activa para inventario con ubicación.');
  if (!currentSession.validLocations.includes(loc.toUpperCase())) {
    throw new Error('La ubicación activa no existe en MAPA.csv.');
  }
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

els.btnSetLocation.addEventListener('click', async () => {
  try {
    requireSessionLoaded();
    const loc = normalizeNullable(els.locationInput.value)?.toUpperCase();
    if (!loc) throw new Error('Ubicación vacía.');

    if (currentSession.sourceMeta.requiresLocation && !currentSession.validLocations.includes(loc)) {
      throw new Error(`Ubicación inválida según MAPA: ${loc}`);
    }

    currentSession.activeLocation = loc;
    els.locationInput.value = '';
    await persistAndRefresh();
    showToast(`Ubicación activa: ${loc}`);
  } catch (err) {
    showToast(err.message, true);
  }
});

els.scanInput.addEventListener('input', () => {
  // Si el lector no manda Enter, la marca Ê21 dispara el procesamiento.
  if (els.scanInput.value.includes('Ê21')) {
    els.btnProcessScan.click();
  }
});

els.btnProcessScan.addEventListener('click', async () => {
  try {
    const raw = els.scanInput.value.trim();
    const qty = Number(els.scanQty.value || 1);
    if (!raw) throw new Error('Lectura vacía.');

    let parsed = parseScannedArticle(raw);

    // Fallback operativo: si no hay tokens del formato, se trata como referencia directa.
    if (!parsed.isValid && !raw.includes('Ê02')) {
      parsed = {
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

    if (!parsed.isValid) throw new Error(parsed.errors.join(' | '));

    const tipoLectura = qty === 1 ? 'L' : 'LC';
    await processItem({
      reference: parsed.reference,
      lot: parsed.lot,
      sublot: parsed.sublot,
      quantity: qty,
      tipoLectura,
      rawCode: parsed.rawCode,
    });

    els.scanInput.value = '';
    els.scanQty.value = '1';
  } catch (err) {
    showToast(err.message, true);
  }
});

els.btnProcessManual.addEventListener('click', async () => {
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
  if (document.activeElement !== els.scanInput) {
    els.scanInput.focus({ preventScroll: true });
  }
}, 900);

refreshSavedSessions().then(() => updateSummaryUI());

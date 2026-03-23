import { toCsv } from './csv.js';
import { S_IDX } from './sageParser.js';

function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Descarga el contenido CSV generado a partir de la tabla de trabajo.
 */
export function downloadWorkingCsv(filename, rows, delimiter) {
  const csv = toCsv(rows, delimiter);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(filename, blob);
}

/**
 * Genera una exportación Sage omitiendo líneas S cuyo QTYPCUNEW sea 0.
 */
export function downloadCountedOnlyCsv(filename, rows, delimiter) {
  let omittedZeroLines = 0;
  let exportedSLines = 0;
  const filteredRows = rows.filter((row) => {
    if (row[0] !== 'S') return true;
    if (Number(row[S_IDX.QTYPCUNEW] ?? 0) === 0) {
      omittedZeroLines += 1;
      return false;
    }
    exportedSLines += 1;
    return true;
  });

  const csv = toCsv(filteredRows, delimiter);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(filename, blob);
  return { omittedZeroLines, exportedSLines };
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildCell(value, type = 'String') {
  return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
}

/**
 * Genera un fichero Excel 2003 XML con el log completo de la sesión.
 * Es compatible con Excel sin depender de librerías externas.
 */
export function downloadSessionLogExcel(filename, session) {
  const rows = session.logRows ?? [];
  const header = [
    'Fecha ISO',
    'Fecha local',
    'SessionId',
    'Tipo',
    'Ubicación',
    'Referencia',
    'Lote',
    'Sublote',
    'Cantidad',
    'Raw',
    'Resultado',
  ];

  const headerXml = `<Row>${header.map((cell) => buildCell(cell)).join('')}</Row>`;
  const rowsXml = rows
    .map((row) => {
      const localDate = row.timestamp ? new Date(row.timestamp).toLocaleString() : '';
      const quantity = Number(row.cantidad);
      const quantityCell = Number.isFinite(quantity)
        ? buildCell(String(quantity), 'Number')
        : buildCell('');
      return `<Row>
        ${buildCell(row.timestamp ?? '')}
        ${buildCell(localDate)}
        ${buildCell(row.sessionId ?? session.id ?? '')}
        ${buildCell(row.tipoLectura ?? '')}
        ${buildCell(row.ubicacion ?? '')}
        ${buildCell(row.referencia ?? '')}
        ${buildCell(row.lote ?? '')}
        ${buildCell(row.sublote ?? '')}
        ${quantityCell}
        ${buildCell(row.rawCode ?? '')}
        ${buildCell(row.resultado ?? '')}
      </Row>`;
    })
    .join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="LOG_SESION">
    <Table>
      ${headerXml}
      ${rowsXml}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(filename, blob);
}

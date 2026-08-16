import ExcelJS from 'exceljs';
import { Readable } from 'stream';

// Escape a value for CSV.
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Stream an array of flat objects as a CSV download.
export function sendCsv(res, filename, rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(lines.join('\n'));
}

// Parse an uploaded CSV buffer into an array of row objects keyed by the
// header row — the mirror of sendCsv, for bulk-import flows.
export async function parseCsv(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.csv.read(Readable.from(buffer));
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers = ws.getRow(1).values.slice(1).map((h) => String(h ?? '').trim());
  const rows = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const values = ws.getRow(i).values.slice(1);
    if (values.every((v) => v == null || v === '')) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] != null ? String(values[idx]).trim() : ''; });
    rows.push(row);
  }
  return rows;
}

// Stream an array of flat objects as an .xlsx download.
export async function sendExcel(res, filename, rows, sheetName = 'Sheet1') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(12, h.length + 2) }));
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

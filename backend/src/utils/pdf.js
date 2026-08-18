import PDFDocument from 'pdfkit';
import { getObjectBuffer } from '../config/storage.js';
import { toRupees } from './money.js';
import { STATE_CODES } from '../config/gst.js';

// Shared black & white document styling — mirrors the app's monochrome theme.
const INK = '#111111';
const MUTED = '#666666';
const LINE = '#cccccc';

function money(settings, n) {
  const cur = settings?.currency || '₹';
  return `${cur}${Number(n || 0).toFixed(2)}`;
}

// Invoices, payments and payslips store money as integer paise (see
// utils/money.js). PDFs render the raw Mongoose documents rather than their
// JSON form, so they never see the schema's paise-to-rupees transform and have
// to convert here. Everything else on these pages — dispenses, purchase
// orders, ambulance charges, report summaries — is already in rupees and keeps
// using money() above.
function moneyP(settings, paise) {
  return money(settings, toRupees(paise));
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Pipe a PDFDocument to an Express response with correct headers.
function streamToResponse(doc, res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);
}

// PDFKit needs the logo as bytes, and with the S3 driver fetching those is a
// network round trip. Every printed document carries the same logo, so it is
// cached in memory.
//
// The cache key is the storage key, which is a fresh random name on every
// upload — so a replaced logo simply misses the cache. Nothing has to be
// invalidated, and no stale image can ever be drawn.
const logoCache = new Map();

async function loadLogo(storageKey) {
  if (logoCache.has(storageKey)) return logoCache.get(storageKey);

  let buffer = null;
  try {
    buffer = await getObjectBuffer(storageKey);
  } catch {
    // A missing logo must not break the document it belongs on. Cache the
    // miss too, so a broken key isn't re-fetched on every single PDF.
  }
  logoCache.set(storageKey, buffer);
  return buffer;
}

// Draw the hospital letterhead; returns the y just below it.
async function drawHeader(doc, settings) {
  const s = settings || {};
  if (s.logo?.storageKey) {
    const logo = await loadLogo(s.logo.storageKey);
    if (logo) {
      try {
        doc.image(logo, 480, 40, { fit: [65, 65] });
      } catch {
        // Corrupt image data — skip it rather than failing the document.
      }
    }
  }
  doc.fillColor(INK).fontSize(20).font('Helvetica-Bold')
    .text(s.hospitalName || 'Hospital', 50, 50);
  if (s.tagline) {
    doc.fontSize(9).font('Helvetica-Oblique').fillColor(MUTED).text(s.tagline, 50, 74);
  }
  const addr = [s.addressLine, [s.city, s.state].filter(Boolean).join(', '), s.pincode].filter(Boolean).join(' · ');
  const contact = [s.phone, s.email, s.website].filter(Boolean).join('  |  ');
  doc.fontSize(8).font('Helvetica').fillColor(MUTED);
  if (addr) doc.text(addr, 50, 88);
  if (contact) doc.text(contact, 50, 100);
  const extra = [s.gstin ? `GSTIN: ${s.gstin}` : '', s.registrationNo ? `Reg: ${s.registrationNo}` : ''].filter(Boolean).join('   ');
  if (extra) doc.text(extra, 50, 112);

  doc.moveTo(50, 128).lineTo(545, 128).strokeColor(LINE).lineWidth(1).stroke();
  return 140;
}

function drawTitle(doc, title, y) {
  doc.fillColor(INK).fontSize(15).font('Helvetica-Bold').text(title, 50, y);
  return y + 24;
}

// key/value info grid in two columns.
function drawInfoGrid(doc, rows, y) {
  doc.fontSize(9).font('Helvetica');
  const colW = 247;
  rows.forEach((row, i) => {
    const x = 50 + (i % 2) * colW;
    const ry = y + Math.floor(i / 2) * 16;
    doc.fillColor(MUTED).font('Helvetica').text(`${row[0]}: `, x, ry, { continued: true });
    doc.fillColor(INK).font('Helvetica-Bold').text(row[1] == null || row[1] === '' ? '—' : String(row[1]));
  });
  return y + Math.ceil(rows.length / 2) * 16 + 10;
}

// ---------------------------------------------------------------------------
// INVOICE
// ---------------------------------------------------------------------------
export async function generateInvoicePdf(res, { invoice, payments = [], settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${invoice.invoiceNo || 'invoice'}.pdf`);

  let y = await drawHeader(doc, settings);
  y = drawTitle(doc, 'TAX INVOICE', y);

  const p = invoice.patient || {};
  const patientName = [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';
  y = drawInfoGrid(doc, [
    ['Invoice No', invoice.invoiceNo],
    ['Date', fmtDate(invoice.createdAt)],
    ['Patient', patientName],
    ['UHID', p.uhid],
    ['Phone', p.phone],
    ['Status', invoice.status],
    // Only on a B2B bill — an individual patient has no GSTIN, and a blank row
    // labelled "GSTIN" on every walk-in receipt is noise.
    ...(invoice.customerGstin ? [['Customer GSTIN', invoice.customerGstin]] : []),
    // Place of supply is what decides CGST/SGST vs IGST, so a tax invoice has
    // to state it.
    ...(invoice.placeOfSupply
      ? [['Place of Supply', `${invoice.placeOfSupply} — ${STATE_CODES[invoice.placeOfSupply] || 'Unknown'}`]]
      : []),
  ], y);

  // Items table.
  //
  // HSN/SAC and the GST rate are columns of their own because a tax invoice is
  // required to show them per line — a single tax figure at the bottom does not
  // make a document a tax invoice.
  y += 6;
  const cols = { desc: 50, hsn: 265, qty: 320, rate: 360, gst: 415, amt: 470 };
  doc.fontSize(8).font('Helvetica-Bold').fillColor(INK);
  doc.text('Description', cols.desc, y);
  doc.text('HSN/SAC', cols.hsn, y, { width: 50 });
  doc.text('Qty', cols.qty, y, { width: 32, align: 'right' });
  doc.text('Rate', cols.rate, y, { width: 48, align: 'right' });
  doc.text('GST', cols.gst, y, { width: 48, align: 'right' });
  doc.text('Amount', cols.amt, y, { width: 75, align: 'right' });
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 6;

  doc.font('Helvetica').fontSize(8).fillColor(INK);
  (invoice.items || []).forEach((it) => {
    if (y > 720) { doc.addPage(); y = 60; }
    const label = it.category && it.category !== 'OTHER' ? `${it.description}  (${it.category})` : it.description;
    // "Exempt" is a meaningful statement on a bill, not a blank — it tells the
    // patient (and an auditor) that no tax was due, rather than that somebody
    // forgot to charge it.
    const gstLabel = it.taxTreatment === 'TAXABLE'
      ? `${it.taxRatePercent}%`
      : (it.taxTreatment === 'NIL_RATED' ? 'Nil' : 'Exempt');

    doc.text(label, cols.desc, y, { width: 210 });
    doc.text(it.hsnSac || '—', cols.hsn, y, { width: 50 });
    doc.text(String(it.quantity), cols.qty, y, { width: 32, align: 'right' });
    doc.text(moneyP(settings, it.unitPrice), cols.rate, y, { width: 48, align: 'right' });
    doc.text(gstLabel, cols.gst, y, { width: 48, align: 'right' });
    doc.text(moneyP(settings, it.amount), cols.amt, y, { width: 75, align: 'right' });
    y += Math.max(16, doc.heightOfString(label, { width: 210 }));
  });

  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 8;

  // Totals block (right aligned).
  //
  // The tax heads are shown separately, and only the ones that actually apply:
  // an intra-state bill has CGST and SGST, an inter-state one has IGST, and
  // showing all three with zeroes would just invite the reader to add them up
  // wrongly.
  const taxLines = invoice.isInterState
    ? [['IGST', invoice.totalIgst]]
    : [['CGST', invoice.totalCgst], ['SGST', invoice.totalSgst]];

  const totals = [
    ['Subtotal', moneyP(settings, invoice.subtotal)],
    ...(invoice.discount ? [['Discount', `- ${moneyP(settings, invoice.discount)}`]] : []),
    ...(invoice.exemptValue ? [['Exempt value', moneyP(settings, invoice.exemptValue)]] : []),
    ...(invoice.taxableValue ? [['Taxable value', moneyP(settings, invoice.taxableValue)]] : []),
    ...taxLines.filter(([, v]) => v > 0).map(([k, v]) => [k, moneyP(settings, v)]),
    // A bill raised before per-line tax existed has a whole-invoice rate and
    // none of the breakdown above.
    ...(invoice.tax && !invoice.taxableValue ? [[`Tax (${invoice.taxPercent}%)`, moneyP(settings, invoice.tax)]] : []),
    ['Grand Total', moneyP(settings, invoice.grandTotal)],
    ['Paid', moneyP(settings, invoice.paidAmount)],
    ['Due', moneyP(settings, invoice.dueAmount)],
  ];
  totals.forEach(([k, v]) => {
    const bold = k === 'Grand Total' || k === 'Due';
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(INK);
    doc.text(k, 360, y, { width: 100, align: 'right' });
    doc.text(v, 465, y, { width: 80, align: 'right' });
    y += bold ? 18 : 15;
  });

  // Payment history.
  if (payments.length) {
    y += 10;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Payments', 50, y);
    y += 16;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    payments.forEach((pay) => {
      if (y > 760) { doc.addPage(); y = 60; }
      const isRefund = pay.type === 'REFUND';
      const amt = `${isRefund ? '− ' : ''}${moneyP(settings, pay.amount)}`;
      doc.fillColor(isRefund ? '#b91c1c' : MUTED);
      doc.text(`${fmtDate(pay.createdAt)}  ·  ${pay.receiptNo || ''}  ·  ${isRefund ? 'REFUND' : pay.method}  ·  ${amt}`, 50, y);
      y += 13;
    });
    doc.fillColor(MUTED);
  }

  // Footer.
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED)
    .text(settings?.invoiceFooter || '', 50, 790, { width: 495, align: 'center' });

  doc.end();
}

// ---------------------------------------------------------------------------
// PRESCRIPTION (from an OPD visit)
// ---------------------------------------------------------------------------
export async function generatePrescriptionPdf(res, { visit, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${visit.visitNo || 'prescription'}.pdf`);

  let y = await drawHeader(doc, settings);
  y = drawTitle(doc, 'PRESCRIPTION', y);

  const p = visit.patient || {};
  const d = visit.doctor || {};
  const patientName = [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';
  const doctorName = `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(' ')}`.trim();
  const age = p.dateOfBirth ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / 3.15576e10) : null;

  y = drawInfoGrid(doc, [
    ['Visit No', visit.visitNo],
    ['Date', fmtDate(visit.visitDate)],
    ['Patient', patientName],
    ['UHID', p.uhid],
    ['Age / Sex', [age != null ? `${age}y` : '', p.gender].filter(Boolean).join(' / ')],
    ['Doctor', `${doctorName}${d.specialization ? ` (${d.specialization})` : ''}`],
  ], y);

  // Vitals + clinical summary.
  const v = visit.vitals || {};
  const vitals = [
    v.bp ? `BP ${v.bp}` : '', v.pulse ? `Pulse ${v.pulse}` : '',
    v.temperature ? `Temp ${v.temperature}°F` : '', v.spo2 ? `SpO2 ${v.spo2}%` : '',
    v.weight ? `Wt ${v.weight}kg` : '',
  ].filter(Boolean).join('   ');
  if (vitals) { doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(`Vitals:  ${vitals}`, 50, y); y += 16; }
  if (p.allergies) { doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text(`Allergies:  ${p.allergies}`, 50, y); y += 16; }

  const block = (label, text) => {
    if (!text) return;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text(label, 50, y); y += 14;
    doc.font('Helvetica').fillColor(INK).text(text, 50, y, { width: 495 });
    y = doc.y + 8;
  };
  block('Symptoms', visit.symptoms);
  block('Diagnosis', visit.diagnosis);

  // Rx table.
  y += 4;
  doc.fontSize(13).font('Helvetica-Bold').fillColor(INK).text('Rx', 50, y); y += 20;
  const rx = visit.prescription || [];
  if (!rx.length) {
    doc.fontSize(9).font('Helvetica-Oblique').fillColor(MUTED).text('No medicines prescribed.', 50, y);
    y += 16;
  } else {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(INK);
    doc.text('Medicine', 50, y);
    doc.text('Dosage', 220, y);
    doc.text('Frequency', 300, y);
    doc.text('Duration', 390, y);
    doc.text('Route', 470, y);
    y += 13;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke(); y += 6;
    doc.font('Helvetica').fillColor(INK);
    rx.forEach((m, i) => {
      if (y > 730) { doc.addPage(); y = 60; }
      doc.text(`${i + 1}. ${m.medicine}`, 50, y, { width: 165 });
      doc.text(m.dosage || '—', 220, y, { width: 75 });
      doc.text(m.frequency || '—', 300, y, { width: 85 });
      doc.text(m.duration || '—', 390, y, { width: 75 });
      doc.text(m.route || 'ORAL', 470, y, { width: 75 });
      let rowH = 16;
      if (m.instructions) {
        doc.fontSize(8).fillColor(MUTED).text(`   ${m.instructions}`, 50, y + 12, { width: 400 });
        rowH = 28;
        doc.fontSize(9).fillColor(INK);
      }
      y += rowH;
    });
  }

  if (visit.followUpDate) {
    y += 10;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text(`Follow-up: ${fmtDate(visit.followUpDate)}`, 50, y);
  }

  // Signature line.
  doc.fontSize(9).font('Helvetica').fillColor(MUTED)
    .text('_______________________', 400, 740)
    .text(doctorName, 400, 756, { width: 145 })
    .text('Signature', 400, 770);

  doc.end();
}

// ---------------------------------------------------------------------------
// DISCHARGE SUMMARY (from an IPD admission)
// ---------------------------------------------------------------------------
export async function generateDischargeSummaryPdf(res, { admission, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${admission.admissionNo || 'discharge'}.pdf`);

  let y = await drawHeader(doc, settings);
  y = drawTitle(doc, 'DISCHARGE SUMMARY', y);

  const p = admission.patient || {};
  const d = admission.admittingDoctor || {};
  const patientName = [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';
  const age = p.dateOfBirth ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / 3.15576e10) : null;

  y = drawInfoGrid(doc, [
    ['Admission No', admission.admissionNo],
    ['UHID', p.uhid],
    ['Patient', patientName],
    ['Age / Sex', [age != null ? `${age}y` : '', p.gender].filter(Boolean).join(' / ')],
    ['Admitted', fmtDate(admission.admissionDate)],
    ['Discharged', fmtDate(admission.dischargeDate)],
    ['Ward / Bed', `${admission.ward?.name || '—'} / ${admission.bed?.bedNo || '—'}`],
    ['Consultant', `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(' ')}`],
    ['Length of stay', `${admission.lengthOfStayDays ?? '—'} day(s)`],
    ['ICD-10', admission.icdCode || '—'],
  ], y);

  const block = (label, text) => {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text(label, 50, y); y += 14;
    doc.font('Helvetica').fillColor(INK).text(text || '—', 50, y, { width: 495 });
    y = doc.y + 10;
  };
  block('Reason for admission', admission.reason);
  block('Diagnosis', admission.diagnosis);
  block('Discharge summary & advice', admission.dischargeSummary);

  if ((admission.nursingNotes || []).length) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text('Nursing notes', 50, y); y += 14;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    admission.nursingNotes.slice(-6).forEach((n) => {
      if (y > 740) { doc.addPage(); y = 60; }
      doc.text(`• ${fmtDate(n.at)} — ${n.note}`, 50, y, { width: 495 });
      y = doc.y + 4;
    });
  }

  doc.fontSize(9).font('Helvetica').fillColor(MUTED)
    .text('_______________________', 380, 760)
    .text(`Dr. ${[d.firstName, d.lastName].filter(Boolean).join(' ')}`, 380, 776, { width: 165 });

  doc.end();
}

// ---------------------------------------------------------------------------
// LAB REPORT (from a Lab order)
// ---------------------------------------------------------------------------
export async function generateLabReportPdf(res, { order, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${order.orderNo || 'lab-report'}.pdf`);

  let y = await drawHeader(doc, settings);
  y = drawTitle(doc, 'LABORATORY REPORT', y);

  const p = order.patient || {};
  const d = order.doctor || {};
  const patientName = [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';
  const age = p.dateOfBirth ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / 3.15576e10) : null;

  y = drawInfoGrid(doc, [
    ['Order No', order.orderNo],
    ['Date', fmtDate(order.createdAt)],
    ['Patient', patientName],
    ['UHID', p.uhid],
    ['Age / Sex', [age != null ? `${age}y` : '', p.gender].filter(Boolean).join(' / ')],
    ['Referred by', d.firstName ? `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(' ')}` : '—'],
  ], y);

  // Results table.
  y += 6;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(INK);
  doc.text('Test', 50, y);
  doc.text('Result', 260, y);
  doc.text('Unit', 340, y);
  doc.text('Reference', 400, y);
  doc.text('Flag', 500, y);
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 6;

  const ABNORMAL_COLOR = '#b91c1c';
  (order.items || []).forEach((it) => {
    if (y > 720) { doc.addPage(); y = 60; }
    const abnormal = it.flag && it.flag !== 'NORMAL';
    doc.font('Helvetica').fillColor(INK).text(it.name, 50, y, { width: 200 });
    doc.font(abnormal ? 'Helvetica-Bold' : 'Helvetica').fillColor(abnormal ? ABNORMAL_COLOR : INK).text(it.result || '—', 260, y, { width: 70 });
    doc.font('Helvetica').fillColor(MUTED).text(it.unit || '—', 340, y, { width: 55 });
    doc.text(it.referenceRange || '—', 400, y, { width: 95 });
    doc.fillColor(abnormal ? ABNORMAL_COLOR : MUTED).text(it.flag || '', 500, y, { width: 45 });
    y += 16;
  });

  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 14;

  if (order.notes) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text('Notes', 50, y); y += 14;
    doc.font('Helvetica').fillColor(INK).text(order.notes, 50, y, { width: 495 });
    y = doc.y + 10;
  }

  doc.fontSize(9).font('Helvetica').fillColor(MUTED)
    .text(order.verifiedBy?.name ? `Verified by ${order.verifiedBy.name} on ${fmtDate(order.verifiedAt)}` : 'Pending verification', 50, 760)
    .text('_______________________', 380, 740)
    .text('Authorized Signatory', 380, 756);

  doc.end();
}

// ---------------------------------------------------------------------------
// RADIOLOGY REPORT (from a Radiology order)
// ---------------------------------------------------------------------------
export async function generateRadiologyReportPdf(res, { order, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${order.orderNo || 'radiology-report'}.pdf`);

  let y = await drawHeader(doc, settings);
  y = drawTitle(doc, 'RADIOLOGY REPORT', y);

  const p = order.patient || {};
  const d = order.doctor || {};
  const patientName = [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';
  const age = p.dateOfBirth ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / 3.15576e10) : null;

  y = drawInfoGrid(doc, [
    ['Order No', order.orderNo],
    ['Date', fmtDate(order.createdAt)],
    ['Patient', patientName],
    ['UHID', p.uhid],
    ['Age / Sex', [age != null ? `${age}y` : '', p.gender].filter(Boolean).join(' / ')],
    ['Referred by', d.firstName ? `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(' ')}` : '—'],
    ['Investigation', `${order.testName}${order.modality ? ` (${order.modality})` : ''}`],
  ], y);

  y += 6;
  const block = (label, text) => {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text(label, 50, y); y += 14;
    doc.font('Helvetica').fillColor(INK).text(text || '—', 50, y, { width: 495 });
    y = doc.y + 12;
  };
  block('Findings', order.findings);
  block('Impression', order.impression);

  if (order.notes) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text('Clinical Notes', 50, y); y += 14;
    doc.font('Helvetica').fillColor(INK).text(order.notes, 50, y, { width: 495 });
    y = doc.y + 10;
  }

  doc.fontSize(9).font('Helvetica').fillColor(MUTED)
    .text(order.reportedBy?.name ? `Reported by ${order.reportedBy.name} on ${fmtDate(order.reportedAt)}` : 'Pending report', 50, 760)
    .text('_______________________', 380, 740)
    .text('Authorized Signatory', 380, 756);

  doc.end();
}

// ---------------------------------------------------------------------------
// HOSPITAL SUMMARY REPORT
// ---------------------------------------------------------------------------
export async function generateReportSummaryPdf(res, { summary, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const rangeLabel = summary.range?.from || summary.range?.to
    ? `${summary.range.from || 'start'} to ${summary.range.to || 'today'}`
    : 'all-time';
  streamToResponse(doc, res, `hms-summary-${rangeLabel}.pdf`);

  let y = await drawHeader(doc, settings);
  y = drawTitle(doc, 'HOSPITAL SUMMARY REPORT', y);
  doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(`Range: ${rangeLabel}`, 50, y);
  y += 20;

  const section = (title) => {
    if (y > 700) { doc.addPage(); y = 60; }
    doc.fontSize(11).font('Helvetica-Bold').fillColor(INK).text(title, 50, y);
    y += 6;
    doc.moveTo(50, y + 10).lineTo(545, y + 10).strokeColor(LINE).stroke();
    y += 18;
  };
  const kv = (rows) => { y = drawInfoGrid(doc, rows, y); y += 6; };

  const t = summary.totals;
  section('Clinical Activity');
  kv([
    ['Patients', t.patients], ['OPD Visits', t.opdVisits],
    ['IPD Admissions', t.ipdAdmissions], ['Current Admissions', t.currentAdmissions],
    ['Lab Orders', t.labOrders], ['Radiology Orders', t.radOrders],
    ['Active Doctors', t.activeDoctors], ['Bed Occupancy', `${summary.beds.occupancyRate}%`],
  ]);

  section('Revenue');
  kv([
    ['Billed', money(settings, summary.revenue.billed)], ['Collected', money(settings, summary.revenue.collected)],
    ['Due', money(settings, summary.revenue.due)], ['Invoices', summary.revenue.invoices],
  ]);

  section('Operations');
  kv([
    ['Active Medicines', summary.pharmacy.activeMedicines], ['Low Stock (Pharmacy)', summary.pharmacy.lowStock],
    ['Dispense Revenue', money(settings, summary.pharmacy.dispenseRevenue)],
    ['Low Stock (Inventory)', summary.inventory.lowStock], ['Open Purchase Orders', summary.inventory.openPOs],
    ['Ambulance Trips', summary.ambulance.trips], ['Ambulance Revenue', money(settings, summary.ambulance.tripRevenue)],
  ]);

  section('Human Resources');
  kv([
    ['Active Staff', summary.hr.activeStaff], ['Pending Leaves', summary.hr.pendingLeaves],
    ['Payslips', summary.hr.payslips], ['Payroll Cost', money(settings, summary.hr.payrollCost)],
    ['Payroll Paid', money(settings, summary.hr.payrollPaid)],
  ]);

  for (const [group, rows] of Object.entries(summary.breakdowns)) {
    if (!rows.length) continue;
    section(`${group.charAt(0).toUpperCase()}${group.slice(1)} by Status`);
    kv(rows.map((r) => [r.status, r.count]));
  }

  doc.end();
}

// ---------------------------------------------------------------------------
// PHARMACY DISPENSE RECEIPT
// ---------------------------------------------------------------------------
export async function generateDispenseReceiptPdf(res, { dispense, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${dispense.dispenseNo || 'dispense-receipt'}.pdf`);

  let y = await drawHeader(doc, settings);
  y = drawTitle(doc, 'PHARMACY RECEIPT', y);

  const p = dispense.patient || {};
  const d = dispense.doctor || {};
  const patientName = p.firstName ? [p.firstName, p.lastName].filter(Boolean).join(' ') : 'Walk-in';

  y = drawInfoGrid(doc, [
    ['Dispense No', dispense.dispenseNo],
    ['Date', fmtDate(dispense.createdAt)],
    ['Patient', patientName],
    ['UHID', p.uhid || '—'],
    ['Prescribed by', d.firstName ? `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(' ')}` : '—'],
    ['Dispensed by', dispense.dispensedBy?.name || '—'],
  ], y);

  y += 6;
  const cols = { desc: 50, qty: 350, rate: 410, amt: 470 };
  doc.fontSize(9).font('Helvetica-Bold').fillColor(INK);
  doc.text('Medicine', cols.desc, y);
  doc.text('Qty', cols.qty, y, { width: 40, align: 'right' });
  doc.text('Rate', cols.rate, y, { width: 60, align: 'right' });
  doc.text('Amount', cols.amt, y, { width: 75, align: 'right' });
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 6;

  doc.font('Helvetica').fillColor(INK);
  (dispense.items || []).forEach((it) => {
    if (y > 720) { doc.addPage(); y = 60; }
    doc.text(it.name, cols.desc, y, { width: 290 });
    doc.text(String(it.quantity), cols.qty, y, { width: 40, align: 'right' });
    doc.text(money(settings, it.sellingPrice), cols.rate, y, { width: 60, align: 'right' });
    doc.text(money(settings, it.lineTotal), cols.amt, y, { width: 75, align: 'right' });
    y += 16;
  });

  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 10;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Total', 360, y, { width: 100, align: 'right' });
  doc.text(money(settings, dispense.total), 465, y, { width: 80, align: 'right' });

  doc.end();
}

// ---------------------------------------------------------------------------
// PURCHASE ORDER
// ---------------------------------------------------------------------------
export async function generatePurchaseOrderPdf(res, { po, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${po.poNo || 'purchase-order'}.pdf`);

  let y = await drawHeader(doc, settings);
  y = drawTitle(doc, 'PURCHASE ORDER', y);

  const v = po.vendor || {};
  y = drawInfoGrid(doc, [
    ['PO No', po.poNo],
    ['Date', fmtDate(po.orderedAt || po.createdAt)],
    ['Vendor', v.name],
    ['Vendor Code', v.code],
    ['Status', po.status],
  ], y);

  y += 6;
  const cols = { desc: 50, qty: 320, rate: 400, amt: 470 };
  doc.fontSize(9).font('Helvetica-Bold').fillColor(INK);
  doc.text('Item', cols.desc, y);
  doc.text('Qty', cols.qty, y, { width: 50, align: 'right' });
  doc.text('Rate', cols.rate, y, { width: 60, align: 'right' });
  doc.text('Amount', cols.amt, y, { width: 75, align: 'right' });
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 6;

  doc.font('Helvetica').fillColor(INK);
  (po.items || []).forEach((it) => {
    if (y > 720) { doc.addPage(); y = 60; }
    doc.text(it.name, cols.desc, y, { width: 260 });
    doc.text(String(it.quantity), cols.qty, y, { width: 50, align: 'right' });
    doc.text(money(settings, it.unitPrice), cols.rate, y, { width: 60, align: 'right' });
    doc.text(money(settings, it.lineTotal), cols.amt, y, { width: 75, align: 'right' });
    y += 16;
  });

  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 10;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Total', 360, y, { width: 100, align: 'right' });
  doc.text(money(settings, po.total), 465, y, { width: 80, align: 'right' });

  if (po.notes) {
    y += 30;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text('Notes', 50, y); y += 14;
    doc.font('Helvetica').fillColor(INK).text(po.notes, 50, y, { width: 495 });
  }

  doc.end();
}

// ---------------------------------------------------------------------------
// AMBULANCE TRIP RECEIPT
// ---------------------------------------------------------------------------
export async function generateAmbulanceReceiptPdf(res, { trip, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${trip.tripNo || 'ambulance-receipt'}.pdf`);

  let y = await drawHeader(doc, settings);
  y = drawTitle(doc, 'AMBULANCE TRIP RECEIPT', y);

  const p = trip.patient || {};
  const patientName = p.firstName ? [p.firstName, p.lastName].filter(Boolean).join(' ') : (trip.patientName || '—');

  y = drawInfoGrid(doc, [
    ['Trip No', trip.tripNo],
    ['Date', fmtDate(trip.startedAt || trip.createdAt)],
    ['Patient', patientName],
    ['UHID', p.uhid || '—'],
    ['Vehicle', trip.ambulance?.vehicleNo],
    ['Status', trip.status],
    ['Pickup', trip.pickup || '—'],
    ['Drop', trip.drop || '—'],
    ['Purpose', trip.purpose || '—'],
  ], y);

  y += 10;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Charges', 360, y, { width: 100, align: 'right' });
  doc.text(money(settings, trip.charges), 465, y, { width: 80, align: 'right' });

  doc.end();
}

// ---------------------------------------------------------------------------
// PAYSLIP
// ---------------------------------------------------------------------------
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function generatePayslipPdf(res, { payslip, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const period = `${MONTH_NAMES[payslip.month - 1]}-${payslip.year}`;
  streamToResponse(doc, res, `${payslip.payslipNo || 'payslip'}.pdf`);

  let y = await drawHeader(doc, settings);
  y = drawTitle(doc, `PAYSLIP · ${period}`, y);

  const e = payslip.employee || {};
  y = drawInfoGrid(doc, [
    ['Payslip No', payslip.payslipNo],
    ['Employee', e.name],
    ['Employee Code', e.employeeCode],
    ['Designation', e.designation || '—'],
    ['Working Days', payslip.workingDays],
    ['Present / Absent', `${payslip.presentDays} / ${payslip.absentDays}`],
  ], y);

  y += 6;
  const rows = [
    ['Basic Salary', moneyP(settings, payslip.basicSalary)],
    ['Half Days', String(payslip.halfDays)],
    ['Leave Days (paid)', String(payslip.leaveDays)],
    ['Gross Pay', moneyP(settings, payslip.grossPay)],
    [payslip.adjustment >= 0 ? 'Adjustment (+)' : 'Adjustment (-)', moneyP(settings, Math.abs(payslip.adjustment))],
  ];
  doc.fontSize(9).font('Helvetica');
  rows.forEach(([k, v]) => {
    doc.fillColor(MUTED).text(k, 50, y);
    doc.fillColor(INK).text(v, 400, y, { width: 145, align: 'right' });
    y += 16;
  });
  if (payslip.adjustmentNote) {
    doc.fontSize(8).fillColor(MUTED).text(`Note: ${payslip.adjustmentNote}`, 50, y, { width: 495 });
    y = doc.y + 8;
  }

  y += 6;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 12;
  doc.fontSize(12).font('Helvetica-Bold').fillColor(INK).text('Net Pay', 50, y);
  doc.text(moneyP(settings, payslip.netPay), 400, y, { width: 145, align: 'right' });
  y += 24;

  doc.fontSize(8).font('Helvetica').fillColor(MUTED)
    .text(payslip.status === 'PAID' ? `Paid on ${fmtDate(payslip.paidAt)}` : 'Payment pending', 50, y);

  doc.end();
}

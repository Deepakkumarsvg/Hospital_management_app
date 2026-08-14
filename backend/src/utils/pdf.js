import PDFDocument from 'pdfkit';

// Shared black & white document styling — mirrors the app's monochrome theme.
const INK = '#111111';
const MUTED = '#666666';
const LINE = '#cccccc';

function money(settings, n) {
  const cur = settings?.currency || '₹';
  return `${cur}${Number(n || 0).toFixed(2)}`;
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

// Draw the hospital letterhead; returns the y just below it.
function drawHeader(doc, settings) {
  const s = settings || {};
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
export function generateInvoicePdf(res, { invoice, payments = [], settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${invoice.invoiceNo || 'invoice'}.pdf`);

  let y = drawHeader(doc, settings);
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
  ], y);

  // Items table.
  y += 6;
  const cols = { desc: 50, qty: 330, rate: 390, amt: 470 };
  doc.fontSize(9).font('Helvetica-Bold').fillColor(INK);
  doc.text('Description', cols.desc, y);
  doc.text('Qty', cols.qty, y, { width: 40, align: 'right' });
  doc.text('Rate', cols.rate, y, { width: 60, align: 'right' });
  doc.text('Amount', cols.amt, y, { width: 75, align: 'right' });
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 6;

  doc.font('Helvetica').fillColor(INK);
  (invoice.items || []).forEach((it) => {
    if (y > 720) { doc.addPage(); y = 60; }
    const label = it.category && it.category !== 'OTHER' ? `${it.description}  (${it.category})` : it.description;
    doc.text(label, cols.desc, y, { width: 270 });
    doc.text(String(it.quantity), cols.qty, y, { width: 40, align: 'right' });
    doc.text(money(settings, it.unitPrice), cols.rate, y, { width: 60, align: 'right' });
    doc.text(money(settings, it.amount), cols.amt, y, { width: 75, align: 'right' });
    y += Math.max(16, doc.heightOfString(label, { width: 270 }));
  });

  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 8;

  // Totals block (right aligned).
  const totals = [
    ['Subtotal', money(settings, invoice.subtotal)],
    ...(invoice.discount ? [['Discount', `- ${money(settings, invoice.discount)}`]] : []),
    ...(invoice.tax ? [[`Tax (${invoice.taxPercent}%)`, money(settings, invoice.tax)]] : []),
    ['Grand Total', money(settings, invoice.grandTotal)],
    ['Paid', money(settings, invoice.paidAmount)],
    ['Due', money(settings, invoice.dueAmount)],
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
      doc.text(`${fmtDate(pay.createdAt)}  ·  ${pay.receiptNo || ''}  ·  ${pay.method}  ·  ${money(settings, pay.amount)}`, 50, y);
      y += 13;
    });
  }

  // Footer.
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED)
    .text(settings?.invoiceFooter || '', 50, 790, { width: 495, align: 'center' });

  doc.end();
}

// ---------------------------------------------------------------------------
// PRESCRIPTION (from an OPD visit)
// ---------------------------------------------------------------------------
export function generatePrescriptionPdf(res, { visit, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${visit.visitNo || 'prescription'}.pdf`);

  let y = drawHeader(doc, settings);
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
export function generateDischargeSummaryPdf(res, { admission, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  streamToResponse(doc, res, `${admission.admissionNo || 'discharge'}.pdf`);

  let y = drawHeader(doc, settings);
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

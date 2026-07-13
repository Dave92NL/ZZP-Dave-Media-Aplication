'use strict';

const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/db');

const CATEGORIES = [
  'YouTube/Archiwum Zła',
  'Edycja wideo',
  'Research/Scenariusz',
  'Administracja ZZP',
  'Marketing/Social Media',
  'IT/Techniczne',
  'Inne'
];

function getAll(filters = {}) {
  const db = getDb();
  let where = [];
  const params = [];

  if (filters.year) { where.push("strftime('%Y', t.date) = ?"); params.push(String(filters.year)); }
  if (filters.month) { where.push("strftime('%m', t.date) = ?"); params.push(String(filters.month).padStart(2, '0')); }
  if (filters.project_id) { where.push('t.project_id = ?'); params.push(filters.project_id); }
  if (filters.category) { where.push('t.category = ?'); params.push(filters.category); }
  if (filters.date_from) { where.push('t.date >= ?'); params.push(filters.date_from); }
  if (filters.date_to) { where.push('t.date <= ?'); params.push(filters.date_to); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = filters.limit ? `LIMIT ${parseInt(filters.limit)}` : '';

  return db.prepare(`
    SELECT t.*, p.name as project_name,
           COALESCE(c.company_name, c.name) as client_name
    FROM time_entries t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    ${whereStr}
    ORDER BY t.date DESC, t.id DESC
    ${limit}
  `).all(...params);
}

function create(data) {
  const db = getDb();

  if (!data.date) throw new Error('Data jest wymagana.');
  if (!data.category) throw new Error('Kategoria jest wymagana.');

  let durationMinutes = Number(data.duration_minutes) || 0;

  if (data.start_time && data.end_time && !durationMinutes) {
    const start = new Date(data.start_time);
    const end = new Date(data.end_time);
    durationMinutes = Math.round((end - start) / 60000);
  }

  const result = db.prepare(`
    INSERT INTO time_entries
      (project_id, invoice_id, category, description, start_time, end_time,
       duration_minutes, is_pomodoro, is_billable, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.project_id || null,
    data.invoice_id || null,
    data.category,
    data.description || '',
    data.start_time || null,
    data.end_time || null,
    durationMinutes,
    data.is_pomodoro ? 1 : 0,
    data.is_billable !== false ? 1 : 0,
    data.date
  );

  return { id: result.lastInsertRowid };
}

function update(id, data) {
  const db = getDb();
  const allowed = ['project_id', 'category', 'description', 'start_time', 'end_time', 'duration_minutes', 'is_billable', 'date'];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  if (!fields.length) return false;
  values.push(id);
  db.prepare(`UPDATE time_entries SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { success: true };
}

function delete_(id, opts = {}) {
  const db = getDb();
  // Nagrobek do propagacji usunięcia w chmurze — bez niego pull „wskrzesza" wpis.
  if (!opts.fromCloudSync) {
    const row = db.prepare('SELECT cloud_id FROM time_entries WHERE id = ?').get(id);
    if (row && row.cloud_id) {
      try { db.prepare('INSERT INTO sync_deletions (table_name, cloud_id) VALUES (?, ?)').run('time_entries', row.cloud_id); }
      catch { /* tabela nagrobków sprzed migracji v8 */ }
    }
  }
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
  return { success: true };
}

function getSummary(filters = {}) {
  const db = getDb();
  let where = [];
  const params = [];

  if (filters.year) { where.push("strftime('%Y', date) = ?"); params.push(String(filters.year)); }
  if (filters.month) { where.push("strftime('%m', date) = ?"); params.push(String(filters.month).padStart(2, '0')); }
  if (filters.project_id) { where.push('project_id = ?'); params.push(filters.project_id); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`
    SELECT
      SUM(duration_minutes) as total_minutes,
      SUM(CASE WHEN is_billable = 1 THEN duration_minutes ELSE 0 END) as billable_minutes,
      COUNT(*) as entry_count
    FROM time_entries ${whereStr}
  `).get(...params);

  const byCategory = db.prepare(`
    SELECT category, SUM(duration_minutes) as minutes
    FROM time_entries ${whereStr}
    GROUP BY category
    ORDER BY minutes DESC
  `).all(...params);

  return { ...total, byCategory };
}

function getYearTotal(year) {
  const db = getDb();
  const row = db.prepare(`
    SELECT SUM(duration_minutes) as total_minutes
    FROM time_entries
    WHERE strftime('%Y', date) = ?
  `).get(String(year));

  const totalMinutes = row?.total_minutes || 0;
  const totalHours = totalMinutes / 60;
  const urencriteriumProgress = Math.min(100, (totalHours / 1225) * 100);

  return {
    total_minutes: totalMinutes,
    total_hours: totalHours,
    urencriterium_hours: 1225,
    urencriterium_progress: urencriteriumProgress,
    hours_remaining: Math.max(0, 1225 - totalHours)
  };
}

// ── PDF export ─────────────────────────────────────────────────
async function exportPDF(filters, win) {
  const PDFDocument = require('pdfkit');
  const { dialog } = require('electron');
  const settings = require('./settings');

  const entries = getAll(filters);
  if (!entries.length) throw new Error('Brak wpisów do eksportu dla wybranych filtrów.');

  const profile = settings.getProfile();
  const summary = getSummary(filters);

  const periodLabel = filters.year
    ? (filters.month ? `${String(filters.month).padStart(2,'0')}/${filters.year}` : String(filters.year))
    : 'Cały okres';

  const defaultName = `Godzinowki_${periodLabel.replace('/','-')}.pdf`;

  const saveResult = await dialog.showSaveDialog(win, {
    title: 'Zapisz raport godzin',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (saveResult.canceled) return null;

  const outputPath = saveResult.filePath;
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const stream = fs.createWriteStream(outputPath);

  await new Promise((resolve, reject) => {
    doc.pipe(stream);
    _renderTimePDF(doc, entries, summary, profile, periodLabel, filters);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return outputPath;
}

function _fmtDateNL(s) {
  if (!s) return '';
  const [y,m,d] = s.split('-');
  return `${d}-${m}-${y}`;
}

function _fmtDur(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2,'0')}m`;
}

function _renderTimePDF(doc, entries, summary, profile, periodLabel, filters) {
  const M = 40, PW = 595, PH = 842, W = PW - M * 2;
  const DARK   = '#1A1A2A';
  const GRAY   = '#555555';
  const LGRAY  = '#888888';
  const BORDER = '#CCCCCC';
  const TBLHDR = '#2D3748';
  const ACC    = '#3182CE';

  // ── HEADER ───────────────────────────────────────────────────
  doc.rect(0, 0, PW, 70).fillColor(TBLHDR).fill();
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#FFFFFF')
    .text('Urenregistratie', M, 22, { lineBreak: false });
  doc.font('Helvetica').fontSize(11).fillColor('#AAAACC')
    .text('Tijdregistratie rapport — ' + periodLabel, M, 48, { lineBreak: false });

  // Company name top-right
  if (profile.name) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
      .text(profile.name, M, 22, { width: W, align: 'right', lineBreak: false });
  }

  // ── SUMMARY BOXES ────────────────────────────────────────────
  const BX = M, BY = 85, BH = 54, BW = Math.floor((W - 10) / 3);
  const totalHours = (summary.total_minutes || 0) / 60;
  const billableHours = (summary.billable_minutes || 0) / 60;
  const rate = profile.default_hourly_rate || 0;
  const billableAmount = billableHours * rate;

  const boxes = [
    { label: 'Totaal uren', value: totalHours.toFixed(1) + ' u',   sub: _fmtDur(summary.total_minutes || 0) },
    { label: 'Factureerbare uren', value: billableHours.toFixed(1) + ' u', sub: _fmtDur(summary.billable_minutes || 0) },
    { label: 'Bedrag (€/u ' + rate + ')', value: '€ ' + billableAmount.toLocaleString('nl-NL', {minimumFractionDigits:2,maximumFractionDigits:2}), sub: rate + ' €/u' }
  ];

  for (let i = 0; i < 3; i++) {
    const bx = BX + i * (BW + 5);
    doc.rect(bx, BY, BW, BH).fillColor('#F7FAFC').fill();
    doc.rect(bx, BY, BW, BH).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(9).fillColor(LGRAY)
      .text(boxes[i].label, bx + 8, BY + 8, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(DARK)
      .text(boxes[i].value, bx + 8, BY + 22, { lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
      .text(boxes[i].sub, bx + 8, BY + 42, { lineBreak: false });
  }

  // ── TABLE ─────────────────────────────────────────────────────
  const TY = BY + BH + 16;
  const CD = 70, CC = 130, CP = 220, CH = 60, CT = W - CD - CC - CP - CH;

  // Table header
  doc.rect(M, TY, W, 20).fillColor(TBLHDR).fill();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF');
  doc.text('Datum',       M + 5,     TY + 6, { width: CD - 5, lineBreak: false });
  doc.text('Categorie',   M + CD,    TY + 6, { width: CC - 5, lineBreak: false });
  doc.text('Omschrijving',M + CD+CC, TY + 6, { width: CP - 5, lineBreak: false });
  doc.text('Uren',        M + CD+CC+CP, TY + 6, { width: CH,  lineBreak: false });
  doc.text('Fact.',       M + CD+CC+CP+CH, TY + 6, { width: CT - 5, lineBreak: false });

  let iy = TY + 20;
  const ROW_H = 18;
  const maxY = PH - 80; // leave footer space

  for (let idx = 0; idx < entries.length; idx++) {
    if (iy + ROW_H > maxY) {
      doc.addPage();
      iy = 40;
      // Repeat header
      doc.rect(M, iy, W, 20).fillColor(TBLHDR).fill();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF');
      doc.text('Datum',       M + 5,     iy + 6, { width: CD - 5, lineBreak: false });
      doc.text('Categorie',   M + CD,    iy + 6, { width: CC - 5, lineBreak: false });
      doc.text('Omschrijving',M + CD+CC, iy + 6, { width: CP - 5, lineBreak: false });
      doc.text('Uren',        M + CD+CC+CP, iy + 6, { width: CH,  lineBreak: false });
      doc.text('Fact.',       M + CD+CC+CP+CH, iy + 6, { width: CT - 5, lineBreak: false });
      iy += 20;
    }

    const e = entries[idx];
    if (idx % 2 === 1) doc.rect(M, iy, W, ROW_H).fillColor('#F9F9F9').fill();
    doc.font('Helvetica').fontSize(8.5).fillColor(DARK);
    doc.text(_fmtDateNL(e.date),         M + 5,     iy + 5, { width: CD - 5, lineBreak: false });
    doc.text(e.category || '',           M + CD,    iy + 5, { width: CC - 5, lineBreak: false });
    doc.text(e.description || '',        M + CD+CC, iy + 5, { width: CP - 5, lineBreak: false });
    doc.text(_fmtDur(e.duration_minutes),M + CD+CC+CP, iy + 5, { width: CH - 5, lineBreak: false });
    doc.text(e.is_billable ? '✓' : '–', M + CD+CC+CP+CH, iy + 5, { width: CT - 5, lineBreak: false });
    iy += ROW_H;
  }

  // Total row
  doc.moveTo(M, iy).lineTo(PW - M, iy).strokeColor(BORDER).lineWidth(0.5).stroke();
  iy += 6;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK)
    .text('Totaal:', M + 5, iy, { lineBreak: false });
  doc.text(_fmtDur(summary.total_minutes || 0), M + CD+CC+CP, iy, { width: CH - 5, lineBreak: false });

  // ── FOOTER ────────────────────────────────────────────────────
  const footY = PH - 50;
  doc.moveTo(M, footY).lineTo(PW - M, footY).strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
    .text(`Gegenereerd op ${new Date().toLocaleDateString('nl-NL')} — ${profile.name || ''}`, M, footY + 8, { width: W, align: 'left', lineBreak: false });
  doc.text('Pagina 1', M, footY + 8, { width: W, align: 'right', lineBreak: false });
}

module.exports = { getAll, create, update, delete: delete_, getSummary, getYearTotal, exportPDF, CATEGORIES };

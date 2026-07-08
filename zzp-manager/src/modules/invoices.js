'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { getDb } = require('../database/db');

// Clients whose paid invoices should be classified as AdSense/YouTube income
const ADSENSE_CLIENT_NAMES = ['google ireland limited'];

// One-time lazy fix flag
let _adSenseFixDone = false;

/**
 * Returns 'AdSense' if the invoice belongs to a Google/AdSense client,
 * otherwise returns 'Invoice'.
 */
function _sourceForClient(db, clientId) {
  if (!clientId) return 'Invoice';
  const client = db.prepare('SELECT name, company_name FROM clients WHERE id = ?').get(clientId);
  if (!client) return 'Invoice';
  const nameLC = (client.company_name || client.name || '').toLowerCase().trim();
  return ADSENSE_CLIENT_NAMES.some(n => nameLC.includes(n)) ? 'AdSense' : 'Invoice';
}

/**
 * One-time fix: re-classify existing income_entries that were recorded
 * as 'Invoice' but belong to an AdSense client. Called on module load.
 */
function _fixExistingAdSenseEntries(db) {
  try {
    db.prepare(`
      UPDATE income_entries
      SET source = 'AdSense'
      WHERE source = 'Invoice'
        AND invoice_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM invoices i
          JOIN clients c ON i.client_id = c.id
          WHERE i.id = income_entries.invoice_id
            AND LOWER(COALESCE(c.company_name, c.name, '')) LIKE '%google ireland limited%'
        )
    `).run();
  } catch (_) { /* non-critical */ }
}

function getAll(filters = {}) {
  const db = getDb();

  // One-time fix: re-classify income_entries for Google/AdSense clients
  if (!_adSenseFixDone) {
    _adSenseFixDone = true;
    _fixExistingAdSenseEntries(db);
  }

  let where = [];
  const params = [];

  // Auto-mark overdue
  db.prepare(`
    UPDATE invoices SET status = 'overdue'
    WHERE status = 'sent' AND due_date < date('now')
  `).run();

  if (filters.status) { where.push('i.status = ?'); params.push(filters.status); }
  if (filters.client_id) { where.push('i.client_id = ?'); params.push(filters.client_id); }
  if (filters.project_id) { where.push('i.project_id = ?'); params.push(filters.project_id); }
  if (filters.year) { where.push("strftime('%Y', i.issue_date) = ?"); params.push(String(filters.year)); }
  if (filters.month) { where.push("strftime('%m', i.issue_date) = ?"); params.push(String(filters.month).padStart(2, '0')); }
  if (filters.currency) { where.push('i.currency = ?'); params.push(filters.currency); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  return db.prepare(`
    SELECT i.*, c.name as client_name, c.company_name, p.name as project_name
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    LEFT JOIN projects p ON i.project_id = p.id
    ${whereStr}
    ORDER BY i.issue_date DESC, i.id DESC
  `).all(...params);
}

function getById(id) {
  const db = getDb();
  const invoice = db.prepare(`
    SELECT i.*, c.name as client_name, c.company_name, c.address as client_address,
           c.postcode as client_postcode, c.city as client_city, c.country as client_country,
           c.vat_number as client_vat, c.email as client_email,
           p.name as project_name
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    LEFT JOIN projects p ON i.project_id = p.id
    WHERE i.id = ?
  `).get(id);

  if (!invoice) return null;
  invoice.items = getItems(id);
  return invoice;
}

function getItems(invoiceId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id'
  ).all(invoiceId);
}

function getNextNumber() {
  const db = getDb();
  const profile = db.prepare('SELECT invoice_next_number FROM company_profile WHERE id = 1').get();
  const year = new Date().getFullYear();
  const num = String(profile?.invoice_next_number ?? 1).padStart(4, '0');
  return `${year}/${num}`;
}

function create(data) {
  const db = getDb();

  if (!data.issue_date || !data.due_date) throw new Error('Daty wystawienia i terminu są wymagane.');

  const invoiceNumber = data.invoice_number || getNextNumber();

  const exists = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(invoiceNumber);
  if (exists) throw new Error(`Numer faktury ${invoiceNumber} al istnieje.`);

  const subtotal = calculateSubtotal(data.items || []);
  const btwRate = Number(data.btw_rate) || 0;
  const btwAmount = data.btw_reverse_charge ? 0 : subtotal * (btwRate / 100);
  const total = subtotal + btwAmount;
  const exchangeRate = Number(data.exchange_rate) || 1;
  const totalEur = total / exchangeRate;

  const insert = db.prepare(`
    INSERT INTO invoices
      (invoice_number, client_id, project_id, status, issue_date, due_date,
       currency, exchange_rate, subtotal, btw_rate, btw_amount, total, total_eur,
       notes, reference, btw_reverse_charge)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insert.run(
    invoiceNumber,
    data.client_id || null,
    data.project_id || null,
    data.status || 'draft',
    data.issue_date,
    data.due_date,
    data.currency || 'EUR',
    exchangeRate,
    subtotal,
    btwRate,
    btwAmount,
    total,
    totalEur,
    data.notes || '',
    data.reference || '',
    data.btw_reverse_charge ? 1 : 0
  );

  const invoiceId = result.lastInsertRowid;
  saveItems(invoiceId, data.items || []);

  db.prepare('UPDATE company_profile SET invoice_next_number = invoice_next_number + 1 WHERE id = 1').run();

  // If created directly as paid, add income entry immediately
  if ((data.status === 'paid') && total > 0) {
    const paidDate = data.paid_date || data.issue_date;
    const existing = db.prepare('SELECT id FROM income_entries WHERE invoice_id = ?').get(invoiceId);
    if (!existing) {
      const incomeSource = _sourceForClient(db, data.client_id);
      db.prepare(`
        INSERT INTO income_entries (source, description, amount, currency, exchange_rate, amount_eur, date, invoice_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        incomeSource, 'Factuur ' + invoiceNumber,
        total, data.currency || 'EUR', exchangeRate,
        totalEur, paidDate, invoiceId
      );
    }
    // Also set paid_date on the invoice
    db.prepare('UPDATE invoices SET paid_date = ? WHERE id = ?').run(paidDate, invoiceId);
  }

  return { id: invoiceId, invoice_number: invoiceNumber };
}

function update(id, data) {
  const db = getDb();

  const subtotal = calculateSubtotal(data.items || []);
  const btwRate = Number(data.btw_rate) || 0;
  const btwAmount = data.btw_reverse_charge ? 0 : subtotal * (btwRate / 100);
  const total = subtotal + btwAmount;
  const exchangeRate = Number(data.exchange_rate) || 1;
  const totalEur = total / exchangeRate;

  db.prepare(`
    UPDATE invoices SET
      client_id = ?, project_id = ?, status = ?, issue_date = ?, due_date = ?,
      currency = ?, exchange_rate = ?, subtotal = ?, btw_rate = ?, btw_amount = ?,
      total = ?, total_eur = ?, notes = ?, reference = ?, btw_reverse_charge = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.client_id || null, data.project_id || null, data.status || 'draft',
    data.issue_date, data.due_date, data.currency || 'EUR', exchangeRate,
    subtotal, btwRate, btwAmount, total, totalEur,
    data.notes || '', data.reference || '', data.btw_reverse_charge ? 1 : 0,
    id
  );

  if (data.items) {
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
    saveItems(id, data.items);
  }

  // If updated to paid and no income entry exists yet, create one
  if (data.status === 'paid' && total > 0) {
    const existing = db.prepare('SELECT id FROM income_entries WHERE invoice_id = ?').get(id);
    if (!existing) {
      const inv = db.prepare('SELECT invoice_number, currency, paid_date, issue_date FROM invoices WHERE id = ?').get(id);
      const paidDate = inv?.paid_date || inv?.issue_date || new Date().toISOString().split('T')[0];
      const incomeSource = _sourceForClient(db, data.client_id);
      db.prepare(`
        INSERT INTO income_entries (source, description, amount, currency, exchange_rate, amount_eur, date, invoice_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        incomeSource, 'Factuur ' + (inv?.invoice_number || ''),
        total, data.currency || 'EUR', exchangeRate,
        totalEur, paidDate, id
      );
    }
  }

  return { success: true };
}

function delete_(id) {
  const db = getDb();
  db.transaction(() => {
    // Remove linked income entries (FK constraint, no CASCADE)
    db.prepare('DELETE FROM income_entries WHERE invoice_id = ?').run(id);
    // Unlink time entries (don't delete — just detach)
    db.prepare('UPDATE time_entries SET invoice_id = NULL WHERE invoice_id = ?').run(id);
    // invoice_items has ON DELETE CASCADE, handled automatically
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
  })();
  return { success: true };
}

function markPaid(id, paidDate) {
  const db = getDb();
  const date = paidDate || new Date().toISOString().split('T')[0];
  db.prepare(`
    UPDATE invoices SET status = 'paid', paid_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(date, id);

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (invoice) {
    const existing = db.prepare('SELECT id FROM income_entries WHERE invoice_id = ?').get(id);
    if (!existing) {
      const incomeSource = _sourceForClient(db, invoice.client_id);
      db.prepare(`
        INSERT INTO income_entries (source, description, amount, currency, exchange_rate, amount_eur, date, invoice_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        incomeSource, `Factuur ${invoice.invoice_number}`,
        invoice.total, invoice.currency, invoice.exchange_rate,
        invoice.total_eur || invoice.total, date, id
      );
    }
  }

  return { success: true };
}

function duplicate(id) {
  const db = getDb();
  const original = getById(id);
  if (!original) throw new Error('Factuur niet gevonden.');

  const today = new Date().toISOString().split('T')[0];
  const profile = db.prepare('SELECT default_payment_days FROM company_profile WHERE id = 1').get();
  const paymentDays = profile?.default_payment_days || 14;
  const dueDate = new Date(Date.now() + paymentDays * 86400000).toISOString().split('T')[0];

  return create({
    client_id: original.client_id,
    project_id: original.project_id,
    issue_date: today,
    due_date: dueDate,
    currency: original.currency,
    exchange_rate: original.exchange_rate,
    btw_rate: original.btw_rate,
    btw_reverse_charge: original.btw_reverse_charge,
    notes: original.notes,
    items: original.items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      btw_rate: item.btw_rate
    }))
  });
}

function saveItems(invoiceId, items) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price, btw_rate, total, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unit_price) || 0;
    const total = qty * price;
    stmt.run(
      invoiceId,
      item.description || '',
      qty,
      item.unit || 'Stk',
      price,
      Number(item.btw_rate) || 0,
      total,
      i
    );
  }
}

function calculateSubtotal(items) {
  return items.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 1) * (Number(item.unit_price) || 0);
  }, 0);
}

async function exportPDF(id, win) {
  const invoice = getById(id);
  if (!invoice) throw new Error('Factuur niet gevonden.');

  const profile = require('./settings').getProfile();
  const PDFDocument = require('pdfkit');
  const { dialog } = require('electron');

  const invNum = invoice.invoice_number.replace(/\//g, '-');
  const clientName = (invoice.client_name || 'klant').replace(/[^a-zA-Z0-9]/g, '_');
  const defaultName = `Factuur_${invNum}_${clientName}.pdf`;

  const saveResult = await dialog.showSaveDialog(win, {
    title: 'Factuur opslaan als PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (saveResult.canceled) return null;

  const outputPath = saveResult.filePath;
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const stream = fs.createWriteStream(outputPath);

  await new Promise((resolve, reject) => {
    doc.pipe(stream);
    renderInvoicePDF(doc, invoice, profile);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const db = getDb();
  db.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?').run(outputPath, id);

  if (invoice.status === 'draft') {
    db.prepare("UPDATE invoices SET status = 'sent', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  }

  return outputPath;
}

// ── Dutch format helpers ────────────────────────────────────
function formatDateNL(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  } catch { return dateStr; }
}

function fmtAmt(amount) {
  const num = Number(amount) || 0;
  // European: dot as thousands sep, comma as decimal — e.g. 1.234,56
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.join(',');
}

// ── PDF renderer (Dutch layout matching sample) ─────────────
function renderInvoicePDF(doc, invoice, profile) {
  const M = 40, PW = 595, PH = 842, W = PW - M * 2;
  const DARK   = '#1A1A2A';
  const GRAY   = '#555555';
  const LGRAY  = '#888888';
  const BORDER = '#CCCCCC';
  const TBLHDR = '#2D3748';
  const cur    = invoice.currency || 'EUR';

  // ── HEADER ────────────────────────────────────────────────
  // "Factuur" + number (top-left)
  doc.font('Helvetica-Bold').fontSize(28).fillColor(DARK)
    .text('Factuur', M, 42, { lineBreak: false });
  doc.font('Helvetica').fontSize(11).fillColor(GRAY)
    .text('Nr ' + invoice.invoice_number, M, 76, { lineBreak: false });

  // Company block (centre)
  const coX = 205, lblW = 72, valX = coX + lblW;
  let cy = 42;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK)
    .text(profile.name || '', coX, cy, { lineBreak: false });
  cy += 12;

  doc.font('Helvetica').fontSize(9).fillColor(GRAY);
  const addrLines = [
    profile.address,
    [profile.postcode, profile.city].filter(Boolean).join(' '),
    profile.country || 'Nederland'
  ].filter(Boolean);
  for (const line of addrLines) {
    doc.text(line, coX, cy, { lineBreak: false });
    cy += 11;
  }

  if (profile.btw_number) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY)
      .text('BTW ID-nummer', coX, cy, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      .text(profile.btw_number, valX, cy, { lineBreak: false });
    cy += 11;
  }
  if (profile.kvk_number) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY)
      .text('KVK-nummer', coX, cy, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      .text(String(profile.kvk_number), valX, cy, { lineBreak: false });
    cy += 11;
  }
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY)
    .text('Tel.:', coX, cy, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text(profile.phone || '', valX, cy, { lineBreak: false });
  cy += 11;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY)
    .text('E-mail', coX, cy, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text(profile.email || '', valX, cy, { lineBreak: false });
  cy += 11;

  // Logo (right)
  if (profile.logo_path && fs.existsSync(profile.logo_path)) {
    try { doc.image(profile.logo_path, PW - M - 110, 35, { fit: [110, 65] }); } catch {}
  }

  // Separator
  const SEP = Math.max(cy, 108) + 10;
  doc.moveTo(M, SEP).lineTo(PW - M, SEP).strokeColor(BORDER).lineWidth(0.5).stroke();

  // ── CLIENT + DATE BOXES ────────────────────────────────────
  const secY  = SEP + 14;
  const dateX = 255;
  const dateW = PW - M - dateX; // ~300

  // "Factuur voor:"
  doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK)
    .text('Factuur voor:', M, secY);

  let clY = secY + 15;
  const clientDisplayName = invoice.company_name || invoice.client_name || '';
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
    .text(clientDisplayName, M, clY, { width: 200, lineBreak: false });
  clY += 14;

  doc.font('Helvetica').fontSize(9).fillColor(GRAY);
  const buyLines = [
    invoice.client_address,
    [invoice.client_postcode, invoice.client_city].filter(Boolean).join(' '),
    invoice.client_country
  ].filter(l => l && l.trim());
  for (const line of buyLines) {
    doc.text(line, M, clY, { width: 200, lineBreak: false });
    clY += 12;
  }
  if (invoice.client_vat) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK)
      .text('BTW-ID:', M, clY, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      .text('  ' + invoice.client_vat, M + 38, clY, { lineBreak: false });
    clY += 12;
  }
  // KvK line for client (if available via notes or client record)

  // Date boxes row  (3 equal boxes)
  const DB_H = 38, DB_GAP = 5;
  const DB_W = Math.floor((dateW - DB_GAP * 2) / 3);
  const dateBoxes = [
    { label: 'Leverdatum',   val: formatDateNL(invoice.issue_date) },
    { label: 'Factuurdatum', val: formatDateNL(invoice.issue_date) },
    { label: 'Vervaldatum',  val: formatDateNL(invoice.due_date)   }
  ];
  for (let i = 0; i < 3; i++) {
    const bx = dateX + i * (DB_W + DB_GAP);
    doc.rect(bx, secY, DB_W, DB_H).fillColor('#FFFFFF').fill();
    doc.rect(bx, secY, DB_W, DB_H).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
      .text(dateBoxes[i].label, bx + 5, secY + 6, { width: DB_W - 10, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(DARK)
      .text(dateBoxes[i].val, bx + 5, secY + 19, { width: DB_W - 10, lineBreak: false });
  }

  // Payment + IBAN boxes
  const payY  = secY + DB_H + DB_GAP;
  const PB_H  = 42;
  const PB_W1 = 110;
  const PB_W2 = dateW - PB_W1 - DB_GAP;

  doc.rect(dateX, payY, PB_W1, PB_H).fillColor('#FFFFFF').fill();
  doc.rect(dateX, payY, PB_W1, PB_H).strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
    .text('Te betalen', dateX + 5, payY + 5, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
    .text(cur + ' ' + fmtAmt(invoice.total), dateX + 5, payY + 18, { width: PB_W1 - 10, lineBreak: false });

  const ibanX = dateX + PB_W1 + DB_GAP;
  doc.rect(ibanX, payY, PB_W2, PB_H).fillColor('#FFFFFF').fill();
  doc.rect(ibanX, payY, PB_W2, PB_H).strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
    .text('IBAN', ibanX + 5, payY + 5, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(DARK)
    .text(profile.iban || '', ibanX + 5, payY + 18, { width: PB_W2 - 10, lineBreak: false });

  // ── ITEMS TABLE ────────────────────────────────────────────
  const tblY = Math.max(clY, payY + PB_H) + 20;
  const CD = 265, CQ = 70, CP = 85, CT = W - CD - CQ - CP;
  const CQx = M + CD, CPx = CQx + CQ, CTx = CPx + CP;

  doc.rect(M, tblY, W, 20).fillColor(TBLHDR).fill();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF');
  doc.text('Omschrijving', M + 5,  tblY + 6, { width: CD - 5,  lineBreak: false });
  doc.text('Aantal',       CQx,    tblY + 6, { width: CQ,      align: 'right', lineBreak: false });
  doc.text('Prijs p.e.',   CPx,    tblY + 6, { width: CP,      align: 'right', lineBreak: false });
  doc.text('Excl. BTW',    CTx,    tblY + 6, { width: CT - 5,  align: 'right', lineBreak: false });

  let iy = tblY + 20;
  for (let idx = 0; idx < (invoice.items || []).length; idx++) {
    const item   = invoice.items[idx];
    const ROW_H  = 18;
    if (idx % 2 === 1) doc.rect(M, iy, W, ROW_H).fillColor('#F9F9F9').fill();
    doc.font('Helvetica').fontSize(9).fillColor(DARK);
    doc.text(item.description || '',            M + 5, iy + 5, { width: CD - 5, lineBreak: false });
    doc.text(Number(item.quantity).toFixed(2) + ' ' + (item.unit || 'Stk'),
                                                CQx,   iy + 5, { width: CQ,     align: 'right', lineBreak: false });
    doc.text(cur + ' ' + fmtAmt(item.unit_price), CPx, iy + 5, { width: CP,     align: 'right', lineBreak: false });
    doc.text(cur + ' ' + fmtAmt(item.total),    CTx,   iy + 5, { width: CT - 5, align: 'right', lineBreak: false });
    iy += ROW_H;
  }
  doc.moveTo(M, iy).lineTo(PW - M, iy).strokeColor(BORDER).lineWidth(0.5).stroke();
  iy += 14;

  // ── TOTALS ─────────────────────────────────────────────────
  const TLx = CQx, TLw = CQ + CP, TAx = CTx, TAw = CT - 5;

  doc.font('Helvetica').fontSize(9).fillColor(GRAY);
  doc.text('Totaal excl. BTW', TLx, iy, { width: TLw, align: 'right', lineBreak: false });
  doc.text(cur + ' ' + fmtAmt(invoice.subtotal), TAx, iy, { width: TAw, align: 'right', lineBreak: false });
  iy += 14;

  if (invoice.btw_reverse_charge) {
    const btwLbl = invoice.client_vat
      ? 'BTW verlegd naar ' + invoice.client_vat
      : 'BTW verlegd';
    doc.text(btwLbl, TLx, iy, { width: TLw, align: 'right', lineBreak: false });
  } else {
    doc.text('BTW ' + (invoice.btw_rate || 0) + '%', TLx, iy, { width: TLw, align: 'right', lineBreak: false });
    doc.text(cur + ' ' + fmtAmt(invoice.btw_amount), TAx, iy, { width: TAw, align: 'right', lineBreak: false });
  }
  iy += 16;

  doc.moveTo(TLx, iy - 4).lineTo(PW - M, iy - 4).strokeColor(BORDER).lineWidth(0.5).stroke();

  // Opmerkingen label (left) + Te betalen box (right)
  doc.font('Helvetica').fontSize(9).fillColor(LGRAY)
    .text('Opmerkingen', M, iy, { lineBreak: false });
  if (invoice.notes) {
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      .text(invoice.notes, M, iy + 12, { width: 200 });
  }

  doc.rect(TLx, iy - 4, TLw, 24).fillColor('#EEEEEE').fill();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
    .text('Te betalen', TLx + 5, iy + 1, { width: TLw - 10, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(12).fillColor(DARK)
    .text(cur + ' ' + fmtAmt(invoice.total), TAx, iy, { width: TAw, align: 'right', lineBreak: false });

  // ── FOOTER ─────────────────────────────────────────────────
  const footY = PH - 85;
  doc.moveTo(M, footY).lineTo(PW - M, footY).strokeColor(BORDER).lineWidth(0.5).stroke();

  const payDays = profile.default_payment_days || 14;
  const payText =
    'Ik verzoek u vriendelijk om het bovenstaande factuurbedrag binnen ' + payDays +
    ' dagen na factuurdatum over te maken op rekeningnummer ' + (profile.iban || '') +
    ' van ' + (profile.name || '') +
    ' onder vermelding van het factuurnummer: ' + invoice.invoice_number;

  doc.font('Helvetica').fontSize(8).fillColor(GRAY)
    .text(payText, M, footY + 8, { width: Math.floor(W * 0.70), align: 'left' });

  doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
    .text('Pagina 1 / 1', M, PH - 25, { width: W, align: 'center', lineBreak: false });
}

module.exports = {
  getAll, getById, getItems, getNextNumber,
  create, update, delete: delete_, markPaid, duplicate, exportPDF
};

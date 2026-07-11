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
      (invoice_number, client_id, project_id, status, issue_date, due_date, sale_date,
       currency, exchange_rate, subtotal, btw_rate, btw_amount, total, total_eur,
       notes, reference, btw_reverse_charge)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insert.run(
    invoiceNumber,
    data.client_id || null,
    data.project_id || null,
    data.status || 'draft',
    data.issue_date,
    data.due_date,
    data.sale_date || null,
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
  const status = data.status || 'draft';

  // Stara faktura — do wyliczenia daty zapłaty i porządku w income_entries.
  const old = db.prepare('SELECT issue_date, paid_date, invoice_number FROM invoices WHERE id = ?').get(id) || {};

  // Data zapłaty:
  //  - jeśli podano jawnie w formularzu → użyj jej
  //  - jeśli stara paid_date == stara issue_date (były zsynchronizowane, typowe
  //    dla importu) → podążaj za nową datą wystawienia (naprawia dashboard po
  //    zmianie daty na fakturze)
  //  - w przeciwnym razie zostaw starą paid_date
  let paidDate = null;
  if (status === 'paid') {
    if (data.paid_date) paidDate = data.paid_date;
    else if (old.paid_date && old.issue_date && old.paid_date === old.issue_date) paidDate = data.issue_date;
    else paidDate = old.paid_date || data.issue_date;
  }

  db.prepare(`
    UPDATE invoices SET
      client_id = ?, project_id = ?, status = ?, issue_date = ?, due_date = ?, sale_date = ?, paid_date = ?,
      currency = ?, exchange_rate = ?, subtotal = ?, btw_rate = ?, btw_amount = ?,
      total = ?, total_eur = ?, notes = ?, reference = ?, btw_reverse_charge = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.client_id || null, data.project_id || null, status,
    data.issue_date, data.due_date, data.sale_date || null, paidDate, data.currency || 'EUR', exchangeRate,
    subtotal, btwRate, btwAmount, total, totalEur,
    data.notes || '', data.reference || '', data.btw_reverse_charge ? 1 : 0,
    id
  );

  if (data.items) {
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
    saveItems(id, data.items);
  }

  // Synchronizuj wpis przychodu z fakturą (data = paid_date, kwota, źródło).
  const incomeRow = db.prepare('SELECT id FROM income_entries WHERE invoice_id = ?').get(id);
  if (status === 'paid' && total > 0) {
    const incomeSource = _sourceForClient(db, data.client_id);
    if (incomeRow) {
      db.prepare(`
        UPDATE income_entries SET source = ?, description = ?, amount = ?, currency = ?,
          exchange_rate = ?, amount_eur = ?, date = ? WHERE id = ?
      `).run(incomeSource, 'Factuur ' + (old.invoice_number || ''), total, data.currency || 'EUR',
        exchangeRate, totalEur, paidDate, incomeRow.id);
    } else {
      db.prepare(`
        INSERT INTO income_entries (source, description, amount, currency, exchange_rate, amount_eur, date, invoice_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(incomeSource, 'Factuur ' + (old.invoice_number || ''), total, data.currency || 'EUR',
        exchangeRate, totalEur, paidDate, id);
    }
  } else if (incomeRow) {
    // faktura już nie jest zapłacona → usuń wpis przychodu
    db.prepare('DELETE FROM income_entries WHERE id = ?').run(incomeRow.id);
  }

  return { success: true };
}

function delete_(id, opts = {}) {
  const db = getDb();
  db.transaction(() => {
    // Nagrobek do propagacji usunięcia w chmurze (chyba że usunięcie pochodzi z sync).
    if (!opts.fromCloudSync) {
      const row = db.prepare('SELECT cloud_id FROM invoices WHERE id = ?').get(id);
      if (row && row.cloud_id) {
        db.prepare('INSERT INTO sync_deletions (table_name, cloud_id) VALUES (?, ?)').run('invoices', row.cloud_id);
      }
    }
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

  // QR EPC (SEPA) — skan w aplikacji bankowej wypełnia przelew.
  // Tylko dla EUR, z IBAN-em i dodatnią kwotą; inaczej stopka bez QR.
  const qrBuffer = await _buildEpcQrBuffer(invoice, profile);

  await new Promise((resolve, reject) => {
    doc.pipe(stream);
    renderInvoicePDF(doc, invoice, profile, qrBuffer);
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

// ── EPC QR (SEPA credit transfer) ───────────────────────────
// Format EPC069-12 v002: skan kodu w aplikacji bankowej wypełnia
// przelew (odbiorca, IBAN, kwota, tytuł). Działa tylko dla EUR.
async function _buildEpcQrBuffer(invoice, profile) {
  try {
    const iban = String(profile.iban || '').replace(/\s+/g, '');
    const name = String(profile.name || '').trim();
    const amount = Number(invoice.total) || 0;
    const currency = invoice.currency || 'EUR';
    if (!iban || !name || amount <= 0 || currency !== 'EUR') return null;

    const payload = [
      'BCD',                                   // service tag
      '002',                                   // wersja (BIC opcjonalny)
      '1',                                     // kodowanie: UTF-8
      'SCT',                                   // SEPA Credit Transfer
      '',                                      // BIC (puste w v002)
      name.slice(0, 70),                       // odbiorca
      iban,                                    // IBAN
      'EUR' + amount.toFixed(2),               // kwota
      '',                                      // purpose
      '',                                      // remittance (structured)
      ('Factuur ' + invoice.invoice_number).slice(0, 140) // tytuł przelewu
    ].join('\n');

    const QRCode = require('qrcode');
    return await QRCode.toBuffer(payload, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 0,
      width: 220
    });
  } catch {
    return null; // brak QR nie blokuje eksportu PDF
  }
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
function renderInvoicePDF(doc, invoice, profile, qrBuffer = null) {
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
    { label: 'Leverdatum',   val: formatDateNL(invoice.sale_date || invoice.issue_date) },
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

  // Tekst zajmuje lewą część; QR EPC (jeśli jest) — prawą
  const textW = qrBuffer ? Math.floor(W * 0.55) : Math.floor(W * 0.70);
  doc.font('Helvetica').fontSize(8).fillColor(GRAY)
    .text(payText, M, footY + 8, { width: textW, align: 'left' });

  if (qrBuffer) {
    const QR_S = 52;
    const qrX = M + textW + 14;
    try {
      doc.image(qrBuffer, qrX, footY + 6, { width: QR_S, height: QR_S });
      doc.font('Helvetica-Bold').fontSize(7).fillColor(DARK)
        .text('Betaal met QR-code', qrX + QR_S + 8, footY + 10, { width: PW - M - qrX - QR_S - 8, lineBreak: false });
      doc.font('Helvetica').fontSize(6.5).fillColor(LGRAY)
        .text('Scan met een bankieren-app om de overboeking te starten. Let op: niet alle banken ondersteunen de EPC QR.',
          qrX + QR_S + 8, footY + 20, { width: PW - M - qrX - QR_S - 12 });
    } catch { /* uszkodzony bufor QR nie blokuje PDF */ }
  }

  doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
    .text('Pagina 1 / 1', M, PH - 25, { width: W, align: 'center', lineBreak: false });
}

// ── UBL 2.1 / Peppol BIS 3.0 export ─────────────────────────
// Lustrzane odbicie importera z efaktura-import.js — plik daje się
// wczytać przez księgowego i systemy e-fakturowania.

function _xml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function _amt(v) { return (Number(v) || 0).toFixed(2); }

// Nazwa kraju (NL/EN/PL) → kod ISO 3166-1 alpha-2 dla UBL
function _countryISO(name) {
  const s = String(name || '').trim().toLowerCase();
  if (!s) return 'NL';
  if (/^[a-z]{2}$/.test(s)) return s.toUpperCase(); // już kod ISO
  const map = {
    'nederland': 'NL', 'netherlands': 'NL', 'holandia': 'NL', 'the netherlands': 'NL',
    'ierland': 'IE', 'ireland': 'IE', 'irlandia': 'IE',
    'duitsland': 'DE', 'germany': 'DE', 'niemcy': 'DE', 'deutschland': 'DE',
    'belgië': 'BE', 'belgie': 'BE', 'belgium': 'BE', 'belgia': 'BE',
    'polen': 'PL', 'poland': 'PL', 'polska': 'PL',
    'frankrijk': 'FR', 'france': 'FR', 'francja': 'FR',
    'spanje': 'ES', 'spain': 'ES', 'hiszpania': 'ES',
    'italië': 'IT', 'italie': 'IT', 'italy': 'IT', 'włochy': 'IT',
    'verenigd koninkrijk': 'GB', 'united kingdom': 'GB', 'uk': 'GB',
    'verenigde staten': 'US', 'united states': 'US', 'usa': 'US'
  };
  return map[s] || 'NL';
}

function buildUBLXml(invoice, profile) {
  const cur = invoice.currency || 'EUR';
  const reverse = !!invoice.btw_reverse_charge;
  const btwRate = Number(invoice.btw_rate) || 0;

  // Kategoria podatkowa UBL: AE = reverse charge, Z = stawka 0, S = standardowa
  const taxCat = reverse ? 'AE' : (btwRate === 0 ? 'Z' : 'S');
  const items = invoice.items || [];

  const lines = items.map((it, i) => `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">${Number(it.quantity) || 1}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${cur}">${_amt(it.total)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name>${_xml(it.description || 'Pozycja ' + (i + 1))}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${taxCat}</cbc:ID>
          <cbc:Percent>${reverse ? 0 : btwRate}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${cur}">${_amt(it.unit_price)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`).join('');

  const supplierVat = profile.btw_number ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${_xml(profile.btw_number)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : '';

  const customerVat = invoice.client_vat ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${_xml(invoice.client_vat)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : '';

  const delivery = invoice.sale_date ? `
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${invoice.sale_date}</cbc:ActualDeliveryDate>
  </cac:Delivery>` : '';

  const paymentMeans = profile.iban ? `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${_xml(invoice.invoice_number)}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${_xml(String(profile.iban).replace(/\s+/g, ''))}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>` : '';

  const exemptionReason = reverse
    ? '<cbc:TaxExemptionReason>Reverse charge / BTW verlegd</cbc:TaxExemptionReason>'
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${_xml(invoice.invoice_number)}</cbc:ID>
  <cbc:IssueDate>${invoice.issue_date}</cbc:IssueDate>
  <cbc:DueDate>${invoice.due_date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${invoice.notes ? `<cbc:Note>${_xml(invoice.notes)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>
  ${invoice.reference ? `<cbc:BuyerReference>${_xml(invoice.reference)}</cbc:BuyerReference>` : ''}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${_xml(profile.name || '')}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${_xml(profile.address || '')}</cbc:StreetName>
        <cbc:CityName>${_xml(profile.city || '')}</cbc:CityName>
        <cbc:PostalZone>${_xml(profile.postcode || '')}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NL</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${supplierVat}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${_xml(profile.name || '')}</cbc:RegistrationName>
        ${profile.kvk_number ? `<cbc:CompanyID>${_xml(profile.kvk_number)}</cbc:CompanyID>` : ''}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${_xml(invoice.company_name || invoice.client_name || '')}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${_xml(invoice.client_address || '')}</cbc:StreetName>
        <cbc:CityName>${_xml(invoice.client_city || '')}</cbc:CityName>
        <cbc:PostalZone>${_xml(invoice.client_postcode || '')}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${_countryISO(invoice.client_country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${customerVat}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${_xml(invoice.company_name || invoice.client_name || '')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>${delivery}${paymentMeans}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${_amt(invoice.btw_amount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${cur}">${_amt(invoice.subtotal)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${cur}">${_amt(invoice.btw_amount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${taxCat}</cbc:ID>
        <cbc:Percent>${reverse ? 0 : btwRate}</cbc:Percent>
        ${exemptionReason}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${_amt(invoice.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${_amt(invoice.subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${_amt(invoice.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${cur}">${_amt(invoice.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>
`;
}

async function exportUBL(id, win) {
  const invoice = getById(id);
  if (!invoice) throw new Error('Factuur niet gevonden.');

  const profile = require('./settings').getProfile();
  const { dialog } = require('electron');

  const invNum = invoice.invoice_number.replace(/\//g, '-');
  const saveResult = await dialog.showSaveDialog(win, {
    title: 'Zapisz fakturę jako UBL XML',
    defaultPath: `Factuur_${invNum}.xml`,
    filters: [{ name: 'UBL XML', extensions: ['xml'] }]
  });
  if (saveResult.canceled) return null;

  fs.writeFileSync(saveResult.filePath, buildUBLXml(invoice, profile), 'utf-8');
  return saveResult.filePath;
}

// ── Podgląd na żywo: renderuje PDF z NIEZAPISANYCH danych formularza do bufora ──
// Zwraca data: URL do osadzenia w viewerze (reużywa renderInvoicePDF + QR EPC).
async function renderPreviewPDF(data) {
  const db = getDb();
  const profile = require('./settings').getProfile();

  const items = (data.items || [])
    .filter(it => it && (it.description || Number(it.unit_price) || Number(it.quantity)))
    .map(it => ({
      description: it.description || '',
      quantity: Number(it.quantity) || 1,
      unit: it.unit || 'szt',
      unit_price: Number(it.unit_price) || 0,
      total: (Number(it.quantity) || 1) * (Number(it.unit_price) || 0)
    }));

  const subtotal = calculateSubtotal(items);
  const btwRate = Number(data.btw_rate) || 0;
  const btwAmount = data.btw_reverse_charge ? 0 : subtotal * (btwRate / 100);
  const total = subtotal + btwAmount;
  const exchangeRate = Number(data.exchange_rate) || 1;

  let client = {};
  if (data.client_id) {
    client = db.prepare(
      'SELECT name, company_name, address, postcode, city, country, vat_number FROM clients WHERE id = ?'
    ).get(data.client_id) || {};
  }

  const invoice = {
    invoice_number: data.invoice_number || '—',
    issue_date: data.issue_date, due_date: data.due_date, sale_date: data.sale_date || null,
    currency: data.currency || 'EUR', exchange_rate: exchangeRate,
    subtotal, btw_rate: btwRate, btw_amount: btwAmount, total, total_eur: total / exchangeRate,
    btw_reverse_charge: data.btw_reverse_charge ? 1 : 0,
    notes: data.notes || '', reference: data.reference || '',
    items,
    client_name: client.name || '', company_name: client.company_name || '',
    client_address: client.address || '', client_postcode: client.postcode || '',
    client_city: client.city || '', client_country: client.country || '',
    client_vat: client.vat_number || ''
  };

  const qr = await _buildEpcQrBuffer(invoice, profile);
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks = [];
  return await new Promise((resolve, reject) => {
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve('data:application/pdf;base64,' + Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);
    try { renderInvoicePDF(doc, invoice, profile, qr); doc.end(); } catch (e) { reject(e); }
  });
}

// Renderuje PDF ZAPISANEJ faktury (po id) do data: URL — do podglądu read-only.
async function renderSavedPreviewPDF(id) {
  const invoice = getById(id);
  if (!invoice) throw new Error('Faktura nie znaleziona.');
  const profile = require('./settings').getProfile();
  const qr = await _buildEpcQrBuffer(invoice, profile);
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks = [];
  return await new Promise((resolve, reject) => {
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve('data:application/pdf;base64,' + Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);
    try { renderInvoicePDF(doc, invoice, profile, qr); doc.end(); } catch (e) { reject(e); }
  });
}

module.exports = {
  getAll, getById, getItems, getNextNumber,
  create, update, delete: delete_, markPaid, duplicate, exportPDF, exportUBL,
  renderPreviewPDF, renderSavedPreviewPDF
};

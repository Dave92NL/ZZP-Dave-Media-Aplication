'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { getDb } = require('../database/db');

const CATEGORIES = [
  'Sprzęt IT',
  'Internet / Telefon',
  'Oprogramowanie / Licencje',
  'Transport / Paliwo',
  'Biuro / Materiały',
  'Marketing / Reklama',
  'Księgowość / Prawnik',
  'Szkolenia / Kursy',
  'Inne'
];

function getAll(filters = {}) {
  const db = getDb();
  let where = [];
  const params = [];

  if (filters.year) { where.push("strftime('%Y', e.date) = ?"); params.push(String(filters.year)); }
  if (filters.month) { where.push("strftime('%m', e.date) = ?"); params.push(String(filters.month).padStart(2, '0')); }
  if (filters.project_id) { where.push('e.project_id = ?'); params.push(filters.project_id); }
  if (filters.category) { where.push('e.category = ?'); params.push(filters.category); }
  if (filters.date_from) { where.push('e.date >= ?'); params.push(filters.date_from); }
  if (filters.date_to) { where.push('e.date <= ?'); params.push(filters.date_to); }
  if (filters.incomplete) {
    where.push('(SELECT COUNT(*) FROM expense_attachments ea WHERE ea.expense_id = e.id) = 0');
  }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  return db.prepare(`
    SELECT e.*, p.name as project_name,
      COALESCE((SELECT COUNT(*) FROM expense_attachments ea WHERE ea.expense_id = e.id), 0) as attachment_count
    FROM expenses e
    LEFT JOIN projects p ON e.project_id = p.id
    ${whereStr}
    ORDER BY e.date DESC, e.id DESC
  `).all(...params);
}

function create(data) {
  const db = getDb();
  if (!data.date) throw new Error('Data jest wymagana.');
  if (!data.category) throw new Error('Kategoria jest wymagana.');
  if (!data.description) throw new Error('Opis jest wymagany.');

  const amount = Number(data.amount) || 0;
  const btwRate = Number(data.btw_rate) || 0;
  const btwAmount = amount * (btwRate / (100 + btwRate)); // inclusive
  const exchangeRate = Number(data.exchange_rate) || 1;
  const amountEur = amount / exchangeRate;

  const result = db.prepare(`
    INSERT INTO expenses
      (project_id, category, description, amount, currency, exchange_rate, amount_eur,
       btw_rate, btw_amount, btw_deductible, date, vendor, is_deductible, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.project_id || null,
    data.category,
    data.description,
    amount,
    data.currency || 'EUR',
    exchangeRate,
    amountEur,
    btwRate,
    btwAmount,
    data.btw_deductible !== false ? 1 : 0,
    data.date,
    data.vendor || '',
    data.is_deductible !== false ? 1 : 0,
    data.notes || ''
  );

  return { id: result.lastInsertRowid };
}

function update(id, data) {
  const db = getDb();
  const allowed = [
    'project_id', 'category', 'description', 'amount', 'currency', 'exchange_rate',
    'btw_rate', 'btw_deductible', 'date', 'vendor', 'is_deductible', 'notes'
  ];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      // Convert booleans to 0/1 — SQLite cannot bind JS booleans
      let val = data[key];
      if (key === 'btw_deductible' || key === 'is_deductible') {
        val = val ? 1 : 0;
      } else if (val === undefined) {
        val = null;
      }
      values.push(val);
    }
  }

  if (!fields.length) return false;

  // Recalculate derived fields
  if ('amount' in data || 'btw_rate' in data) {
    const current = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    const amount = Number('amount' in data ? data.amount : current.amount) || 0;
    const btwRate = Number('btw_rate' in data ? data.btw_rate : current.btw_rate) || 0;
    const btwAmount = amount * (btwRate / (100 + btwRate));
    fields.push('btw_amount = ?');
    values.push(btwAmount);
    const exchangeRate = Number('exchange_rate' in data ? data.exchange_rate : current.exchange_rate) || 1;
    fields.push('amount_eur = ?');
    values.push(amount / exchangeRate);
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  db.prepare(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { success: true };
}

function delete_(id) {
  const db = getDb();
  // Zbierz pliki (załączniki + paragon) przed usunięciem — cascade zabierze
  // wiersze z expense_attachments, ale nie pliki z dysku.
  const files = new Set();
  try {
    for (const a of db.prepare('SELECT file_path FROM expense_attachments WHERE expense_id = ?').all(id)) {
      if (a.file_path) files.add(a.file_path);
    }
  } catch { /* tabela mogła nie istnieć przed migracją v6 */ }
  const exp = db.prepare('SELECT receipt_path FROM expenses WHERE id = ?').get(id);
  if (exp?.receipt_path) files.add(exp.receipt_path);

  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);

  for (const f of files) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignoruj błąd kasowania pliku */ }
  }
  return { success: true };
}

function saveReceipt(expenseId, sourcePath) {
  const userDataPath = app.getPath('userData');
  const db = getDb();

  const expense = db.prepare('SELECT date FROM expenses WHERE id = ?').get(expenseId);
  if (!expense) throw new Error('Koszt nie znaleziony.');

  const date = new Date(expense.date);
  const yearMonth = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  const receiptDir = path.join(userDataPath, 'receipts', yearMonth);
  fs.mkdirSync(receiptDir, { recursive: true });

  const ext = path.extname(sourcePath);
  const filename = `receipt_${expenseId}_${Date.now()}${ext}`;
  const destPath = path.join(receiptDir, filename);
  fs.copyFileSync(sourcePath, destPath);

  const mimeType = ext.toLowerCase() === '.pdf' ? 'application/pdf'
    : ext.toLowerCase() === '.png' ? 'image/png'
    : ext.toLowerCase() === '.jpg' || ext.toLowerCase() === '.jpeg' ? 'image/jpeg'
    : '';

  db.prepare('UPDATE expenses SET receipt_path = ? WHERE id = ?').run(destPath, expenseId);
  const result = db.prepare(`
    INSERT INTO expense_attachments (expense_id, file_path, file_name, mime_type)
    VALUES (?, ?, ?, ?)
  `).run(expenseId, destPath, path.basename(destPath), mimeType);

  return db.prepare('SELECT * FROM expense_attachments WHERE id = ?').get(result.lastInsertRowid);
}

function getAttachments(expenseId) {
  const db = getDb();
  return db.prepare(`
    SELECT id, expense_id, file_path, file_name, mime_type, created_at
    FROM expense_attachments
    WHERE expense_id = ?
    ORDER BY id DESC
  `).all(expenseId);
}

function deleteAttachment(id) {
  const db = getDb();
  const attachment = db.prepare('SELECT expense_id, file_path FROM expense_attachments WHERE id = ?').get(id);
  if (!attachment) return { success: false };

  try {
    if (attachment.file_path && fs.existsSync(attachment.file_path)) {
      fs.unlinkSync(attachment.file_path);
    }
  } catch (err) {
    // ignore file delete failures
  }

  db.prepare('DELETE FROM expense_attachments WHERE id = ?').run(id);

  // Jeśli kasowany plik był głównym paragonem kosztu — podmień na inny załącznik
  // (albo wyczyść), żeby receipt_path nie wskazywał na nieistniejący plik.
  const exp = db.prepare('SELECT receipt_path FROM expenses WHERE id = ?').get(attachment.expense_id);
  if (exp && exp.receipt_path === attachment.file_path) {
    const next = db.prepare('SELECT file_path FROM expense_attachments WHERE expense_id = ? ORDER BY id DESC LIMIT 1').get(attachment.expense_id);
    db.prepare('UPDATE expenses SET receipt_path = ? WHERE id = ?').run(next?.file_path || '', attachment.expense_id);
  }
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
      SUM(amount_eur) as total_eur,
      SUM(CASE WHEN btw_deductible = 1 THEN btw_amount ELSE 0 END) as btw_deductible,
      SUM(CASE WHEN is_deductible = 1 THEN amount_eur ELSE 0 END) as deductible_eur
    FROM expenses ${whereStr}
  `).get(...params);

  const byCategory = db.prepare(`
    SELECT category, SUM(amount_eur) as total_eur
    FROM expenses ${whereStr}
    GROUP BY category
    ORDER BY total_eur DESC
  `).all(...params);

  return { ...total, byCategory };
}

module.exports = { getAll, create, update, delete: delete_, saveReceipt, getAttachments, deleteAttachment, getSummary, CATEGORIES };

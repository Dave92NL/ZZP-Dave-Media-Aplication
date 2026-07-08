'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { getDb } = require('../database/db');

function getAll(filters = {}) {
  const db = getDb();
  let where = [];
  const params = [];

  if (filters.status) { where.push('c.status = ?'); params.push(filters.status); }
  if (filters.search) {
    where.push('(c.name LIKE ? OR c.company_name LIKE ? OR c.email LIKE ?)');
    const q = `%${filters.search}%`;
    params.push(q, q, q);
  }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  return db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM invoices WHERE client_id = c.id) as invoice_count,
      (SELECT SUM(total_eur) FROM invoices WHERE client_id = c.id AND status = 'paid') as total_paid,
      (SELECT MAX(issue_date) FROM invoices WHERE client_id = c.id) as last_invoice_date
    FROM clients c
    ${whereStr}
    ORDER BY c.name ASC
  `).all(...params);
}

function getById(id) {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!client) return null;

  client.invoiceCount = db.prepare('SELECT COUNT(*) as c FROM invoices WHERE client_id = ?').get(id)?.c || 0;
  client.totalInvoiced = db.prepare('SELECT SUM(total_eur) as t FROM invoices WHERE client_id = ?').get(id)?.t || 0;
  client.totalPaid = db.prepare("SELECT SUM(total_eur) as t FROM invoices WHERE client_id = ? AND status = 'paid'").get(id)?.t || 0;
  client.outstanding = client.totalInvoiced - client.totalPaid;

  return client;
}

function create(data) {
  const db = getDb();
  if (!data.name) throw new Error('Nazwa klienta jest wymagana.');

  const result = db.prepare(`
    INSERT INTO clients
      (name, company_name, email, phone, address, postcode, city, country,
       vat_number, btw_rate, btw_reverse_charge, currency, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name, data.company_name || '', data.email || '', data.phone || '',
    data.address || '', data.postcode || '', data.city || '', data.country || '',
    data.vat_number || '', Number(data.btw_rate) || 0, data.btw_reverse_charge ? 1 : 0,
    data.currency || 'EUR', data.notes || '', data.status || 'active'
  );

  return { id: result.lastInsertRowid };
}

function update(id, data) {
  const db = getDb();
  const allowed = ['name', 'company_name', 'email', 'phone', 'address', 'postcode', 'city',
    'country', 'vat_number', 'btw_rate', 'btw_reverse_charge', 'currency', 'notes', 'status'];
  const fields = ['updated_at = CURRENT_TIMESTAMP'];
  const values = [];

  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  values.push(id);
  db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { success: true };
}

function delete_(id) {
  const db = getDb();
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  return { success: true };
}

function getInteractions(clientId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM client_interactions WHERE client_id = ? ORDER BY date DESC'
  ).all(clientId);
}

function addInteraction(data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO client_interactions (client_id, type, subject, content, date)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.client_id,
    data.type || 'note',
    data.subject || '',
    data.content || '',
    data.date || new Date().toISOString()
  );
  return { id: result.lastInsertRowid };
}

function deleteInteraction(id) {
  const db = getDb();
  db.prepare('DELETE FROM client_interactions WHERE id = ?').run(id);
  return { success: true };
}

function saveFile(clientId, sourcePath) {
  const userDataPath = app.getPath('userData');
  const clientFilesDir = path.join(userDataPath, 'client-files', String(clientId));
  fs.mkdirSync(clientFilesDir, { recursive: true });

  const filename = path.basename(sourcePath);
  const destPath = path.join(clientFilesDir, `${Date.now()}_${filename}`);
  fs.copyFileSync(sourcePath, destPath);

  const stats = fs.statSync(destPath);
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO client_files (client_id, filename, filepath, filesize) VALUES (?, ?, ?, ?)
  `).run(clientId, filename, destPath, stats.size);

  return { id: result.lastInsertRowid, filename, filepath: destPath };
}

function getFiles(clientId) {
  const db = getDb();
  return db.prepare('SELECT * FROM client_files WHERE client_id = ? ORDER BY uploaded_at DESC').all(clientId);
}

function deleteFile(id) {
  const db = getDb();
  const file = db.prepare('SELECT filepath FROM client_files WHERE id = ?').get(id);
  if (file && fs.existsSync(file.filepath)) {
    try { fs.unlinkSync(file.filepath); } catch {}
  }
  db.prepare('DELETE FROM client_files WHERE id = ?').run(id);
  return { success: true };
}

module.exports = {
  getAll, getById, create, update, delete: delete_,
  getInteractions, addInteraction, deleteInteraction,
  saveFile, getFiles, deleteFile
};

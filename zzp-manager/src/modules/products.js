'use strict';

// products.js — katalog produktów/usług: pozycje faktur wybierane z bazy
// zamiast wpisywania ręcznie za każdym razem.

const { getDb } = require('../database/db');

function getAll(filters = {}) {
  const db = getDb();
  const where = [];
  const params = [];

  if (filters.activeOnly) { where.push('is_active = 1'); }
  if (filters.search) {
    where.push('(name LIKE ? OR description LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return db.prepare(`SELECT * FROM products ${whereStr} ORDER BY name COLLATE NOCASE`).all(...params);
}

function getById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id) || null;
}

function create(data) {
  const db = getDb();
  if (!data.name || !String(data.name).trim()) throw new Error('Nazwa produktu jest wymagana.');

  const result = db.prepare(`
    INSERT INTO products (name, description, unit, unit_price, btw_rate, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(data.name).trim(),
    data.description || '',
    data.unit || 'usługa',
    Number(data.unit_price) || 0,
    data.btw_rate != null ? Number(data.btw_rate) : 21,
    data.is_active === false ? 0 : 1
  );
  return { id: result.lastInsertRowid };
}

function update(id, data) {
  const db = getDb();
  const allowed = ['name', 'description', 'unit', 'unit_price', 'btw_rate', 'is_active'];
  const fields = ['updated_at = CURRENT_TIMESTAMP'];
  const values = [];

  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      values.push(key === 'is_active' ? (data[key] ? 1 : 0) : data[key]);
    }
  }

  values.push(id);
  db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { success: true };
}

function delete_(id) {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return { success: true };
}

module.exports = { getAll, getById, create, update, delete: delete_ };

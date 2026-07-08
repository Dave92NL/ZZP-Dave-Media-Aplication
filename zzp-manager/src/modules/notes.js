'use strict';

const { getDb } = require('../database/db');

function getAll(filters = {}) {
  const db = getDb();
  let where = [];
  const params = [];

  if (filters.project_id !== undefined) {
    if (filters.project_id === null) {
      where.push('n.project_id IS NULL');
    } else {
      where.push('n.project_id = ?');
      params.push(filters.project_id);
    }
  }
  if (filters.invoice_id) { where.push('n.invoice_id = ?'); params.push(filters.invoice_id); }
  if (filters.search) {
    where.push('(n.title LIKE ? OR n.content LIKE ?)');
    const q = `%${filters.search}%`;
    params.push(q, q);
  }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  return db.prepare(`
    SELECT n.*, p.name as project_name
    FROM notes n
    LEFT JOIN projects p ON n.project_id = p.id
    ${whereStr}
    ORDER BY n.is_pinned DESC, n.updated_at DESC
  `).all(...params);
}

function getById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

function create(data) {
  const db = getDb();
  if (!data.title) throw new Error('Tytuł notatki jest wymagany.');

  const result = db.prepare(`
    INSERT INTO notes (title, content, project_id, invoice_id, tags, is_pinned)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.title,
    data.content || '',
    data.project_id || null,
    data.invoice_id || null,
    data.tags ? JSON.stringify(data.tags) : '[]',
    data.is_pinned ? 1 : 0
  );

  return { id: result.lastInsertRowid };
}

function update(id, data) {
  const db = getDb();
  const allowed = ['title', 'content', 'project_id', 'invoice_id', 'is_pinned'];
  const fields = ['updated_at = CURRENT_TIMESTAMP'];
  const values = [];

  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  if ('tags' in data) {
    fields.push('tags = ?');
    values.push(JSON.stringify(data.tags));
  }

  values.push(id);
  db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { success: true };
}

function delete_(id) {
  const db = getDb();
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return { success: true };
}

module.exports = { getAll, getById, create, update, delete: delete_ };

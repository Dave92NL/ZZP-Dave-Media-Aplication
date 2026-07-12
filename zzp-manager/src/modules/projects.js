'use strict';

const { getDb } = require('../database/db');

function getAll(filters = {}) {
  const db = getDb();
  let where = [];
  const params = [];

  if (filters.status) { where.push('p.status = ?'); params.push(filters.status); }
  if (filters.client_id) { where.push('p.client_id = ?'); params.push(filters.client_id); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  return db.prepare(`
    SELECT p.*, c.name as client_name,
      (SELECT SUM(duration_minutes) FROM time_entries WHERE project_id = p.id) as total_minutes,
      (SELECT SUM(total_eur) FROM invoices WHERE project_id = p.id AND status = 'paid') as paid_revenue,
      (SELECT SUM(amount_eur) FROM expenses WHERE project_id = p.id) as total_expenses,
      (SELECT MAX(created_at) FROM time_entries WHERE project_id = p.id) as last_activity
    FROM projects p
    LEFT JOIN clients c ON p.client_id = c.id
    ${whereStr}
    ORDER BY p.updated_at DESC
  `).all(...params);
}

function getById(id) {
  const db = getDb();
  const project = db.prepare(`
    SELECT p.*, c.name as client_name, c.email as client_email
    FROM projects p
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE p.id = ?
  `).get(id);

  if (!project) return null;

  project.totalHours = (db.prepare('SELECT SUM(duration_minutes) / 60.0 as h FROM time_entries WHERE project_id = ?').get(id)?.h) || 0;
  project.paidRevenue = db.prepare("SELECT SUM(total_eur) as r FROM invoices WHERE project_id = ? AND status = 'paid'").get(id)?.r || 0;
  project.totalExpenses = db.prepare('SELECT SUM(amount_eur) as e FROM expenses WHERE project_id = ?').get(id)?.e || 0;

  return project;
}

function create(data) {
  const db = getDb();
  if (!data.name) throw new Error('Nazwa projektu jest wymagana.');

  const result = db.prepare(`
    INSERT INTO projects (name, client_id, description, status, start_date, end_date,
      hourly_rate, budget_hours, budget_amount, currency, youtube_episode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.client_id || null,
    data.description || '',
    data.status || 'active',
    data.start_date || null,
    data.end_date || null,
    Number(data.hourly_rate) || 0,
    Number(data.budget_hours) || 0,
    Number(data.budget_amount) || 0,
    data.currency || 'EUR',
    data.youtube_episode || ''
  );

  return { id: result.lastInsertRowid };
}

function update(id, data) {
  const db = getDb();
  const allowed = ['name', 'client_id', 'description', 'status', 'start_date', 'end_date',
    'hourly_rate', 'budget_hours', 'budget_amount', 'currency', 'youtube_episode'];
  const fields = ['updated_at = CURRENT_TIMESTAMP'];
  const values = [];

  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  values.push(id);
  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { success: true };
}

function delete_(id, opts = {}) {
  const db = getDb();
  // Nagrobek do propagacji usunięcia w chmurze — bez niego pull „wskrzesza" projekt.
  if (!opts.fromCloudSync) {
    const row = db.prepare('SELECT cloud_id FROM projects WHERE id = ?').get(id);
    if (row && row.cloud_id) {
      try { db.prepare('INSERT INTO sync_deletions (table_name, cloud_id) VALUES (?, ?)').run('projects', row.cloud_id); }
      catch { /* tabela nagrobków sprzed migracji v8 */ }
    }
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return { success: true };
}

module.exports = { getAll, getById, create, update, delete: delete_ };

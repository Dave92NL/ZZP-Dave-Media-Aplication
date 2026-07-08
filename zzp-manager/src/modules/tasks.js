'use strict';

const { getDb } = require('../database/db');

function getAll(filters = {}) {
  const db = getDb();
  let where = [];
  const params = [];

  if (filters.status) { where.push('t.status = ?'); params.push(filters.status); }
  if (filters.project_id) { where.push('t.project_id = ?'); params.push(filters.project_id); }
  if (filters.priority) { where.push('t.priority = ?'); params.push(filters.priority); }
  if (filters.due_before) { where.push('t.due_date <= ?'); params.push(filters.due_before); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = filters.limit ? `LIMIT ${parseInt(filters.limit)}` : '';

  const priorityOrder = "CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END";

  return db.prepare(`
    SELECT t.*, p.name as project_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    ${whereStr}
    ORDER BY ${priorityOrder}, t.due_date ASC, t.id DESC
    ${limit}
  `).all(...params);
}

function create(data) {
  const db = getDb();
  if (!data.title) throw new Error('Tytuł zadania jest wymagany.');

  const result = db.prepare(`
    INSERT INTO tasks (project_id, title, description, priority, status, due_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.project_id || null,
    data.title,
    data.description || '',
    data.priority || 'medium',
    data.status || 'todo',
    data.due_date || null
  );

  return { id: result.lastInsertRowid };
}

function update(id, data) {
  const db = getDb();
  const allowed = ['project_id', 'title', 'description', 'priority', 'status', 'due_date'];
  const fields = ['updated_at = CURRENT_TIMESTAMP'];
  const values = [];

  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  if (data.status === 'done' && !data.completed_at) {
    fields.push('completed_at = CURRENT_TIMESTAMP');
  } else if (data.status && data.status !== 'done') {
    fields.push('completed_at = NULL');
  }

  values.push(id);
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { success: true };
}

function delete_(id) {
  const db = getDb();
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return { success: true };
}

function getCalendar(year, month) {
  const db = getDb();
  const y = String(year);
  const m = String(month).padStart(2, '0');

  const tasks = db.prepare(`
    SELECT t.*, p.name as project_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE strftime('%Y', t.due_date) = ? AND strftime('%m', t.due_date) = ?
    AND t.status != 'cancelled'
  `).all(y, m);

  const invoiceDueDates = db.prepare(`
    SELECT i.due_date, i.invoice_number, i.client_id,
           c.name as client_name, i.total, i.currency, i.status
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    WHERE strftime('%Y', i.due_date) = ? AND strftime('%m', i.due_date) = ?
    AND i.status IN ('sent', 'overdue')
  `).all(y, m);

  const reminders = db.prepare(`
    SELECT * FROM reminders
    WHERE strftime('%Y', due_date) = ? AND strftime('%m', due_date) = ?
    AND is_dismissed = 0
  `).all(y, m);

  return { tasks, invoiceDueDates, reminders };
}

module.exports = { getAll, create, update, delete: delete_, getCalendar };

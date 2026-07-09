'use strict';

// mileage.js — kilometrówka (rejestr przejazdów służbowych).
// W Holandii ZZP może odliczyć koszty auta prywatnego stawką za km
// (2024+: €0,23/km). Stawka zapisywana per wpis, żeby zmiany stawki
// w przyszłych latach nie przepisały historii.

const { getDb } = require('../database/db');

const DEFAULT_RATE = 0.23;

function getAll(filters = {}) {
  const db = getDb();
  const where = [];
  const params = [];

  if (filters.year)  { where.push("strftime('%Y', m.date) = ?"); params.push(String(filters.year)); }
  if (filters.month) { where.push("strftime('%m', m.date) = ?"); params.push(String(filters.month).padStart(2, '0')); }
  if (filters.client_id)  { where.push('m.client_id = ?');  params.push(filters.client_id); }
  if (filters.project_id) { where.push('m.project_id = ?'); params.push(filters.project_id); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return db.prepare(`
    SELECT m.*, c.name AS client_name, p.name AS project_name,
      (m.distance_km * (CASE WHEN m.is_return = 1 THEN 2 ELSE 1 END)) AS total_km,
      (m.distance_km * (CASE WHEN m.is_return = 1 THEN 2 ELSE 1 END) * m.rate_per_km) AS deduction
    FROM mileage_entries m
    LEFT JOIN clients c ON m.client_id = c.id
    LEFT JOIN projects p ON m.project_id = p.id
    ${whereStr}
    ORDER BY m.date DESC, m.id DESC
  `).all(...params);
}

function create(data) {
  const db = getDb();
  if (!data.date) throw new Error('Data jest wymagana.');
  const km = Number(data.distance_km);
  if (!km || km <= 0) throw new Error('Podaj liczbę kilometrów.');

  const result = db.prepare(`
    INSERT INTO mileage_entries
      (date, from_location, to_location, distance_km, is_return, purpose, client_id, project_id, rate_per_km)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.date,
    data.from_location || '',
    data.to_location || '',
    km,
    data.is_return ? 1 : 0,
    data.purpose || '',
    data.client_id || null,
    data.project_id || null,
    Number(data.rate_per_km) || DEFAULT_RATE
  );
  return { id: result.lastInsertRowid };
}

function update(id, data) {
  const db = getDb();
  const allowed = ['date', 'from_location', 'to_location', 'distance_km', 'is_return', 'purpose', 'client_id', 'project_id', 'rate_per_km'];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      values.push(key === 'is_return' ? (data[key] ? 1 : 0) : data[key]);
    }
  }

  if (!fields.length) return { success: false };
  values.push(id);
  db.prepare(`UPDATE mileage_entries SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { success: true };
}

function delete_(id) {
  const db = getDb();
  db.prepare('DELETE FROM mileage_entries WHERE id = ?').run(id);
  return { success: true };
}

function getSummary(year) {
  const db = getDb();
  const y = String(year || new Date().getFullYear());

  const total = db.prepare(`
    SELECT
      COUNT(*) AS entry_count,
      COALESCE(SUM(distance_km * (CASE WHEN is_return = 1 THEN 2 ELSE 1 END)), 0) AS total_km,
      COALESCE(SUM(distance_km * (CASE WHEN is_return = 1 THEN 2 ELSE 1 END) * rate_per_km), 0) AS total_deduction
    FROM mileage_entries
    WHERE strftime('%Y', date) = ?
  `).get(y);

  const byMonth = db.prepare(`
    SELECT strftime('%m', date) AS month,
      SUM(distance_km * (CASE WHEN is_return = 1 THEN 2 ELSE 1 END)) AS km,
      SUM(distance_km * (CASE WHEN is_return = 1 THEN 2 ELSE 1 END) * rate_per_km) AS deduction
    FROM mileage_entries
    WHERE strftime('%Y', date) = ?
    GROUP BY month ORDER BY month
  `).all(y);

  return { year: Number(y), ...total, byMonth, default_rate: DEFAULT_RATE };
}

module.exports = { getAll, create, update, delete: delete_, getSummary, DEFAULT_RATE };

'use strict';

const { Notification } = require('electron');
const cron = require('node-cron');
const { getDb } = require('../database/db');

let mainWindowRef = null;
let scheduledJobs = [];

function startScheduler(win) {
  mainWindowRef = win;

  // Check every day at 9:00 AM
  const dailyCheck = cron.schedule('0 9 * * *', () => {
    checkAndNotify();
    checkOverdueInvoices();
  }, { timezone: 'Europe/Amsterdam' });

  scheduledJobs.push(dailyCheck);

  // Also check on startup after 5 seconds
  setTimeout(() => {
    checkAndNotify();
    checkOverdueInvoices();
  }, 5000);
}

function checkAndNotify() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const in14Days = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  const upcoming = db.prepare(`
    SELECT * FROM reminders
    WHERE is_dismissed = 0
    AND due_date <= ?
    AND (last_notified_at IS NULL OR date(last_notified_at) < date('now'))
    ORDER BY due_date ASC
  `).all(in14Days);

  for (const reminder of upcoming) {
    const daysUntil = Math.ceil((new Date(reminder.due_date) - new Date(today)) / 86400000);

    let urgency = 'normal';
    if (daysUntil <= 0) urgency = 'critical';
    else if (daysUntil <= 7) urgency = 'critical';
    else urgency = 'normal';

    const body = daysUntil <= 0
      ? `Termin minął: ${reminder.due_date}`
      : daysUntil === 0
      ? 'Termin DZIŚ!'
      : `Za ${daysUntil} ${daysUntil === 1 ? 'dzień' : 'dni'} — ${reminder.due_date}`;

    sendNotification(reminder.title, body, urgency);

    db.prepare('UPDATE reminders SET last_notified_at = CURRENT_TIMESTAMP WHERE id = ?').run(reminder.id);
  }
}

function checkOverdueInvoices() {
  const db = getDb();

  const overdue = db.prepare(`
    SELECT i.invoice_number, i.due_date, c.name as client_name,
           julianday('now') - julianday(i.due_date) as days_overdue
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    WHERE i.status = 'overdue'
    AND (i.updated_at IS NULL OR date(i.updated_at) < date('now'))
    LIMIT 5
  `).all();

  for (const inv of overdue) {
    const days = Math.floor(inv.days_overdue);
    sendNotification(
      `Faktura przeterminowana: ${inv.invoice_number}`,
      `Klient: ${inv.client_name || 'Nieznany'} | Termin minął ${days} ${days === 1 ? 'dzień' : 'dni'} temu`,
      'critical'
    );
  }
}

function sendNotification(title, body, urgency = 'normal') {
  if (!Notification.isSupported()) return;

  try {
    const notif = new Notification({
      title,
      body,
      urgency,
      timeoutType: 'default',
      toastXml: undefined
    });

    notif.on('click', () => {
      if (mainWindowRef) {
        mainWindowRef.show();
        mainWindowRef.focus();
      }
    });

    notif.show();
  } catch (err) {
    console.error('Notification error:', err);
  }
}

// ── DB operations ─────────────────────────────────────────
function getAll() {
  const db = getDb();
  return db.prepare('SELECT * FROM reminders ORDER BY due_date ASC, is_dismissed ASC').all();
}

function create(data) {
  const db = getDb();
  if (!data.title) throw new Error('Tytuł jest wymagany.');
  if (!data.due_date) throw new Error('Data jest wymagana.');

  const result = db.prepare(`
    INSERT INTO reminders (title, description, type, due_date, due_time, is_recurring, recurrence_pattern)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.title,
    data.description || '',
    data.type || 'custom',
    data.due_date,
    data.due_time || '09:00',
    data.is_recurring ? 1 : 0,
    data.recurrence_pattern || ''
  );

  return { id: result.lastInsertRowid };
}

function update(id, data) {
  const db = getDb();
  const allowed = ['title', 'description', 'type', 'due_date', 'due_time', 'is_recurring', 'recurrence_pattern', 'is_dismissed'];
  const fields = [];
  const values = [];

  const boolFields = new Set(['is_recurring', 'is_dismissed']);
  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      const v = data[key];
      values.push(boolFields.has(key) ? (v ? 1 : 0) : (v ?? null));
    }
  }

  if (!fields.length) return false;
  values.push(id);
  db.prepare(`UPDATE reminders SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { success: true };
}

function dismiss(id) {
  const db = getDb();
  db.prepare('UPDATE reminders SET is_dismissed = 1 WHERE id = ?').run(id);
  return { success: true };
}

function delete_(id) {
  const db = getDb();
  db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
  return { success: true };
}

function getUpcoming(days) {
  const db = getDb();
  const d = (days === undefined || days === null) ? 30 : Number(days);
  // d === 0 means "show all future"
  const cutoff = d === 0
    ? '9999-12-31'
    : new Date(Date.now() + d * 86400000).toISOString().split('T')[0];
  return db.prepare(`
    SELECT * FROM reminders
    WHERE is_dismissed = 0 AND due_date <= ?
    ORDER BY due_date ASC
    LIMIT 20
  `).all(cutoff);
}

module.exports = {
  startScheduler, sendNotification, checkAndNotify,
  getAll, create, update, dismiss, delete: delete_, getUpcoming
};

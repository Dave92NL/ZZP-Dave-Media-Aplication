'use strict';

/**
 * cloud-sync.js — manual two-way sync between the local SQLite database and
 * a Supabase project, so invoices/expenses/clients created on a mobile
 * companion (PWA, future phase) can be pulled into the desktop app, and
 * vice versa.
 *
 * Design:
 *  - Local rows gain a `cloud_id` (maps to the Supabase UUID) and `synced_at`
 *    timestamp. Rows with `cloud_id IS NULL` have never been pushed.
 *  - Push: upload local rows that are new (`cloud_id IS NULL`) or modified
 *    since last sync (`updated_at > synced_at`).
 *  - Pull: download cloud rows whose id isn't yet mapped to any local
 *    `cloud_id` — these are new records (e.g. created via the future PWA).
 *  - Conflict handling: last-write-wins, acceptable given single-user +
 *    manual/infrequent sync cadence.
 *  - Reuses existing business-logic modules (invoices.create, expenses.create
 *    + saveReceipt, contacts.create) for anything pulled in, rather than
 *    duplicating their calculation/side-effect logic (income_entries, BTW
 *    amounts, etc.) with raw SQL.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDb } = require('../database/db');
const settings = require('./settings');

let _client = null;

function _getClient() {
  const url = settings.get('supabase_url');
  const key = settings.get('supabase_anon_key');
  if (!url || !key) {
    throw new Error('Supabase nie jest skonfigurowany. Przejdź do Ustawienia → Synchronizacja / Telefon.');
  }
  if (_client) return _client;
  const { createClient } = require('@supabase/supabase-js');
  // Electron's bundled Node.js version lacks a native WebSocket global (added
  // upstream in Node 22+), which supabase-js's realtime client requires even
  // when realtime subscriptions aren't used. Provide the `ws` package as a
  // polyfill so client creation doesn't throw.
  const WebSocket = require('ws');
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket }
  });
  return _client;
}

async function _ensureSession(client) {
  const refreshToken = settings.get('supabase_refresh_token');
  if (!refreshToken) {
    throw new Error('Brak zalogowanej sesji Supabase. Skonfiguruj połączenie ponownie w Ustawieniach.');
  }
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error) {
    throw new Error(
      'Sesja Supabase wygasła lub połączenie nieudane: ' + error.message +
      ' (jeśli projekt Supabase był nieaktywny >7 dni, mógł zostać uśpiony — ' +
      'zaloguj się na supabase.com i kliknij "Restore", potem spróbuj ponownie).'
    );
  }
  // Supabase rotates refresh tokens — persist the new one for next time.
  if (data?.session?.refresh_token) {
    settings.set('supabase_refresh_token', data.session.refresh_token);
  }
  return data.session;
}

// ── Credentials / connection ──────────────────────────────────────────────

async function configureCredentials({ url, anonKey, email, password }) {
  if (!url || !anonKey || !email || !password) {
    throw new Error('Wszystkie pola (URL, klucz, e-mail, hasło) są wymagane.');
  }
  settings.set('supabase_url', String(url).trim());
  settings.set('supabase_anon_key', String(anonKey).trim());
  _client = null; // force re-creation with the new URL/key

  const client = _getClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Logowanie do Supabase nieudane: ' + error.message);

  settings.set('supabase_refresh_token', data.session.refresh_token);
  settings.set('supabase_email', email);
  return { success: true };
}

async function testConnection() {
  const client = _getClient();
  await _ensureSession(client);
  const { error } = await client.from('clients').select('id').limit(1);
  if (error) {
    throw new Error(
      'Test połączenia nieudany: ' + error.message +
      ' (sprawdź czy tabele istnieją w Supabase i czy projekt nie jest uśpiony).'
    );
  }
  return { success: true };
}

function getStatus() {
  const db = getDb();
  const configured = !!(
    settings.get('supabase_url') &&
    settings.get('supabase_anon_key') &&
    settings.get('supabase_refresh_token')
  );

  const pendingClients = db.prepare(
    `SELECT COUNT(*) c FROM clients WHERE cloud_id IS NULL OR updated_at > synced_at`
  ).get().c;
  const pendingProjects = db.prepare(
    `SELECT COUNT(*) c FROM projects WHERE cloud_id IS NULL OR updated_at > synced_at`
  ).get().c;
  const pendingInvoices = db.prepare(
    `SELECT COUNT(*) c FROM invoices WHERE cloud_id IS NULL OR updated_at > synced_at`
  ).get().c;
  const pendingExpenses = db.prepare(
    `SELECT COUNT(*) c FROM expenses WHERE cloud_id IS NULL OR (updated_at IS NOT NULL AND updated_at > synced_at)`
  ).get().c;
  const pendingTimeEntries = db.prepare(
    `SELECT COUNT(*) c FROM time_entries WHERE cloud_id IS NULL OR (updated_at IS NOT NULL AND updated_at > synced_at)`
  ).get().c;
  const pendingMileage = db.prepare(
    `SELECT COUNT(*) c FROM mileage_entries WHERE cloud_id IS NULL OR (updated_at IS NOT NULL AND updated_at > synced_at)`
  ).get().c;
  let pendingDeletions = 0;
  try { pendingDeletions = db.prepare('SELECT COUNT(*) c FROM sync_deletions').get().c; } catch { pendingDeletions = 0; }

  return {
    configured,
    email: settings.get('supabase_email') || '',
    lastPush: settings.get('sync_last_push') || null,
    lastPull: settings.get('sync_last_pull') || null,
    pendingLocalCount: pendingClients + pendingProjects + pendingInvoices + pendingExpenses + pendingTimeEntries + pendingMileage + pendingDeletions
  };
}

function getHistory() {
  const db = getDb();
  return db.prepare('SELECT * FROM sync_history ORDER BY started_at DESC LIMIT 20').all();
}

function _recordHistory(db, direction, pushedCount, pulledCount, status, errorMessage) {
  db.prepare(`
    INSERT INTO sync_history (direction, finished_at, pushed_count, pulled_count, status, error_message)
    VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
  `).run(direction, pushedCount, pulledCount, status, errorMessage || '');
}

// Typ MIME pliku paragonu po rozszerzeniu — bez tego supabase-js wysyła Buffer jako
// text/plain, a bucket „receipts" (dozwolone tylko obrazy/PDF) odrzuca upload.
function _mimeForExt(ext) {
  switch (String(ext || '').toLowerCase()) {
    case '.pdf':  return 'application/pdf';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png':  return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif':  return 'image/gif';
    case '.heic': return 'image/heic';
    default:      return 'application/octet-stream';
  }
}

// ── Push: local → cloud ────────────────────────────────────────────────────

async function pushLocalChanges() {
  const db = getDb();
  const client = _getClient();
  await _ensureSession(client);

  let pushedClients = 0, pushedProjects = 0, pushedInvoices = 0, pushedExpenses = 0, pushedTimeEntries = 0, pushedMileage = 0, pushedDeletions = 0;
  const errors = [];

  // 0. Nagrobki usunięć — najpierw kasujemy w chmurze rekordy usunięte lokalnie,
  //    żeby drugie urządzenie je zdjęło (a nasz pull ich nie odtworzył).
  let pendingDeletions = [];
  try { pendingDeletions = db.prepare('SELECT * FROM sync_deletions').all(); } catch { pendingDeletions = []; }
  for (const d of pendingDeletions) {
    try {
      if (d.table_name === 'expenses') {
        // Najpierw sprzątnij plik paragonu w Storage, potem skasuj wiersz.
        const { data: row } = await client.from('expenses').select('receipt_storage_path').eq('id', d.cloud_id).maybeSingle();
        if (row && row.receipt_storage_path) {
          try { await client.storage.from('receipts').remove([row.receipt_storage_path]); } catch { /* brak pliku — pomiń */ }
        }
        const { error } = await client.from('expenses').delete().eq('id', d.cloud_id);
        if (error) throw error;
      } else if (d.table_name === 'invoices') {
        // invoice_items w chmurze mają ON DELETE CASCADE.
        const { error } = await client.from('invoices').delete().eq('id', d.cloud_id);
        if (error) throw error;
      }
      db.prepare('DELETE FROM sync_deletions WHERE id = ?').run(d.id);
      pushedDeletions++;
    } catch (err) {
      errors.push(`Usunięcie ${d.table_name} #${d.cloud_id}: ${err.message}`);
    }
  }

  // Helpers for mapping local FK → cloud UUID
  const _clientCloud = (localId) =>
    localId ? (db.prepare('SELECT cloud_id FROM clients WHERE id = ?').get(localId)?.cloud_id || null) : null;
  const _projectCloud = (localId) =>
    localId ? (db.prepare('SELECT cloud_id FROM projects WHERE id = ?').get(localId)?.cloud_id || null) : null;
  const _invoiceCloud = (localId) =>
    localId ? (db.prepare('SELECT cloud_id FROM invoices WHERE id = ?').get(localId)?.cloud_id || null) : null;

  // 1. Clients — must be pushed before invoices so client_id can be mapped
  const pendingClients = db.prepare(
    `SELECT * FROM clients WHERE cloud_id IS NULL OR updated_at > synced_at`
  ).all();
  for (const c of pendingClients) {
    try {
      const payload = {
        name: c.name, company_name: c.company_name, email: c.email, phone: c.phone,
        address: c.address, postcode: c.postcode, city: c.city, country: c.country,
        vat_number: c.vat_number, btw_rate: c.btw_rate, btw_reverse_charge: !!c.btw_reverse_charge,
        currency: c.currency, notes: c.notes, status: c.status
      };
      let cloudId = c.cloud_id;
      if (cloudId) {
        const { error } = await client.from('clients').update(payload).eq('id', cloudId);
        if (error) throw error;
      } else {
        const { data, error } = await client.from('clients').insert(payload).select('id').single();
        if (error) throw error;
        cloudId = data.id;
      }
      db.prepare(`UPDATE clients SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cloudId, c.id);
      pushedClients++;
    } catch (err) {
      errors.push(`Klient "${c.name}": ${err.message}`);
    }
  }

  // 2. Projects — before invoices/expenses/time_entries so project_id can be mapped
  const pendingProjects = db.prepare(
    `SELECT * FROM projects WHERE cloud_id IS NULL OR updated_at > synced_at`
  ).all();
  for (const p of pendingProjects) {
    try {
      const payload = {
        name: p.name, client_id: _clientCloud(p.client_id), description: p.description,
        status: p.status, start_date: p.start_date, end_date: p.end_date,
        hourly_rate: p.hourly_rate, budget_hours: p.budget_hours, budget_amount: p.budget_amount,
        currency: p.currency, youtube_episode: p.youtube_episode, origin: 'desktop'
      };
      let cloudId = p.cloud_id;
      if (cloudId) {
        const { error } = await client.from('projects').update(payload).eq('id', cloudId);
        if (error) throw error;
      } else {
        const { data, error } = await client.from('projects').insert(payload).select('id').single();
        if (error) throw error;
        cloudId = data.id;
      }
      db.prepare(`UPDATE projects SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cloudId, p.id);
      pushedProjects++;
    } catch (err) {
      errors.push(`Projekt "${p.name}": ${err.message}`);
    }
  }

  // 3. Invoices (+ items — always replaced as a full set, matching local update() semantics)
  const pendingInvoices = db.prepare(
    `SELECT * FROM invoices WHERE cloud_id IS NULL OR updated_at > synced_at`
  ).all();
  for (const inv of pendingInvoices) {
    try {
      const clientCloudId = _clientCloud(inv.client_id);
      const payload = {
        invoice_number: inv.invoice_number, client_id: clientCloudId, project_id: _projectCloud(inv.project_id), status: inv.status,
        issue_date: inv.issue_date, due_date: inv.due_date, paid_date: inv.paid_date, sale_date: inv.sale_date,
        currency: inv.currency, exchange_rate: inv.exchange_rate, subtotal: inv.subtotal,
        btw_rate: inv.btw_rate, btw_amount: inv.btw_amount, total: inv.total, total_eur: inv.total_eur,
        notes: inv.notes, reference: inv.reference, btw_reverse_charge: !!inv.btw_reverse_charge,
        origin: 'desktop'
      };
      let cloudId = inv.cloud_id;
      if (cloudId) {
        const { error } = await client.from('invoices').update(payload).eq('id', cloudId);
        if (error) throw error;
        const { error: delErr } = await client.from('invoice_items').delete().eq('invoice_id', cloudId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await client.from('invoices').insert(payload).select('id').single();
        if (error) throw error;
        cloudId = data.id;
      }

      const items = db.prepare(
        'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id'
      ).all(inv.id);
      if (items.length) {
        const itemsPayload = items.map(it => ({
          invoice_id: cloudId, description: it.description, quantity: it.quantity, unit: it.unit,
          unit_price: it.unit_price, btw_rate: it.btw_rate, total: it.total, sort_order: it.sort_order
        }));
        const { error: itemsErr } = await client.from('invoice_items').insert(itemsPayload);
        if (itemsErr) throw itemsErr;
      }

      db.prepare(`UPDATE invoices SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cloudId, inv.id);
      pushedInvoices++;
    } catch (err) {
      errors.push(`Faktura ${inv.invoice_number}: ${err.message}`);
    }
  }

  // 4. Expenses (+ receipt photo upload to Storage)
  const pendingExpensesRows = db.prepare(
    `SELECT * FROM expenses WHERE cloud_id IS NULL OR (updated_at IS NOT NULL AND updated_at > synced_at)`
  ).all();
  for (const e of pendingExpensesRows) {
    try {
      let receiptStoragePath;
      if (e.receipt_path && fs.existsSync(e.receipt_path)) {
        const ext = path.extname(e.receipt_path);
        const d = new Date(e.date);
        const objectPath = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/receipt_${e.id}_${Date.now()}${ext}`;
        const fileBuffer = fs.readFileSync(e.receipt_path);
        const { error: upErr } = await client.storage.from('receipts').upload(objectPath, fileBuffer, {
          upsert: true, contentType: _mimeForExt(ext)
        });
        if (upErr) throw upErr;
        receiptStoragePath = objectPath;
      }
      const payload = {
        project_id: _projectCloud(e.project_id),
        category: e.category, description: e.description, amount: e.amount, currency: e.currency,
        exchange_rate: e.exchange_rate, amount_eur: e.amount_eur, btw_rate: e.btw_rate, btw_amount: e.btw_amount,
        btw_deductible: !!e.btw_deductible, date: e.date, vendor: e.vendor,
        is_deductible: !!e.is_deductible, notes: e.notes, origin: 'desktop',
        ...(receiptStoragePath ? { receipt_storage_path: receiptStoragePath } : {})
      };
      let cloudId = e.cloud_id;
      if (cloudId) {
        const { error } = await client.from('expenses').update(payload).eq('id', cloudId);
        if (error) throw error;
      } else {
        const { data, error } = await client.from('expenses').insert(payload).select('id').single();
        if (error) throw error;
        cloudId = data.id;
      }
      db.prepare(`UPDATE expenses SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cloudId, e.id);
      pushedExpenses++;
    } catch (err) {
      errors.push(`Koszt #${e.id} (${e.description}): ${err.message}`);
    }
  }

  // 5. Time entries — after projects/invoices so project_id/invoice_id can be mapped
  const pendingTimeEntries = db.prepare(
    `SELECT * FROM time_entries WHERE cloud_id IS NULL OR (updated_at IS NOT NULL AND updated_at > synced_at)`
  ).all();
  for (const t of pendingTimeEntries) {
    try {
      const payload = {
        project_id: _projectCloud(t.project_id), invoice_id: _invoiceCloud(t.invoice_id),
        category: t.category, description: t.description,
        start_time: t.start_time, end_time: t.end_time, duration_minutes: t.duration_minutes,
        is_pomodoro: !!t.is_pomodoro, is_billable: !!t.is_billable, date: t.date, origin: 'desktop'
      };
      let cloudId = t.cloud_id;
      if (cloudId) {
        const { error } = await client.from('time_entries').update(payload).eq('id', cloudId);
        if (error) throw error;
      } else {
        const { data, error } = await client.from('time_entries').insert(payload).select('id').single();
        if (error) throw error;
        cloudId = data.id;
      }
      db.prepare(`UPDATE time_entries SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cloudId, t.id);
      pushedTimeEntries++;
    } catch (err) {
      errors.push(`Wpis czasu #${t.id} (${t.date}): ${err.message}`);
    }
  }

  // 6. Mileage (kilometrówka) — after projects so project_id/client_id can be mapped
  const pendingMileage = db.prepare(
    `SELECT * FROM mileage_entries WHERE cloud_id IS NULL OR (updated_at IS NOT NULL AND updated_at > synced_at)`
  ).all();
  for (const m of pendingMileage) {
    try {
      const payload = {
        date: m.date, from_location: m.from_location, to_location: m.to_location,
        distance_km: m.distance_km, is_return: !!m.is_return, purpose: m.purpose,
        client_id: _clientCloud(m.client_id), project_id: _projectCloud(m.project_id),
        rate_per_km: m.rate_per_km, origin: 'desktop'
      };
      let cloudId = m.cloud_id;
      if (cloudId) {
        const { error } = await client.from('mileage_entries').update(payload).eq('id', cloudId);
        if (error) throw error;
      } else {
        const { data, error } = await client.from('mileage_entries').insert(payload).select('id').single();
        if (error) throw error;
        cloudId = data.id;
      }
      db.prepare(`UPDATE mileage_entries SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cloudId, m.id);
      pushedMileage++;
    } catch (err) {
      errors.push(`Przejazd #${m.id} (${m.date}): ${err.message}`);
    }
  }

  const totalPushed = pushedClients + pushedProjects + pushedInvoices + pushedExpenses + pushedTimeEntries + pushedMileage + pushedDeletions;
  _recordHistory(db, 'push', totalPushed, 0, errors.length ? 'error' : 'success', errors.join('; '));
  settings.set('sync_last_push', String(Date.now()));

  return { pushedClients, pushedProjects, pushedInvoices, pushedExpenses, pushedTimeEntries, pushedMileage, pushedDeletions, errors };
}

// ── Pull: cloud → local ─────────────────────────────────────────────────────

async function pullCloudChanges() {
  const db = getDb();
  const client = _getClient();
  await _ensureSession(client);

  const contacts = require('./contacts');
  const projectsModule = require('./projects');
  const invoicesModule = require('./invoices');
  const expensesModule = require('./expenses');
  const timeModule = require('./time-tracking');
  const mileageModule = require('./mileage');

  let pulledClients = 0, pulledProjects = 0, pulledInvoices = 0, pulledExpenses = 0, pulledTimeEntries = 0, pulledMileage = 0;
  let deletedInvoices = 0, deletedExpenses = 0;
  const errors = [];

  // Map a cloud UUID FK back to the local integer id
  const _localClientId = (cloudId) =>
    cloudId ? (db.prepare('SELECT id FROM clients WHERE cloud_id = ?').get(cloudId)?.id || null) : null;
  const _localProjectId = (cloudId) =>
    cloudId ? (db.prepare('SELECT id FROM projects WHERE cloud_id = ?').get(cloudId)?.id || null) : null;
  const _localInvoiceId = (cloudId) =>
    cloudId ? (db.prepare('SELECT id FROM invoices WHERE cloud_id = ?').get(cloudId)?.id || null) : null;

  // 1. Clients
  const localClientCloudIds = new Set(
    db.prepare(`SELECT cloud_id FROM clients WHERE cloud_id IS NOT NULL`).all().map(r => r.cloud_id)
  );
  const { data: cloudClients, error: clErr } = await client.from('clients').select('*');
  if (clErr) throw new Error('Pobieranie klientów z chmury nieudane: ' + clErr.message);

  for (const cc of cloudClients || []) {
    if (localClientCloudIds.has(cc.id)) continue;
    try {
      const result = contacts.create({
        name: cc.name, company_name: cc.company_name, email: cc.email, phone: cc.phone,
        address: cc.address, postcode: cc.postcode, city: cc.city, country: cc.country,
        vat_number: cc.vat_number, btw_rate: cc.btw_rate, btw_reverse_charge: cc.btw_reverse_charge,
        currency: cc.currency, notes: cc.notes, status: cc.status
      });
      db.prepare(`UPDATE clients SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cc.id, result.id);
      pulledClients++;
    } catch (err) {
      errors.push(`Klient z chmury "${cc.name}": ${err.message}`);
    }
  }

  // 2. Projects — before invoices/expenses/time_entries so project_id can be mapped
  const localProjectCloudIds = new Set(
    db.prepare(`SELECT cloud_id FROM projects WHERE cloud_id IS NOT NULL`).all().map(r => r.cloud_id)
  );
  const { data: cloudProjects, error: prErr } = await client.from('projects').select('*');
  if (prErr) throw new Error('Pobieranie projektów z chmury nieudane: ' + prErr.message);

  for (const cp of cloudProjects || []) {
    if (localProjectCloudIds.has(cp.id)) continue;
    try {
      const result = projectsModule.create({
        name: cp.name, client_id: _localClientId(cp.client_id), description: cp.description,
        status: cp.status, start_date: cp.start_date, end_date: cp.end_date,
        hourly_rate: cp.hourly_rate, budget_hours: cp.budget_hours, budget_amount: cp.budget_amount,
        currency: cp.currency, youtube_episode: cp.youtube_episode
      });
      db.prepare(`UPDATE projects SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cp.id, result.id);
      pulledProjects++;
    } catch (err) {
      errors.push(`Projekt z chmury "${cp.name}": ${err.message}`);
    }
  }

  // 3. Invoices (+ items)
  const localInvoiceCloudIds = new Set(
    db.prepare(`SELECT cloud_id FROM invoices WHERE cloud_id IS NOT NULL`).all().map(r => r.cloud_id)
  );
  const { data: cloudInvoices, error: invErr } = await client.from('invoices').select('*, invoice_items(*)');
  if (invErr) throw new Error('Pobieranie faktur z chmury nieudane: ' + invErr.message);

  for (const ci of cloudInvoices || []) {
    if (localInvoiceCloudIds.has(ci.id)) continue;
    try {
      const items = (ci.invoice_items || []).map(it => ({
        description: it.description, quantity: it.quantity, unit: it.unit,
        unit_price: it.unit_price, btw_rate: it.btw_rate
      }));
      const result = invoicesModule.create({
        invoice_number: ci.invoice_number, client_id: _localClientId(ci.client_id),
        project_id: _localProjectId(ci.project_id), status: ci.status,
        issue_date: ci.issue_date, due_date: ci.due_date, paid_date: ci.paid_date,
        sale_date: ci.sale_date,
        currency: ci.currency, exchange_rate: ci.exchange_rate, btw_rate: ci.btw_rate,
        btw_reverse_charge: ci.btw_reverse_charge, notes: ci.notes, reference: ci.reference,
        items
      });
      db.prepare(`UPDATE invoices SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(ci.id, result.id);
      pulledInvoices++;
    } catch (err) {
      errors.push(`Faktura z chmury ${ci.invoice_number || ci.id}: ${err.message}`);
    }
  }

  // Rekoncyliacja usunięć: lokalne faktury z cloud_id, których już nie ma w chmurze
  // (skasowane na drugim urządzeniu) → usuń lokalnie. Bezpieczne: fetch się powiódł
  // (inaczej byłby throw wyżej), kasujemy tylko rekordy wcześniej zsynchronizowane.
  {
    const cloudIdSet = new Set((cloudInvoices || []).map(r => r.id));
    const localSynced = db.prepare('SELECT id, cloud_id FROM invoices WHERE cloud_id IS NOT NULL').all();
    for (const row of localSynced) {
      if (!cloudIdSet.has(row.cloud_id)) {
        try { invoicesModule.delete(row.id, { fromCloudSync: true }); deletedInvoices++; }
        catch (err) { errors.push(`Lokalne usunięcie faktury #${row.id}: ${err.message}`); }
      }
    }
  }

  // 4. Expenses (+ receipt photo download from Storage)
  const localExpenseCloudIds = new Set(
    db.prepare(`SELECT cloud_id FROM expenses WHERE cloud_id IS NOT NULL`).all().map(r => r.cloud_id)
  );
  const { data: cloudExpenses, error: expErr } = await client.from('expenses').select('*');
  if (expErr) throw new Error('Pobieranie kosztów z chmury nieudane: ' + expErr.message);

  for (const ce of cloudExpenses || []) {
    if (localExpenseCloudIds.has(ce.id)) continue;
    try {
      const result = expensesModule.create({
        project_id: _localProjectId(ce.project_id),
        category: ce.category, description: ce.description, amount: ce.amount, currency: ce.currency,
        exchange_rate: ce.exchange_rate, btw_rate: ce.btw_rate, btw_deductible: ce.btw_deductible,
        date: ce.date, vendor: ce.vendor, is_deductible: ce.is_deductible, notes: ce.notes
      });

      if (ce.receipt_storage_path) {
        try {
          const { data: fileData, error: dlErr } = await client.storage.from('receipts').download(ce.receipt_storage_path);
          if (!dlErr && fileData) {
            const tmpPath = path.join(os.tmpdir(), `zzp-sync-${Date.now()}${path.extname(ce.receipt_storage_path)}`);
            const buf = Buffer.from(await fileData.arrayBuffer());
            fs.writeFileSync(tmpPath, buf);
            expensesModule.saveReceipt(result.id, tmpPath);
            fs.unlinkSync(tmpPath);
          }
        } catch (_) {
          // Receipt download failure shouldn't block the expense record itself
          errors.push(`Koszt "${ce.description}": zapisano, ale nie udało się pobrać zdjęcia paragonu`);
        }
      }

      db.prepare(`UPDATE expenses SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(ce.id, result.id);
      pulledExpenses++;
    } catch (err) {
      errors.push(`Koszt z chmury "${ce.description}": ${err.message}`);
    }
  }

  // Rekoncyliacja usunięć kosztów (analogicznie do faktur).
  {
    const cloudIdSet = new Set((cloudExpenses || []).map(r => r.id));
    const localSynced = db.prepare('SELECT id, cloud_id FROM expenses WHERE cloud_id IS NOT NULL').all();
    for (const row of localSynced) {
      if (!cloudIdSet.has(row.cloud_id)) {
        try { expensesModule.delete(row.id, { fromCloudSync: true }); deletedExpenses++; }
        catch (err) { errors.push(`Lokalne usunięcie kosztu #${row.id}: ${err.message}`); }
      }
    }
  }

  // 5. Time entries
  const localTimeCloudIds = new Set(
    db.prepare(`SELECT cloud_id FROM time_entries WHERE cloud_id IS NOT NULL`).all().map(r => r.cloud_id)
  );
  const { data: cloudTimeEntries, error: teErr } = await client.from('time_entries').select('*');
  if (teErr) throw new Error('Pobieranie wpisów czasu z chmury nieudane: ' + teErr.message);

  for (const ct of cloudTimeEntries || []) {
    if (localTimeCloudIds.has(ct.id)) continue;
    try {
      const result = timeModule.create({
        project_id: _localProjectId(ct.project_id), invoice_id: _localInvoiceId(ct.invoice_id),
        category: ct.category, description: ct.description,
        start_time: ct.start_time, end_time: ct.end_time, duration_minutes: ct.duration_minutes,
        is_pomodoro: ct.is_pomodoro, is_billable: ct.is_billable, date: ct.date
      });
      db.prepare(`UPDATE time_entries SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(ct.id, result.id);
      pulledTimeEntries++;
    } catch (err) {
      errors.push(`Wpis czasu z chmury ${ct.date || ct.id}: ${err.message}`);
    }
  }

  // 6. Mileage (kilometrówka)
  const localMileageCloudIds = new Set(
    db.prepare(`SELECT cloud_id FROM mileage_entries WHERE cloud_id IS NOT NULL`).all().map(r => r.cloud_id)
  );
  const { data: cloudMileage, error: miErr } = await client.from('mileage_entries').select('*');
  if (miErr) throw new Error('Pobieranie kilometrówki z chmury nieudane: ' + miErr.message);

  for (const cm of cloudMileage || []) {
    if (localMileageCloudIds.has(cm.id)) continue;
    try {
      const result = mileageModule.create({
        date: cm.date, from_location: cm.from_location, to_location: cm.to_location,
        distance_km: cm.distance_km, is_return: cm.is_return, purpose: cm.purpose,
        client_id: _localClientId(cm.client_id), project_id: _localProjectId(cm.project_id),
        rate_per_km: cm.rate_per_km
      });
      db.prepare(`UPDATE mileage_entries SET cloud_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cm.id, result.id);
      pulledMileage++;
    } catch (err) {
      errors.push(`Przejazd z chmury ${cm.date || cm.id}: ${err.message}`);
    }
  }

  const totalPulled = pulledClients + pulledProjects + pulledInvoices + pulledExpenses + pulledTimeEntries + pulledMileage + deletedInvoices + deletedExpenses;
  _recordHistory(db, 'pull', 0, totalPulled, errors.length ? 'error' : 'success', errors.join('; '));
  settings.set('sync_last_pull', String(Date.now()));

  return { pulledClients, pulledProjects, pulledInvoices, pulledExpenses, pulledTimeEntries, pulledMileage, deletedInvoices, deletedExpenses, errors };
}

module.exports = {
  configureCredentials,
  testConnection,
  getStatus,
  getHistory,
  pushLocalChanges,
  pullCloudChanges
};

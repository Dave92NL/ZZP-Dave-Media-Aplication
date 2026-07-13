// Repozytorium danych — jedyna warstwa, przez którą strony sięgają po dane.
// Zasada:
//  - ODCZYT: online → pobierz z Supabase i zapisz do cache (write-through);
//            offline/błąd sieci → zwróć z cache IndexedDB. Do wyników doklejamy
//            wiersze „oczekujące" z outboxa (utworzone offline, jeszcze niewysłane).
//  - ZAPIS: online → od razu do Supabase (funkcje push*); offline → do outboxa.
//
// Funkcje push* wykonują faktyczny zapis do Supabase i są współdzielone przez
// ścieżkę online (create*) oraz silnik synchronizacji (sync.js → flushOutbox).

import { supabase } from '../supabase.js';
import * as idb from './idb.js';
import * as outbox from './outbox.js';
import { compressReceiptPhoto } from '../lib/imageCompress.js';
import { generateNextInvoiceNumber, isUniqueViolation } from '../lib/invoiceNumber.js';

export function isOnline() {
  return navigator.onLine !== false;
}

function _receiptObjectPath(date) {
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/receipt_${crypto.randomUUID()}.jpg`;
}

async function _clientsById() {
  const rows = await idb.getAll('clients');
  const map = {};
  for (const c of rows) map[c.id] = c;
  return map;
}

// ── Prymitywy zapisu do Supabase (zakładają połączenie) ───────────────────────

export async function pushExpense(payload, receipt) {
  let receipt_storage_path = payload.receipt_storage_path || null;
  if (receipt) {
    const objectPath = _receiptObjectPath(payload.date);
    const { error: upErr } = await supabase.storage.from('receipts')
      .upload(objectPath, receipt, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw new Error('Zdjęcie paragonu: ' + upErr.message);
    receipt_storage_path = objectPath;
  }
  const { data, error } = await supabase.from('expenses')
    .insert({ ...payload, receipt_storage_path }).select().single();
  if (error) throw new Error(error.message);
  await idb.put('expenses', data);
  return data;
}

export async function pushInvoice(payload, items) {
  const MAX = 3;
  let lastErr = null;
  for (let attempt = 0; attempt < MAX; attempt++) {
    const invoice_number = payload.invoice_number || await generateNextInvoiceNumber(supabase);
    const { data: invRow, error } = await supabase.from('invoices')
      .insert({ ...payload, invoice_number }).select('id').single();
    if (error) {
      if (isUniqueViolation(error) && attempt < MAX - 1) { lastErr = error; continue; }
      throw new Error(error.message);
    }
    const itemsPayload = (items || []).map((it, i) => ({
      invoice_id: invRow.id, description: it.description, quantity: it.quantity,
      unit: it.unit, unit_price: it.unit_price, btw_rate: 0,
      total: (Number(it.quantity) || 1) * (Number(it.unit_price) || 0), sort_order: i
    }));
    if (itemsPayload.length) {
      const { error: itErr } = await supabase.from('invoice_items').insert(itemsPayload);
      if (itErr) throw new Error('pozycje faktury: ' + itErr.message);
    }
    return invRow.id;
  }
  throw new Error('nie udało się nadać unikalnego numeru faktury: ' + (lastErr?.message || ''));
}

export async function pushTimeEntry(payload) {
  const { data, error } = await supabase.from('time_entries').insert(payload).select().single();
  if (error) throw new Error(error.message);
  await idb.put('time_entries', data);
  return data;
}

// UWAGA: Postgres NIE odświeża updated_at przy UPDATE (default działa tylko przy
// INSERT, triggera brak) — każdy push-update MUSI jawnie ustawić updated_at,
// inaczej desktop nie zobaczy edycji (pull porównuje updated_at z synced_at).
function _stamp(patch) {
  return { ...patch, updated_at: new Date().toISOString() };
}

export async function pushUpdateTimeEntry(cloudId, patch) {
  const { data, error } = await supabase.from('time_entries')
    .update(_stamp(patch)).eq('id', cloudId).select().single();
  if (error) throw new Error(error.message);
  await idb.put('time_entries', data);
  return data;
}

export async function pushDeleteTimeEntry(cloudId) {
  const { error } = await supabase.from('time_entries').delete().eq('id', cloudId);
  if (error) throw new Error(error.message);
  await idb.del('time_entries', cloudId);
}

export async function pushProject(payload) {
  const { data, error } = await supabase.from('projects').insert(payload).select().single();
  if (error) throw new Error(error.message);
  await idb.put('projects', data);
  return data;
}

export async function pushClient(payload) {
  const { data, error } = await supabase.from('clients').insert(payload).select().single();
  if (error) throw new Error(error.message);
  await idb.put('clients', data);
  return data;
}

export async function pushUpdateExpense(cloudId, patch, receipt) {
  // Nowe zdjęcie paragonu = wymiana pliku w Storage (stary plik kasujemy).
  const stamped = _stamp(patch);
  if (receipt) {
    const { data: old } = await supabase.from('expenses').select('receipt_storage_path').eq('id', cloudId).maybeSingle();
    const objectPath = _receiptObjectPath(stamped.date || new Date().toISOString());
    const { error: upErr } = await supabase.storage.from('receipts')
      .upload(objectPath, receipt, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw new Error('Zdjęcie paragonu: ' + upErr.message);
    stamped.receipt_storage_path = objectPath;
    if (old && old.receipt_storage_path) {
      try { await supabase.storage.from('receipts').remove([old.receipt_storage_path]); } catch { /* stary plik — pomiń */ }
    }
  }
  const { data, error } = await supabase.from('expenses')
    .update(stamped).eq('id', cloudId).select().single();
  if (error) throw new Error(error.message);
  await idb.put('expenses', data);
  return data;
}

export async function pushUpdateInvoice(cloudId, header, items) {
  const { data, error } = await supabase.from('invoices')
    .update(_stamp(header)).eq('id', cloudId).select().single();
  if (error) throw new Error(error.message);
  if (Array.isArray(items)) {
    const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', cloudId);
    if (delErr) throw new Error('pozycje faktury: ' + delErr.message);
    const itemsPayload = items.map((it, i) => ({
      invoice_id: cloudId, description: it.description, quantity: it.quantity,
      unit: it.unit, unit_price: it.unit_price, btw_rate: it.btw_rate || 0,
      total: (Number(it.quantity) || 1) * (Number(it.unit_price) || 0), sort_order: i
    }));
    if (itemsPayload.length) {
      const { error: itErr } = await supabase.from('invoice_items').insert(itemsPayload);
      if (itErr) throw new Error('pozycje faktury: ' + itErr.message);
    }
  }
  await idb.put('invoices', data);
  return data;
}

export async function pushMileage(payload) {
  const { data, error } = await supabase.from('mileage_entries').insert(payload).select().single();
  if (error) throw new Error(error.message);
  await idb.put('mileage_entries', data);
  return data;
}

// ── Zapis wywoływany ze stron (decyduje online vs offline) ────────────────────

export async function createExpense(payload, photoFile) {
  const row = { ...payload, origin: 'phone' };
  let receipt = null;
  if (photoFile) {
    try { receipt = await compressReceiptPhoto(photoFile); } catch { receipt = photoFile; }
  }
  if (isOnline()) {
    const data = await pushExpense(row, receipt);
    return { synced: true, row: data };
  }
  const entry = await outbox.enqueue({ table: 'expenses', type: 'insert-expense', payload: row, receiptBlob: receipt });
  return { synced: false, row: outbox.toDisplayRow(entry) };
}

export async function createInvoice(header, items, status) {
  const base = {
    ...header, status, invoice_number: '', notes: '', reference: '',
    currency: 'EUR', exchange_rate: 1, origin: 'phone'
  };
  if (isOnline()) {
    const id = await pushInvoice(base, items);
    return { synced: true, id };
  }
  const entry = await outbox.enqueue({ table: 'invoices', type: 'insert-invoice', payload: base, items });
  return { synced: false, id: entry.localId };
}

export async function createTimeEntry(payload) {
  const row = { ...payload, origin: 'phone' };
  if (isOnline()) {
    const data = await pushTimeEntry(row);
    return { synced: true, row: data };
  }
  const entry = await outbox.enqueue({ table: 'time_entries', type: 'insert-time-entry', payload: row });
  return { synced: false, row: outbox.toDisplayRow(entry) };
}

export async function updateTimeEntry(id, patch) {
  // Rekord utworzony offline i jeszcze niewysłany → popraw payload w outboxie
  // (nie tworzymy osobnej operacji update, bo insert jeszcze nie poszedł do chmury).
  const pending = await idb.get('outbox', id);
  if (pending && pending.type === 'insert-time-entry') {
    pending.payload = { ...pending.payload, ...patch };
    await idb.put('outbox', pending);
    return { synced: false, row: outbox.toDisplayRow(pending) };
  }
  if (isOnline()) {
    const data = await pushUpdateTimeEntry(id, patch);
    return { synced: true, row: data };
  }
  await outbox.enqueue({ table: 'time_entries', type: 'update-time-entry', payload: { id, ...patch } });
  // Optymistycznie zaktualizuj cache, by zmiana była widoczna od razu.
  const cached = await idb.get('time_entries', id);
  if (cached) await idb.put('time_entries', { ...cached, ...patch });
  return { synced: false };
}

// Edycja kosztu (patch pól + opcjonalnie nowe zdjęcie paragonu).
// Rekord z outboxa (utworzony offline) → scal patch do payloadu w kolejce.
export async function updateExpense(id, patch, photoFile) {
  let receipt = null;
  if (photoFile) {
    try { receipt = await compressReceiptPhoto(photoFile); } catch { receipt = photoFile; }
  }
  const pending = await idb.get('outbox', id);
  if (pending && pending.type === 'insert-expense') {
    pending.payload = { ...pending.payload, ...patch };
    if (receipt) pending.receiptBlob = receipt;
    await idb.put('outbox', pending);
    return { synced: false, row: outbox.toDisplayRow(pending) };
  }
  if (isOnline()) {
    const data = await pushUpdateExpense(id, patch, receipt);
    return { synced: true, row: data };
  }
  await outbox.enqueue({ table: 'expenses', type: 'update-expense', payload: { id, ...patch }, receiptBlob: receipt });
  const cached = await idb.get('expenses', id);
  if (cached) await idb.put('expenses', { ...cached, ...patch });
  return { synced: false };
}

// Edycja faktury (nagłówek + pełna lista pozycji).
export async function updateInvoice(id, header, items) {
  const pending = await idb.get('outbox', id);
  if (pending && pending.type === 'insert-invoice') {
    pending.payload = { ...pending.payload, ...header };
    pending.items = items;
    await idb.put('outbox', pending);
    return { synced: false };
  }
  if (isOnline()) {
    await pushUpdateInvoice(id, header, items);
    return { synced: true };
  }
  await outbox.enqueue({ table: 'invoices', type: 'update-invoice', payload: { id, ...header }, items });
  const cached = await idb.get('invoices', id);
  if (cached) await idb.put('invoices', { ...cached, ...header });
  return { synced: false };
}

export async function deleteTimeEntry(id) {
  // Rekord utworzony offline i jeszcze niewysłany → usuń tylko wpis z outboxa.
  const pending = await idb.get('outbox', id);
  if (pending) { await outbox.remove(id); await idb.del('time_entries', id); return { synced: false, removedPending: true }; }
  if (isOnline()) { await pushDeleteTimeEntry(id); return { synced: true }; }
  await outbox.enqueue({ table: 'time_entries', type: 'delete-time-entry', payload: { id } });
  await idb.del('time_entries', id); // optymistycznie znika z widoku
  return { synced: false };
}

export async function createProject(payload) {
  const row = { ...payload, origin: 'phone' };
  if (isOnline()) {
    const data = await pushProject(row);
    return { synced: true, row: data };
  }
  const entry = await outbox.enqueue({ table: 'projects', type: 'insert-project', payload: row });
  return { synced: false, row: outbox.toDisplayRow(entry) };
}

export async function createClient(payload) {
  const row = { ...payload, origin: 'phone' };
  if (isOnline()) {
    const data = await pushClient(row);
    return { synced: true, row: data };
  }
  const entry = await outbox.enqueue({ table: 'clients', type: 'insert-client', payload: row });
  return { synced: false, row: outbox.toDisplayRow(entry) };
}

export async function createMileage(payload) {
  const row = { ...payload, origin: 'phone' };
  if (isOnline()) {
    const data = await pushMileage(row);
    return { synced: true, row: data };
  }
  const entry = await outbox.enqueue({ table: 'mileage_entries', type: 'insert-mileage', payload: row });
  return { synced: false, row: outbox.toDisplayRow(entry) };
}

// ── Usuwanie (propagowane do chmury lub kolejkowane offline) ──────────────────

export async function pushDeleteExpense(cloudId) {
  // Sprzątnij plik paragonu w Storage, potem skasuj wiersz.
  try {
    const { data } = await supabase.from('expenses').select('receipt_storage_path').eq('id', cloudId).maybeSingle();
    if (data && data.receipt_storage_path) {
      try { await supabase.storage.from('receipts').remove([data.receipt_storage_path]); } catch { /* brak pliku */ }
    }
  } catch { /* brak dostępu do rekordu — i tak próbujemy skasować */ }
  const { error } = await supabase.from('expenses').delete().eq('id', cloudId);
  if (error) throw new Error(error.message);
  await idb.del('expenses', cloudId);
}

export async function pushDeleteInvoice(cloudId) {
  // invoice_items w chmurze mają ON DELETE CASCADE.
  const { error } = await supabase.from('invoices').delete().eq('id', cloudId);
  if (error) throw new Error(error.message);
  await idb.del('invoices', cloudId);
}

export async function deleteExpense(id) {
  // Rekord utworzony offline i jeszcze niewysłany → usuń tylko wpis z outboxa.
  const pending = await idb.get('outbox', id);
  if (pending) { await outbox.remove(id); await idb.del('expenses', id); return { synced: false, removedPending: true }; }
  if (isOnline()) { await pushDeleteExpense(id); return { synced: true }; }
  await outbox.enqueue({ table: 'expenses', type: 'delete-expense', payload: { id } });
  await idb.del('expenses', id); // optymistycznie znika z widoku
  return { synced: false };
}

export async function deleteInvoice(id) {
  const pending = await idb.get('outbox', id);
  if (pending) { await outbox.remove(id); await idb.del('invoices', id); return { synced: false, removedPending: true }; }
  if (isOnline()) { await pushDeleteInvoice(id); return { synced: true }; }
  await outbox.enqueue({ table: 'invoices', type: 'delete-invoice', payload: { id } });
  await idb.del('invoices', id);
  return { synced: false };
}

// ── Odczyt (write-through cache + nakładka oczekujących) ───────────────────────

export async function refreshCoreCaches() {
  if (!isOnline()) return;
  for (const [table, query] of [
    ['clients', supabase.from('clients').select('*')],
    ['projects', supabase.from('projects').select('*')]
  ]) {
    try {
      const { data, error } = await query;
      if (!error && data) await idb.replaceAll(table, data);
    } catch { /* offline — zostaje cache */ }
  }
}

export async function listExpenses() {
  let server;
  try {
    const { data, error } = await supabase.from('expenses').select('*')
      .order('date', { ascending: false }).limit(200);
    if (error) throw error;
    server = data || [];
    await idb.replaceAll('expenses', server);
  } catch {
    server = (await idb.getAll('expenses')).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }
  const pending = (await outbox.forTable('expenses')).filter(e => e.type === 'insert-expense').map(outbox.toDisplayRow);
  return [...pending, ...server];
}

export async function getExpense(id) {
  const entry = await idb.get('outbox', id);
  if (entry) {
    const row = outbox.toDisplayRow(entry);
    row._receiptBlob = entry.receiptBlob || null;
    return row;
  }
  try {
    const { data, error } = await supabase.from('expenses').select('*').eq('id', id).single();
    if (error) throw error;
    await idb.put('expenses', data);
    return data;
  } catch {
    return (await idb.get('expenses', id)) || null;
  }
}

export async function listInvoices() {
  let server;
  try {
    const { data, error } = await supabase.from('invoices')
      .select('*, clients(name, company_name)')
      .order('issue_date', { ascending: false }).limit(200);
    if (error) throw error;
    server = data || [];
    await idb.replaceAll('invoices', server);
  } catch {
    server = (await idb.getAll('invoices')).sort((a, b) => String(b.issue_date || '').localeCompare(String(a.issue_date || '')));
  }
  const clientsById = await _clientsById();
  const pending = (await outbox.forTable('invoices')).filter(e => e.type === 'insert-invoice').map(e => {
    const row = outbox.toDisplayRow(e);
    row.clients = clientsById[row.client_id] || null;
    return row;
  });
  return [...pending, ...server];
}

export async function getInvoice(id) {
  const entry = await idb.get('outbox', id);
  if (entry) {
    const row = outbox.toDisplayRow(entry);
    const clientsById = await _clientsById();
    row.clients = clientsById[row.client_id] || null;
    row.invoice_items = (entry.items || []).map((it, i) => ({
      ...it, total: (Number(it.quantity) || 1) * (Number(it.unit_price) || 0), sort_order: i
    }));
    return row;
  }
  try {
    const { data, error } = await supabase.from('invoices')
      .select('*, clients(name, company_name, address, postcode, city, country, vat_number, email), invoice_items(*)')
      .eq('id', id).single();
    if (error) throw error;
    await idb.put('invoices', data);
    for (const it of data.invoice_items || []) await idb.put('invoice_items', it);
    return data;
  } catch {
    const inv = await idb.get('invoices', id);
    if (!inv) return null;
    const allItems = await idb.getAll('invoice_items');
    inv.invoice_items = allItems.filter(it => it.invoice_id === id);
    if (!inv.clients) {
      const clientsById = await _clientsById();
      inv.clients = clientsById[inv.client_id] || null;
    }
    return inv;
  }
}

export async function listActiveClients() {
  let server;
  try {
    const { data, error } = await supabase.from('clients').select('*').eq('status', 'active').order('name');
    if (error) throw error;
    server = data || [];
    for (const c of server) await idb.put('clients', c);
  } catch {
    server = (await idb.getAll('clients'))
      .filter(c => c.status === 'active')
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }
  const pending = (await outbox.forTable('clients')).map(outbox.toDisplayRow);
  return [...pending, ...server];
}

export async function listAllClients() {
  let server;
  try {
    const { data, error } = await supabase.from('clients').select('*').order('name');
    if (error) throw error;
    server = data || [];
    await idb.replaceAll('clients', server);
  } catch {
    server = (await idb.getAll('clients'))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }
  const pending = (await outbox.forTable('clients')).map(outbox.toDisplayRow);
  return [...pending, ...server];
}

export async function listProjects() {
  let server;
  try {
    const { data, error } = await supabase.from('projects').select('*').order('name');
    if (error) throw error;
    server = data || [];
    await idb.replaceAll('projects', server);
  } catch {
    server = (await idb.getAll('projects'))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }
  const pending = (await outbox.forTable('projects')).map(outbox.toDisplayRow);
  return [...pending, ...server];
}

export async function listTimeEntries(limit = 100) {
  let server;
  try {
    const { data, error } = await supabase.from('time_entries').select('*')
      .order('date', { ascending: false }).limit(limit);
    if (error) throw error;
    server = data || [];
    await idb.replaceAll('time_entries', server);
  } catch {
    server = (await idb.getAll('time_entries'))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }
  const pending = (await outbox.forTable('time_entries'))
    .filter(e => e.type === 'insert-time-entry').map(outbox.toDisplayRow);
  const rows = [...pending, ...server];
  // dopnij nazwę projektu z cache
  const projById = {};
  for (const p of await idb.getAll('projects')) projById[p.id] = p;
  for (const r of rows) r.project_name = r.project_id ? (projById[r.project_id]?.name || null) : null;
  return rows;
}

export async function listMileage(limit = 100) {
  let server;
  try {
    const { data, error } = await supabase.from('mileage_entries').select('*')
      .order('date', { ascending: false }).limit(limit);
    if (error) throw error;
    server = data || [];
    await idb.replaceAll('mileage_entries', server);
  } catch {
    server = (await idb.getAll('mileage_entries'))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }
  const pending = (await outbox.forTable('mileage_entries')).map(outbox.toDisplayRow);
  const rows = [...pending, ...server];
  // dopnij nazwę projektu/klienta z cache
  const projById = {};
  for (const p of await idb.getAll('projects')) projById[p.id] = p;
  const clientById = await _clientsById();
  for (const r of rows) {
    r.project_name = r.project_id ? (projById[r.project_id]?.name || null) : null;
    r.client_name = r.client_id ? (clientById[r.client_id]?.name || null) : null;
  }
  return rows;
}

// ── Stan działającego licznika czasu (przeżywa zamknięcie aplikacji) ──────────
const TIMER_KEY = 'runningTimer';

export async function getRunningTimer() {
  const rec = await idb.get('meta', TIMER_KEY);
  return rec?.value || null;
}

export async function setRunningTimer(timer) {
  await idb.put('meta', { key: TIMER_KEY, value: timer });
}

export async function clearRunningTimer() {
  await idb.del('meta', TIMER_KEY);
}

// Oznaczenie faktury jako zapłaconej (status + data zapłaty).
// Tylko online — desktop liczy przychód po paid_date, więc wymaga zapisu w chmurze.
export async function markInvoicePaid(id, paidDate) {
  if (!isOnline()) throw new Error('Oznaczenie jako zapłacona wymaga połączenia z internetem.');
  const { data, error } = await supabase.from('invoices')
    .update(_stamp({ status: 'paid', paid_date: paidDate })).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  await idb.put('invoices', data);
  return data;
}

// Lekka sygnatura stanu chmury (faktury, koszty, godzinówka, kilometrówka) do
// wykrywania zmian z drugiego urządzenia bez pobierania całych rekordów. Zmienia
// się przy dodaniu (nowe id), usunięciu (brak id) i edycji (nowy updated_at).
// Zwraca null przy błędzie/offline.
export async function remoteChangeSignature() {
  if (!isOnline()) return null;
  try {
    const [inv, exp, tim, mil] = await Promise.all([
      supabase.from('invoices').select('id, updated_at'),
      supabase.from('expenses').select('id, updated_at'),
      supabase.from('time_entries').select('id, updated_at'),
      supabase.from('mileage_entries').select('id, updated_at')
    ]);
    if (inv.error || exp.error || tim.error || mil.error) return null;
    const sig = (rows) => (rows || []).map(r => `${r.id}:${r.updated_at || ''}`).sort().join('|');
    return `I${sig(inv.data)}#E${sig(exp.data)}#T${sig(tim.data)}#M${sig(mil.data)}`;
  } catch {
    return null;
  }
}

export async function getReceiptUrl(storagePath) {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 600);
    if (error) throw error;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

// Kolejka wysyłki (outbox) — operacje zapisu wykonane offline, czekające na
// synchronizację z Supabase. Każdy wpis:
//   { localId, table, type, payload, items?, receiptBlob?, createdAt, error? }
// gdzie:
//   table   — której listy dotyczy (do nakładki „oczekujące": 'expenses' | 'invoices' | 'time_entries' | 'mileage_entries')
//   type    — 'insert-*' (expense/invoice/time-entry/mileage/project/client),
//             'update-time-entry' | 'update-expense' | 'update-invoice'
//             (payload: { id, ...zmienione pola }; update-invoice ma też items) lub
//             'delete-expense' | 'delete-invoice' | 'delete-time-entry'
//             (delete-*/update-* niosą payload.id rekordu w chmurze; nie są renderowane na listach)
//   payload — pola rekordu (bez serwerowego id)
//   items   — pozycje faktury (tylko dla 'insert-invoice')
//   receiptBlob — skompresowane zdjęcie paragonu (tylko dla 'insert-expense', opcjonalnie)

import * as idb from './idb.js';

function _notifyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('zzp-outbox-changed'));
}

export function newLocalId() {
  return (crypto?.randomUUID?.() || `loc-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export async function enqueue(entry) {
  const record = {
    localId: entry.localId || newLocalId(),
    table: entry.table,
    type: entry.type,
    payload: entry.payload || {},
    items: entry.items || null,
    receiptBlob: entry.receiptBlob || null,
    createdAt: Date.now(),
    error: null
  };
  await idb.put('outbox', record);
  _notifyChanged();
  return record;
}

export async function all() {
  const rows = await idb.getAll('outbox');
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function forTable(table) {
  const rows = await all();
  return rows.filter(r => r.table === table);
}

export async function count() {
  return (await idb.getAll('outbox')).length;
}

export async function remove(localId) {
  const r = await idb.del('outbox', localId);
  _notifyChanged();
  return r;
}

export async function setError(localId, message) {
  const rec = await idb.get('outbox', localId);
  if (rec) { rec.error = message || null; await idb.put('outbox', rec); }
}

// Zamienia wpis outboxa na obiekt wiersza do wyświetlenia na liście —
// z id = localId i znacznikiem _pending, żeby UI mogło pokazać „⏳ oczekuje".
export function toDisplayRow(entry) {
  return {
    ...entry.payload,
    id: entry.localId,
    _pending: true,
    _hasReceiptBlob: !!entry.receiptBlob,
    _items: entry.items || undefined
  };
}

// Minimalny promise'owy wrapper na IndexedDB — magazyn lokalny dla trybu offline.
//
// Magazyny (object stores):
//  - cache serwerowy (keyPath 'id'): clients, projects, invoices, invoice_items,
//    expenses, time_entries — kopia danych pobranych z Supabase, do odczytu offline.
//  - outbox (keyPath 'localId'): operacje zapisu oczekujące na wysłanie do chmury.
//  - meta (keyPath 'key'): stan pomocniczy (np. działający licznik czasu, znaczniki sync).

const DB_NAME = 'zzp-mobile';
const DB_VERSION = 1;

export const CACHE_STORES = [
  'clients', 'projects', 'invoices', 'invoice_items', 'expenses', 'time_entries'
];

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of CACHE_STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'localId' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function _tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function _wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await openDb();
  return _wrap(_tx(db, store, 'readonly').getAll());
}

export async function get(store, key) {
  const db = await openDb();
  return _wrap(_tx(db, store, 'readonly').get(key));
}

export async function put(store, value) {
  const db = await openDb();
  return _wrap(_tx(db, store, 'readwrite').put(value));
}

export async function del(store, key) {
  const db = await openDb();
  return _wrap(_tx(db, store, 'readwrite').delete(key));
}

export async function clear(store) {
  const db = await openDb();
  return _wrap(_tx(db, store, 'readwrite').clear());
}

// Podmienia całą zawartość magazynu cache na świeży zestaw rekordów z serwera.
export async function replaceAll(store, rows) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    os.clear();
    for (const row of rows || []) os.put(row);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

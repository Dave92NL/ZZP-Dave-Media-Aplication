// Ustawienia lokalne aplikacji mobilnej (na tym urządzeniu — NIE synchronizowane
// z chmurą ani desktopem). Trzymane w IndexedDB (store `meta`, klucz `appSettings`).
//  - displayName: nazwa do powitania „Witaj, …" na pulpicie
//  - company: dane sprzedawcy do podglądu dokumentu faktury (patrz companyProfile.js)

import * as idb from './idb.js';
import { COMPANY } from '../lib/companyProfile.js';

const KEY = 'appSettings';
export const COMPANY_FIELDS = [
  'name', 'address', 'postcode', 'city', 'country',
  'kvk_number', 'btw_number', 'iban', 'email', 'phone'
];

let _cache = null;

export async function getSettings() {
  if (_cache) return _cache;
  let stored = {};
  try {
    const rec = await idb.get('meta', KEY);
    stored = rec?.value || {};
  } catch { /* brak / błąd IndexedDB → domyślne */ }
  _cache = {
    displayName: stored.displayName || '',
    company: { ...COMPANY, ...(stored.company || {}) }
  };
  return _cache;
}

export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = {
    displayName: patch.displayName ?? cur.displayName,
    company: { ...cur.company, ...(patch.company || {}) }
  };
  _cache = next;
  await idb.put('meta', { key: KEY, value: next });
  return next;
}

// Wygodne skróty
export async function getDisplayName() {
  return (await getSettings()).displayName || '';
}
export async function getCompany() {
  return (await getSettings()).company;
}

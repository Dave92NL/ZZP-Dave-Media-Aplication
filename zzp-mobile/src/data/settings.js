// Ustawienia aplikacji mobilnej.
//  - displayName: nazwa do powitania „Witaj, …" — ustawienie LOKALNE na telefonie
//    (IndexedDB `meta`, klucz `appSettings`).
//  - company: dane sprzedawcy do podglądu faktury — POBIERANE Z CHMURY (tabela
//    `company_profile` zasilana z aplikacji na komputerze). Telefon tylko czyta;
//    offline korzysta z ostatniej kopii w cache (`meta`/`cloudCompany`), a gdy nic
//    nie ma — z domyślnego szablonu `COMPANY`.

import * as idb from './idb.js';
import { supabase } from '../supabase.js';
import { COMPANY } from '../lib/companyProfile.js';

const KEY = 'appSettings';
const CLOUD_KEY = 'cloudCompany';
export const COMPANY_FIELDS = [
  'name', 'address', 'postcode', 'city', 'country',
  'kvk_number', 'btw_number', 'iban', 'email', 'phone'
];

let _cache = null;         // { displayName, company (lokalny fallback) }
let _companyCache = null;  // scalony profil firmy (chmura → lokalny → domyślny)

function pickCompany(row) {
  const out = {};
  for (const f of COMPANY_FIELDS) out[f] = row?.[f] ?? '';
  return out;
}

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

// Zapisuje TYLKO ustawienia lokalne (displayName). Dane firmy pochodzą z komputera.
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

export async function getDisplayName() {
  return (await getSettings()).displayName || '';
}

// Profil firmy: chmura (źródło prawdy z desktopu) → cache offline → lokalny → domyślny.
export async function getCompany({ force = false } = {}) {
  if (!force && _companyCache) return _companyCache;

  let cloud = null;
  if (navigator.onLine !== false) {
    try {
      const { data, error } = await supabase.from('company_profile').select('*').limit(1).maybeSingle();
      if (!error && data) cloud = data;
    } catch { /* offline / błąd → fallback */ }
  }

  if (cloud) {
    try { await idb.put('meta', { key: CLOUD_KEY, value: cloud }); } catch { /* ignore */ }
  } else {
    try { const rec = await idb.get('meta', CLOUD_KEY); cloud = rec?.value || null; } catch { /* ignore */ }
  }

  let merged;
  if (cloud) {
    // Komputer jest źródłem prawdy — nadpisuje lokalne (także puste pola).
    merged = { ...COMPANY, ...pickCompany(cloud) };
    merged._source = 'cloud';
  } else {
    const local = (await getSettings()).company;
    merged = { ...COMPANY, ...local };
    merged._source = 'local';
  }
  _companyCache = merged;
  return merged;
}

// Wymusza ponowne pobranie profilu firmy z chmury (przycisk „Odśwież z komputera").
export async function refreshCompany() {
  _companyCache = null;
  return getCompany({ force: true });
}

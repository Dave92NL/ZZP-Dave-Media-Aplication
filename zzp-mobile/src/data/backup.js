// Kopia zapasowa danych z chmury (Supabase) → obiekt JSON do zapisania/udostępnienia.
// Obejmuje te same tabele co synchronizacja (rdzeń finansowy). RLS zawęża wynik do
// danych zalogowanego użytkownika, tak jak wszystkie odczyty w aplikacji.
// Paragony (pliki) NIE są dołączane — zostają w Supabase Storage; w JSON jest tylko
// referencja `receipt_storage_path`.

import { supabase } from '../supabase.js';
import { getSession } from '../auth.js';

// Kolejność: rodzice przed dziećmi (ułatwia ewentualne przyszłe przywracanie).
export const BACKUP_TABLES = [
  'clients',
  'projects',
  'invoices',
  'invoice_items',
  'expenses',
  'time_entries',
  'mileage_entries'
];

export async function buildCloudBackup() {
  const session = await getSession();
  if (!session) throw new Error('Musisz być zalogowany, aby utworzyć kopię zapasową.');

  const tables = {};
  const counts = {};
  const errors = {};

  for (const t of BACKUP_TABLES) {
    try {
      const { data, error } = await supabase.from(t).select('*');
      if (error) throw error;
      tables[t] = data || [];
      counts[t] = tables[t].length;
    } catch (err) {
      tables[t] = [];
      counts[t] = 0;
      errors[t] = err.message || String(err);
    }
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  return {
    app: 'zzp-manager',
    kind: 'cloud-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    user_email: session.user?.email || null,
    counts,
    total,
    errors: Object.keys(errors).length ? errors : undefined,
    tables
  };
}

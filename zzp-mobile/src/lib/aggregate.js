// Agregacje na potrzeby pulpitu: grupowanie miesięczne przychodów/kosztów oraz
// zmiany procentowe. „Przychód netto" liczymy z faktur OPŁACONYCH po `paid_date`
// (parytet z desktopem), z fallbackiem na `issue_date` gdy brak `paid_date`.

export const sumBy = (arr, fn) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);

export function monthKey(dateStr) {
  return String(dateStr || '').slice(0, 7); // 'YYYY-MM'
}

// Ostatnie n miesięcy (włącznie z bieżącym lub `endDate`), chronologicznie.
export function lastNMonths(n, endDate = new Date()) {
  const out = [];
  const d = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    out.push({
      key,
      date: m,
      short: m.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', ''),
      long: m.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
    });
  }
  return out;
}

// Data przypisania przychodu: opłacone → paid_date (lub issue_date), inne pomijamy.
function invoiceIncomeDate(inv) {
  if (inv.status === 'cancelled') return null;
  if (inv.status === 'paid') return inv.paid_date || inv.issue_date || null;
  return null; // tylko realny przychód (opłacone) — jak desktop
}

const invoiceAmount = (inv) => Number(inv.total_eur ?? inv.total ?? 0);
const expenseAmount = (exp) => Number(exp.amount_eur ?? exp.amount ?? 0);

// Suma przychodu (opłacone) per miesiąc, dopasowana do listy `months`.
export function revenueByMonth(invoices, months) {
  const map = {};
  for (const inv of invoices) {
    const d = invoiceIncomeDate(inv);
    if (!d) continue;
    const k = monthKey(d);
    map[k] = (map[k] || 0) + invoiceAmount(inv);
  }
  return months.map(m => map[m.key] || 0);
}

// Suma kosztów per miesiąc (po `date`).
export function costsByMonth(expenses, months) {
  const map = {};
  for (const e of expenses) {
    const k = monthKey(e.date);
    if (!k) continue;
    map[k] = (map[k] || 0) + expenseAmount(e);
  }
  return months.map(m => map[m.key] || 0);
}

// Zmiana procentowa cur vs prev; null gdy brak bazy.
export function pctChange(cur, prev) {
  if (!prev) return cur ? null : 0; // brak poprzedniej wartości → nieokreślona
  return ((cur - prev) / Math.abs(prev)) * 100;
}

// Sformatowanie „↑18%" / „↓7%"; zwraca { text, dir } gdzie dir: 'up'|'down'|'flat'.
export function formatDelta(pct) {
  if (pct == null) return { text: '—', dir: 'flat' };
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: '0%', dir: 'flat' };
  return { text: `${Math.abs(rounded)}%`, dir: rounded > 0 ? 'up' : 'down' };
}

export function fmtEur(amount) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount || 0);
}

export function fmtDateNL(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

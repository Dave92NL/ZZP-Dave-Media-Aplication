import { fmtEur, fmtDateNL, escHtml } from '../lib/format.js';
import { navigate } from '../router.js';
import * as repo from '../data/repo.js';

const sum = (arr, fn) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);

function monthLabel(d) {
  return d.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
}

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <h1 class="page-title">📊 Pulpit</h1>
      <div id="dash-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;

  const wrap = document.getElementById('dash-wrap');
  try {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = now.toISOString().slice(0, 10);

    const [invoices, expenses, timeEntries] = await Promise.all([
      repo.listInvoices(),
      repo.listExpenses(),
      repo.listTimeEntries(500)
    ]);

    const monthInvoices = invoices.filter(i => String(i.issue_date || '').startsWith(ym));
    const monthExpenses = expenses.filter(e => String(e.date || '').startsWith(ym));
    const monthTime = timeEntries.filter(t => String(t.date || '').startsWith(ym));

    const income = sum(monthInvoices, i => i.total_eur ?? i.total);
    const costs = sum(monthExpenses, e => e.amount_eur ?? e.amount);
    const profit = income - costs;

    const invBtw = sum(monthInvoices, i => i.btw_amount);
    const expBtw = sum(monthExpenses, e => e.btw_deductible ? e.btw_amount : 0);
    const vatDue = invBtw - expBtw;

    const minutes = sum(monthTime, t => t.duration_minutes);
    const hours = minutes / 60;

    // Faktury nieopłacone / przeterminowane (całościowo, nie tylko ten miesiąc)
    const outstanding = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled');
    const outstandingTotal = sum(outstanding, i => i.total_eur ?? i.total);
    const overdue = outstanding.filter(i => i.due_date && i.due_date < today && i.status !== 'draft');

    const tile = (label, value, cls = '') =>
      `<div class="stat-tile ${cls}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;

    wrap.innerHTML = `
      <div class="dash-period text-muted">${escHtml(monthLabel(now))}</div>

      <div class="stat-grid">
        ${tile('Przychód', fmtEur(income), 'stat-good')}
        ${tile('Koszty', fmtEur(costs), 'stat-bad')}
        ${tile('Zysk', fmtEur(profit), profit >= 0 ? 'stat-good' : 'stat-bad')}
        ${tile('VAT do zapłaty', fmtEur(vatDue))}
        ${tile('Godziny pracy', hours.toFixed(1) + ' h')}
        ${tile('Faktury (mies.)', String(monthInvoices.length))}
      </div>

      <h3 class="section-title">Do zapłaty przez klientów</h3>
      <div class="detail-block">
        <div class="totals-row"><span>Nieopłacone faktury</span><span>${outstanding.length} · ${fmtEur(outstandingTotal)}</span></div>
        <div class="totals-row"><span>Przeterminowane</span><span class="${overdue.length ? 'text-danger' : ''}">${overdue.length}</span></div>
      </div>

      ${overdue.length ? `
        <h3 class="section-title">🔴 Przeterminowane</h3>
        ${overdue.slice(0, 5).map(i => `
          <div class="list-card" data-id="${i.id}" role="button" tabindex="0">
            <div class="list-card-header">
              <span class="mono">${i._pending ? '⏳ oczekująca' : escHtml(i.invoice_number)}</span>
              <span class="text-muted">termin: ${fmtDateNL(i.due_date)}</span>
            </div>
            <div class="list-card-amount">${fmtEur(i.total_eur ?? i.total)}</div>
          </div>`).join('')}
      ` : ''}

      <div class="dash-actions">
        <button class="btn btn-primary btn-block" id="dash-add-expense">📷 Dodaj koszt</button>
        <button class="btn btn-secondary btn-block" id="dash-new-invoice">🧾 Nowa faktura</button>
      </div>
    `;

    wrap.querySelectorAll('.list-card[data-id]').forEach(card => {
      card.addEventListener('click', () => navigate(`invoice-detail/${card.dataset.id}`));
    });
    document.getElementById('dash-add-expense').addEventListener('click', () => navigate('add-expense'));
    document.getElementById('dash-new-invoice').addEventListener('click', () => navigate('new-invoice'));
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania pulpitu: ${escHtml(err.message)}</p>`;
  }
}

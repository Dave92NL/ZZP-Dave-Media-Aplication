import { navigate } from '../router.js';
import { fmtEur, fmtDateNL, escHtml } from '../lib/format.js';
import * as repo from '../data/repo.js';

const STATUS_BADGES = {
  draft: { icon: '📝', label: 'Szkic', cls: 'badge-muted' },
  sent: { icon: '📤', label: 'Wysłana', cls: 'badge-info' },
  paid: { icon: '✅', label: 'Opłacona', cls: 'badge-success' },
  overdue: { icon: '🔴', label: 'Przeterminowana', cls: 'badge-danger' },
  cancelled: { icon: '⛔', label: 'Anulowana', cls: 'badge-muted' }
};

// Wybrany rok utrzymywany między odświeżeniami (null = jeszcze nieustalony).
let _year = null;

function yearsFrom(rows) {
  const years = new Set();
  for (const r of rows) {
    const y = String(r.issue_date || '').slice(0, 4);
    if (/^\d{4}$/.test(y)) years.add(y);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <h1 class="page-title">📄 Faktury</h1>
      <div class="list-filter-bar">
        <label for="inv-year">Rok</label>
        <select id="inv-year"></select>
      </div>
      <div id="inv-summary" class="summary-box hidden"></div>
      <div id="inv-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;

  const wrap = document.getElementById('inv-list-wrap');
  const yearSel = document.getElementById('inv-year');
  let data = [];
  try {
    data = await repo.listInvoices();
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania faktur: ${escHtml(err.message)}</p>`;
    return;
  }

  const years = yearsFrom(data);
  const thisYear = String(new Date().getFullYear());
  if (_year === null) _year = years.includes(thisYear) ? thisYear : (years[0] || 'all');
  if (_year !== 'all' && !years.includes(_year)) _year = years[0] || 'all';

  yearSel.innerHTML = `<option value="all">Wszystkie lata</option>` +
    years.map(y => `<option value="${y}"${y === _year ? ' selected' : ''}>${y}</option>`).join('');
  if (_year === 'all') yearSel.value = 'all';

  yearSel.addEventListener('change', () => { _year = yearSel.value; renderList(); });
  renderList();

  function renderList() {
    const rows = _year === 'all' ? data : data.filter(i => String(i.issue_date || '').slice(0, 4) === _year);

    const summary = document.getElementById('inv-summary');
    if (rows.length) {
      const total = rows.reduce((s, i) => s + Number(i.total_eur ?? i.total ?? 0), 0);
      const paid = rows.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_eur ?? i.total ?? 0), 0);
      summary.classList.remove('hidden');
      summary.innerHTML = `
        <div><span class="text-muted">Faktury</span><strong>${rows.length}</strong></div>
        <div><span class="text-muted">Suma</span><strong>${fmtEur(total)}</strong></div>
        <div><span class="text-muted">Opłacone</span><strong>${fmtEur(paid)}</strong></div>`;
    } else {
      summary.classList.add('hidden');
    }

    if (!rows.length) {
      wrap.innerHTML = `<p class="text-muted">Brak faktur${_year === 'all' ? '' : ' w ' + _year + ' r.'}.</p>`;
      return;
    }

    wrap.innerHTML = rows.map(inv => {
      const badge = STATUS_BADGES[inv.status] || STATUS_BADGES.draft;
      const clientName = inv.clients?.company_name || inv.clients?.name || '—';
      const numberLabel = inv._pending ? '⏳ oczekująca' : escHtml(inv.invoice_number);
      return `
        <div class="list-card" data-id="${inv.id}" role="button" tabindex="0">
          <div class="list-card-header">
            <span class="mono">${numberLabel}</span>
            <span class="badge ${inv._pending ? 'badge-pending' : badge.cls}">${inv._pending ? '📥 offline' : `${badge.icon} ${badge.label}`}</span>
          </div>
          <div class="list-card-body">
            <div>${escHtml(clientName)}</div>
            <div class="text-muted">${fmtDateNL(inv.issue_date)}</div>
          </div>
          <div class="list-card-amount">${fmtEur(inv.total_eur ?? inv.total)}</div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.list-card[data-id]').forEach(card => {
      card.addEventListener('click', () => navigate(`invoice-detail/${card.dataset.id}`));
    });
  }
}

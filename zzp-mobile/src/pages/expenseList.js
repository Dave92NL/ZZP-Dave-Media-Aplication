import { navigate } from '../router.js';
import { fmtEur, fmtDateNL, escHtml } from '../lib/format.js';
import * as repo from '../data/repo.js';

// Wybrany rok utrzymywany między odświeżeniami (null = jeszcze nieustalony).
let _year = null;

function yearsFrom(rows) {
  const years = new Set();
  for (const r of rows) {
    const y = String(r.date || '').slice(0, 4);
    if (/^\d{4}$/.test(y)) years.add(y);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <h1 class="page-title">💸 Koszty</h1>
      <div class="list-filter-bar">
        <label for="exp-year">Rok</label>
        <select id="exp-year"></select>
      </div>
      <div id="exp-summary" class="summary-box hidden"></div>
      <div id="exp-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;

  const wrap = document.getElementById('exp-list-wrap');
  const yearSel = document.getElementById('exp-year');
  let data = [];
  try {
    data = await repo.listExpenses();
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania kosztów: ${escHtml(err.message)}</p>`;
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
    const rows = _year === 'all' ? data : data.filter(e => String(e.date || '').slice(0, 4) === _year);

    const summary = document.getElementById('exp-summary');
    if (rows.length) {
      const total = rows.reduce((s, e) => s + Number(e.amount_eur ?? e.amount ?? 0), 0);
      summary.classList.remove('hidden');
      summary.innerHTML = `
        <div><span class="text-muted">Liczba</span><strong>${rows.length}</strong></div>
        <div><span class="text-muted">Razem</span><strong>${fmtEur(total)}</strong></div>`;
    } else {
      summary.classList.add('hidden');
    }

    if (!rows.length) {
      wrap.innerHTML = `<p class="text-muted">Brak kosztów${_year === 'all' ? '' : ' w ' + _year + ' r.'}.</p>`;
      return;
    }

    wrap.innerHTML = rows.map(exp => {
      const hasPhoto = exp._pending ? exp._hasReceiptBlob : exp.receipt_storage_path;
      return `
      <div class="list-card" data-id="${exp.id}" role="button" tabindex="0">
        <div class="list-card-header">
          <span class="badge badge-info">${escHtml(exp.category)}</span>
          <span>
            ${exp._pending ? '<span class="badge badge-pending">⏳ oczekuje</span>' : ''}
            ${hasPhoto ? '<span title="Ma zdjęcie paragonu">📷</span>' : ''}
          </span>
        </div>
        <div class="list-card-body">
          <div>${escHtml(exp.description)}</div>
          <div class="text-muted">${escHtml(exp.vendor || '')} ${exp.vendor ? '·' : ''} ${fmtDateNL(exp.date)}</div>
        </div>
        <div class="list-card-amount">${fmtEur(exp.amount_eur ?? exp.amount)}</div>
      </div>`;
    }).join('');

    wrap.querySelectorAll('.list-card[data-id]').forEach(card => {
      card.addEventListener('click', () => navigate(`expense-detail/${card.dataset.id}`));
    });
  }
}

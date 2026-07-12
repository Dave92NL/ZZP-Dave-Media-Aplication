import { navigate } from '../router.js';
import { fmtEur, fmtDateNL, escHtml } from '../lib/format.js';
import * as repo from '../data/repo.js';
import { icon } from '../lib/icons.js';

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
      <div class="page-head">
        <h1 class="page-title">Koszty</h1>
      </div>
      <div class="list-filter-bar">
        <label for="exp-year">Rok</label>
        <select id="exp-year"></select>
      </div>
      <div id="exp-summary" class="summary-box hidden"></div>
      <div id="exp-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
    <button class="fab" id="exp-fab" aria-label="Dodaj koszt">${icon('plus', { size: 26 })}</button>
  `;

  document.getElementById('exp-fab').addEventListener('click', () => navigate('add-expense'));

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
        <div><span>Liczba</span><strong>${rows.length}</strong></div>
        <div><span>Razem</span><strong>${fmtEur(total)}</strong></div>`;
    } else {
      summary.classList.add('hidden');
    }

    if (!rows.length) {
      wrap.innerHTML = `<p class="text-muted">Brak kosztów${_year === 'all' ? '' : ' w ' + _year + ' r.'}.</p>`;
      return;
    }

    wrap.innerHTML = rows.map(exp => {
      const hasPhoto = exp._pending ? exp._hasReceiptBlob : exp.receipt_storage_path;
      const flags = [
        exp._pending ? '<span class="pill pill-yellow"><span class="pill-dot"></span>oczekuje</span>' : '',
        hasPhoto ? '<span class="pill pill-blue"><span class="pill-dot"></span>paragon</span>' : ''
      ].filter(Boolean).join(' ');
      return `
        <div class="row-card" data-id="${exp.id}" role="button" tabindex="0">
          <div class="row-chip">${icon('wallet', { size: 20 })}</div>
          <div class="row-main">
            <div class="row-main-title">${escHtml(exp.description || exp.category)}</div>
            <div class="row-main-sub">${escHtml(exp.vendor || exp.category)} · ${fmtDateNL(exp.date)}${flags ? ' · ' + flags : ''}</div>
          </div>
          <div class="row-end">
            <div class="row-amount">${fmtEur(exp.amount_eur ?? exp.amount)}</div>
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.row-card[data-id]').forEach(card => {
      card.addEventListener('click', () => navigate(`expense-detail/${card.dataset.id}`));
    });
  }
}

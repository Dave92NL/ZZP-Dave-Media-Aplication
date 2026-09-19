import { navigate } from '../router.js';
import { fmtEur, fmtDateNL, escHtml } from '../lib/format.js';
import * as repo from '../data/repo.js';
import { icon } from '../lib/icons.js';
import { isModern } from '../lib/theme.js';
import { donut } from '../lib/charts.js';

// Wybrany rok utrzymywany między odświeżeniami (null = jeszcze nieustalony).
let _year = null;
// Motyw Nowoczesny: dodatkowy filtr miesiąca ('all' albo 'MM').
let _month = 'all';

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const CAT_COLORS = ['var(--accent-blue)', 'var(--accent-green)', 'var(--accent-yellow)',
  'var(--accent-purple)', 'var(--accent-red)'];
const amountOf = (e) => Number(e.amount_eur ?? e.amount ?? 0);

// Blok „suma + zmiana vs poprzedni miesiąc + donut + kategorie" (tylko motyw Nowoczesny).
function insightsHtml(rows, allRows, year, month) {
  const total = rows.reduce((s, e) => s + amountOf(e), 0);
  const byCat = new Map();
  for (const e of rows) byCat.set(e.category || 'Inne', (byCat.get(e.category || 'Inne') || 0) + amountOf(e));
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, CAT_COLORS.length).map(([name, value], i) => ({ name, value, color: CAT_COLORS[i] }));
  const rest = sorted.slice(CAT_COLORS.length).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) top.push({ name: 'Pozostałe', value: rest, color: 'var(--text-muted)' });

  // Zmiana względem poprzedniego miesiąca — tylko przy wybranym miesiącu i roku.
  let delta = '';
  if (month !== 'all' && year !== 'all') {
    const m = Number(month);
    const prevY = m === 1 ? String(Number(year) - 1) : year;
    const prevM = m === 1 ? '12' : String(m - 1).padStart(2, '0');
    const prev = allRows
      .filter(e => String(e.date || '').slice(0, 7) === `${prevY}-${prevM}`)
      .reduce((s, e) => s + amountOf(e), 0);
    if (prev > 0) {
      const pct = Math.round(((total - prev) / prev) * 100);
      const up = pct > 0;
      delta = `<div class="cost-delta ${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${Math.abs(pct)}% vs. ${MONTHS[(m + 10) % 12]}</div>`;
    }
  }

  const monthOpts = [...new Set(allRows
    .filter(e => year === 'all' || String(e.date || '').slice(0, 4) === year)
    .map(e => String(e.date || '').slice(5, 7)).filter(x => /^\d{2}$/.test(x)))]
    .sort().reverse();

  const catRows = top.map(c => {
    const pct = total > 0 ? Math.round((c.value / total) * 100) : 0;
    return `
      <div class="cat-row">
        <span class="cat-dot" style="background:${c.color}"></span>
        <div class="cat-main"><div class="cat-name">${escHtml(c.name)}</div><div class="cat-pct">${pct}%</div></div>
        <div class="cat-amt">${fmtEur(c.value)}</div>
      </div>`;
  }).join('');

  return `
    <div class="panel-head">
      <div class="panel-title">Podsumowanie</div>
      <label class="chip-select">
        <span>${month === 'all' ? 'Cały okres' : MONTHS[Number(month) - 1]}</span>${icon('chevronDown', { size: 14 })}
        <select id="exp-month" aria-label="Miesiąc">
          <option value="all"${month === 'all' ? ' selected' : ''}>Cały okres</option>
          ${monthOpts.map(mm => `<option value="${mm}"${mm === month ? ' selected' : ''}>${MONTHS[Number(mm) - 1]}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="cost-top">
      <div>
        <div class="cost-total">${fmtEur(total)}</div>
        ${delta}
      </div>
      <div class="donut-wrap">${donut(top.map(c => ({ value: c.value, color: c.color })))}</div>
    </div>
    ${total > 0 ? `<div class="cat-list">${catRows}</div>` : '<p class="text-muted">Brak kosztów w tym okresie.</p>'}`;
}

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
      ${isModern() ? '<div class="panel" id="exp-insights"></div>' : ''}
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
    let rows = _year === 'all' ? data : data.filter(e => String(e.date || '').slice(0, 4) === _year);

    const insights = document.getElementById('exp-insights');
    if (insights) {
      // Wybrany miesiąc musi istnieć w bieżącym roku — inaczej wracamy do „Cały okres".
      const months = new Set(rows.map(e => String(e.date || '').slice(5, 7)));
      if (_month !== 'all' && !months.has(_month)) _month = 'all';
      if (_month !== 'all') rows = rows.filter(e => String(e.date || '').slice(5, 7) === _month);
      insights.innerHTML = insightsHtml(rows, data, _year, _month);
      document.getElementById('exp-month').addEventListener('change', (ev) => { _month = ev.target.value; renderList(); });
    }

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

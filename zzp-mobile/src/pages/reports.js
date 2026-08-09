import { navigate } from '../router.js';
import { fmtEur, escHtml } from '../lib/format.js';
import { icon } from '../lib/icons.js';
import { sumBy } from '../lib/aggregate.js';
import * as repo from '../data/repo.js';

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const MONTHS_PL = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const PERIODS = [
  { key: 'month', label: 'Miesiąc' },
  { key: 'quarter', label: 'Kwartał' },
  { key: 'year', label: 'Rok' }
];

// Stan utrzymywany między odświeżeniami
let _period = 'month';
let _year = null;
let _month = new Date().getMonth() + 1;   // 1–12
let _quarter = Math.ceil((new Date().getMonth() + 1) / 3); // 1–4

// Data przypisania przychodu (opłacone → paid_date/issue_date), spójnie z Finansami/pulpitem.
function incomeDate(inv) {
  if (inv.status === 'cancelled') return null;
  if (inv.status === 'paid') return inv.paid_date || inv.issue_date || null;
  return null;
}
const invAmount = (i) => Number(i.total_eur ?? i.total ?? 0);
const expAmount = (e) => Number(e.amount_eur ?? e.amount ?? 0);
const yearOf = (d) => String(d || '').slice(0, 4);
const monthOf = (d) => Number(String(d).slice(5, 7)); // 1–12
const quarterOfMonth = (m) => Math.floor((m - 1) / 3) + 1;

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <button class="btn btn-secondary btn-sm back-btn" id="rep-back">${icon('arrowLeft', { size: 16 })} Wróć</button>
      <h1 class="page-title">Raporty</h1>
      <div class="seg-tabs" id="rep-tabs">
        ${PERIODS.map(p => `<button class="seg-tab${p.key === _period ? ' active' : ''}" data-period="${p.key}">${p.label}</button>`).join('')}
      </div>
      <div id="rep-picker" class="list-filter-bar"></div>
      <div id="rep-body"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;
  document.getElementById('rep-back').addEventListener('click', () => navigate('more'));

  let invoices = [], expenses = [];
  try {
    [invoices, expenses] = await Promise.all([repo.listInvoices(), repo.listExpenses()]);
  } catch (err) {
    document.getElementById('rep-body').innerHTML = `<p class="error-msg">Błąd wczytywania danych: ${escHtml(err.message)}</p>`;
    return;
  }

  // Lista lat z danych
  const years = new Set();
  for (const i of invoices) { const d = incomeDate(i); if (d) years.add(yearOf(d)); if (i.issue_date) years.add(yearOf(i.issue_date)); }
  for (const e of expenses) if (e.date) years.add(yearOf(e.date));
  const yearList = [...years].filter(y => /^\d{4}$/.test(y)).sort((a, b) => b.localeCompare(a));
  const thisYear = String(new Date().getFullYear());
  if (_year === null) _year = yearList.includes(thisYear) ? thisYear : (yearList[0] || thisYear);
  if (!yearList.includes(_year)) yearList.unshift(_year);

  document.getElementById('rep-tabs').querySelectorAll('.seg-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _period = btn.dataset.period;
      document.getElementById('rep-tabs').querySelectorAll('.seg-tab').forEach(b => b.classList.toggle('active', b === btn));
      renderPicker();
      renderBody();
    });
  });

  renderPicker();
  renderBody();

  function renderPicker() {
    const el2 = document.getElementById('rep-picker');
    const yearSel = `<select id="rep-year">${yearList.map(y => `<option value="${y}"${y === _year ? ' selected' : ''}>${y}</option>`).join('')}</select>`;
    if (_period === 'month') {
      el2.innerHTML = `<label>Okres</label>
        <select id="rep-month">${MONTHS_PL.map((n, i) => `<option value="${i + 1}"${i + 1 === _month ? ' selected' : ''}>${n}</option>`).join('')}</select>
        ${yearSel}`;
      document.getElementById('rep-month').addEventListener('change', (e) => { _month = +e.target.value; renderBody(); });
    } else if (_period === 'quarter') {
      el2.innerHTML = `<label>Okres</label>
        <select id="rep-quarter">${[1, 2, 3, 4].map(q => `<option value="${q}"${q === _quarter ? ' selected' : ''}>Kwartał ${q}</option>`).join('')}</select>
        ${yearSel}`;
      document.getElementById('rep-quarter').addEventListener('change', (e) => { _quarter = +e.target.value; renderBody(); });
    } else {
      el2.innerHTML = `<label>Rok</label>${yearSel}`;
    }
    const ys = document.getElementById('rep-year');
    if (ys) ys.addEventListener('change', (e) => { _year = e.target.value; renderBody(); });
  }

  function inPeriod(dateStr) {
    if (!dateStr || yearOf(dateStr) !== _year) return false;
    if (_period === 'year') return true;
    const m = monthOf(dateStr);
    if (_period === 'month') return m === _month;
    return quarterOfMonth(m) === _quarter; // quarter
  }

  function periodLabel() {
    if (_period === 'month') return `${MONTHS_PL[_month - 1]} ${_year}`;
    if (_period === 'quarter') return `Kwartał ${_quarter} · ${_year}`;
    return `Rok ${_year}`;
  }

  function renderBody() {
    const body = document.getElementById('rep-body');

    const income = sumBy(invoices.filter(i => inPeriod(incomeDate(i))), invAmount);
    const costs = sumBy(expenses.filter(e => inPeriod(e.date)), expAmount);
    const profit = income - costs;
    const margin = income > 0 ? (profit / income) * 100 : null;

    // Koszty wg kategorii (posortowane malejąco)
    const byCat = {};
    for (const e of expenses) {
      if (!inPeriod(e.date)) continue;
      const c = e.category || 'Inne';
      byCat[c] = (byCat[c] || 0) + expAmount(e);
    }
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const maxCat = cats.length ? cats[0][1] : 0;

    const catHtml = cats.length ? `
      <div class="rep-cat-list">
        ${cats.map(([name, amt]) => {
          const pct = costs > 0 ? Math.round((amt / costs) * 100) : 0;
          const w = maxCat > 0 ? Math.max(3, (amt / maxCat) * 100) : 0;
          return `
          <div class="rep-cat-row">
            <div class="rep-cat-head">
              <span class="rep-cat-name">${escHtml(name)}</span>
              <span><span class="rep-cat-amt">${fmtEur(amt)}</span><span class="rep-cat-pct">${pct}%</span></span>
            </div>
            <div class="rep-bar"><div class="rep-bar-fill" style="width:${w}%"></div></div>
          </div>`;
        }).join('')}
      </div>` : `<p class="text-muted">Brak kosztów w tym okresie.</p>`;

    body.innerHTML = `
      <div class="rep-period-label">${escHtml(periodLabel())}</div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-chip green">${icon('trendUp', { size: 18 })}</div>
          <div class="stat-card-label">Przychód (opłacony)</div>
          <div class="stat-card-value">${fmtEur(income)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-chip red">${icon('trendDown', { size: 18 })}</div>
          <div class="stat-card-label">Koszty</div>
          <div class="stat-card-value">${fmtEur(costs)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-chip ${profit >= 0 ? 'green' : 'red'}">${icon('chart', { size: 18 })}</div>
          <div class="stat-card-label">Zysk netto</div>
          <div class="stat-card-value">${fmtEur(profit)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-chip blue">${icon('percent', { size: 18 })}</div>
          <div class="stat-card-label">Marża netto</div>
          <div class="stat-card-value">${margin === null ? '—' : margin.toFixed(1) + '%'}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">Koszty wg kategorii</div>
          <span class="text-muted" style="font-size:13px">${cats.length ? fmtEur(costs) : ''}</span>
        </div>
        ${catHtml}
      </div>
    `;
  }
}

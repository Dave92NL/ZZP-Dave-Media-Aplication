import { fmtEur, escHtml } from '../lib/format.js';
import { icon } from '../lib/icons.js';
import { groupedBars } from '../lib/charts.js';
import { sumBy } from '../lib/aggregate.js';
import * as repo from '../data/repo.js';

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const QUARTERS = [
  { label: 'I kwartał', sub: 'sty–mar', months: [0, 1, 2] },
  { label: 'II kwartał', sub: 'kwi–cze', months: [3, 4, 5] },
  { label: 'III kwartał', sub: 'lip–wrz', months: [6, 7, 8] },
  { label: 'IV kwartał', sub: 'paź–gru', months: [9, 10, 11] }
];

let _year = null;

// Data przypisania przychodu (opłacone → paid_date/issue_date), spójnie z pulpitem.
function incomeDate(inv) {
  if (inv.status === 'cancelled') return null;
  if (inv.status === 'paid') return inv.paid_date || inv.issue_date || null;
  return null;
}
const invAmount = (i) => Number(i.total_eur ?? i.total ?? 0);
const expAmount = (e) => Number(e.amount_eur ?? e.amount ?? 0);
const monthOf = (dateStr) => Number(String(dateStr).slice(5, 7)) - 1;
const yearOf = (dateStr) => String(dateStr || '').slice(0, 4);

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page"><div id="fin-wrap"><p class="text-muted">Ładowanie…</p></div></div>`;
  const wrap = document.getElementById('fin-wrap');

  let invoices = [], expenses = [];
  try {
    [invoices, expenses] = await Promise.all([repo.listInvoices(), repo.listExpenses()]);
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania finansów: ${escHtml(err.message)}</p>`;
    return;
  }

  // Lata z danych (przychód po dacie przypisania, koszty po dacie, faktury po issue_date do VAT)
  const years = new Set();
  for (const i of invoices) {
    const d = incomeDate(i); if (d) years.add(yearOf(d));
    if (i.issue_date) years.add(yearOf(i.issue_date));
  }
  for (const e of expenses) if (e.date) years.add(yearOf(e.date));
  const yearList = [...years].filter(y => /^\d{4}$/.test(y)).sort((a, b) => b.localeCompare(a));
  const thisYear = String(new Date().getFullYear());
  if (_year === null) _year = yearList.includes(thisYear) ? thisYear : (yearList[0] || thisYear);
  if (!yearList.includes(_year)) yearList.unshift(_year);

  render();

  function render() {
    const y = _year;

    // Przychód (opłacone) i koszty po miesiącach roku y
    const revByMonth = Array(12).fill(0);
    const costByMonth = Array(12).fill(0);
    for (const i of invoices) {
      const d = incomeDate(i);
      if (d && yearOf(d) === y) revByMonth[monthOf(d)] += invAmount(i);
    }
    for (const e of expenses) {
      if (e.date && yearOf(e.date) === y) costByMonth[monthOf(e.date)] += expAmount(e);
    }
    const income = sumBy(revByMonth, v => v);
    const costs = sumBy(costByMonth, v => v);
    const profit = income - costs;

    // VAT kwartalnie: należny z faktur (po issue_date), odliczalny z kosztów (btw_deductible)
    const vatOut = Array(12).fill(0); // BTW należny (od sprzedaży)
    const vatIn = Array(12).fill(0);  // BTW odliczalny (voorbelasting)
    for (const i of invoices) {
      if (i.status === 'cancelled') continue;
      if (yearOf(i.issue_date) === y) vatOut[monthOf(i.issue_date)] += Number(i.btw_amount) || 0;
    }
    for (const e of expenses) {
      if (e.btw_deductible && yearOf(e.date) === y) vatIn[monthOf(e.date)] += Number(e.btw_amount) || 0;
    }
    const vatYear = sumBy(vatOut, v => v) - sumBy(vatIn, v => v);

    // Struktura przychodu: reverse-charge vs zwykły (na fakturach opłaconych w roku)
    let rcIncome = 0, normalIncome = 0;
    for (const i of invoices) {
      const d = incomeDate(i);
      if (!d || yearOf(d) !== y) continue;
      if (i.btw_reverse_charge) rcIncome += invAmount(i); else normalIncome += invAmount(i);
    }

    const bars = groupedBars({
      labels: MONTHS_PL,
      series: [
        { name: 'Przychód', color: 'var(--accent-green)', values: revByMonth },
        { name: 'Koszty', color: 'var(--accent-red)', values: costByMonth }
      ]
    }, { height: 180, fmtY: (v) => v >= 1000 ? (v / 1000) + 'k' : String(Math.round(v)) });

    const quarterRows = QUARTERS.map(q => {
      const out = sumBy(q.months.map(m => vatOut[m]), v => v);
      const inp = sumBy(q.months.map(m => vatIn[m]), v => v);
      const due = out - inp;
      return `
        <div class="fin-vat-row">
          <div>
            <div class="fin-vat-q">${q.label}</div>
            <div class="fin-vat-sub">${q.sub} · należny ${fmtEur(out)} − odliczalny ${fmtEur(inp)}</div>
          </div>
          <div class="fin-vat-due ${due > 0 ? 'text-danger' : 'text-good'}">${fmtEur(due)}</div>
        </div>`;
    }).join('');

    const rcPct = income > 0 ? Math.round((rcIncome / income) * 100) : 0;

    wrap.innerHTML = `
      <div class="page-head">
        <h1 class="page-title">Finanse</h1>
        <span class="chip-select">
          <span>${escHtml(y)}</span>${icon('chevronDown', { size: 14 })}
          <select id="fin-year">
            ${yearList.map(yy => `<option value="${yy}"${yy === y ? ' selected' : ''}>${yy}</option>`).join('')}
          </select>
        </span>
      </div>

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
          <div class="stat-card-label">Zysk</div>
          <div class="stat-card-value">${fmtEur(profit)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-chip blue">${icon('percent', { size: 18 })}</div>
          <div class="stat-card-label">VAT (rok)</div>
          <div class="stat-card-value">${fmtEur(vatYear)}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><div class="panel-title">Przychód vs koszty</div><span class="text-muted" style="font-size:13px">${escHtml(y)}</span></div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot" style="background:var(--accent-green)"></span>Przychód</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--accent-red)"></span>Koszty</span>
        </div>
        <div class="bars-chart">${bars}</div>
      </div>

      <div class="panel">
        <div class="panel-head"><div class="panel-title">VAT kwartalnie</div><span class="text-muted" style="font-size:13px">do zapłaty</span></div>
        ${quarterRows}
        <div class="fin-vat-row fin-vat-total">
          <div class="fin-vat-q">Razem ${escHtml(y)}</div>
          <div class="fin-vat-due ${vatYear > 0 ? 'text-danger' : 'text-good'}">${fmtEur(vatYear)}</div>
        </div>
      </div>

      ${rcIncome > 0 ? `
      <div class="panel">
        <div class="panel-title" style="margin-bottom:10px">Struktura przychodu</div>
        <div class="fin-bar"><div class="fin-bar-fill" style="width:${100 - rcPct}%"></div></div>
        <div class="fin-legend2">
          <span class="legend-item"><span class="legend-dot" style="background:var(--accent-green)"></span>Zwykły ${fmtEur(normalIncome)}</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--accent-purple)"></span>Reverse charge ${fmtEur(rcIncome)} (${rcPct}%)</span>
        </div>
      </div>` : ''}

      <p class="text-muted" style="font-size:12px;text-align:center;margin-top:4px">
        Przychód liczony z faktur opłaconych. VAT należny wg daty wystawienia, odliczalny wg daty kosztu.
      </p>
    `;

    const sel = document.getElementById('fin-year');
    if (sel) sel.addEventListener('change', (e) => { _year = e.target.value; render(); });
  }
}

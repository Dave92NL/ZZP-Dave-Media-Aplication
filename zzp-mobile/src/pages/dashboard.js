import { fmtEur, escHtml } from '../lib/format.js';
import { navigate } from '../router.js';
import * as repo from '../data/repo.js';
import { getSession } from '../auth.js';
import { icon } from '../lib/icons.js';
import { areaSparkline, groupedBars } from '../lib/charts.js';
import {
  sumBy, lastNMonths, revenueByMonth, costsByMonth, pctChange, formatDelta
} from '../lib/aggregate.js';

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

let _greetName = 'Użytkownik';
let _range = 6; // liczba miesięcy na wykresie „Przegląd miesięczny"

async function resolveName() {
  try {
    const session = await getSession();
    const email = session?.user?.email || '';
    if (email) return cap(email.split('@')[0].replace(/[._]/g, ' ').split(' ')[0]);
  } catch { /* offline */ }
  return 'Użytkownik';
}

function deltaPill(pct, { big = false } = {}) {
  const d = formatDelta(pct);
  if (d.dir === 'flat') return '';
  const ic = d.dir === 'up' ? 'arrowUp' : 'arrowDown';
  if (big) return `<span class="hero-delta ${d.dir}">${icon(ic, { size: 14 })}${d.text}</span>`;
  return `<span class="stat-card-delta ${d.dir}">${icon(ic, { size: 13 })}${d.text}</span>`;
}

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page"><div id="dash-wrap"><p class="text-muted">Ładowanie…</p></div></div>`;
  const wrap = document.getElementById('dash-wrap');

  _greetName = await resolveName();

  try {
    const now = new Date();
    const [invoices, expenses] = await Promise.all([
      repo.listInvoices(),
      repo.listExpenses()
    ]);

    const months = lastNMonths(_range, now);
    const revSeries = revenueByMonth(invoices, months);
    const costSeries = costsByMonth(expenses, months);
    const last = months.length - 1;

    const income = revSeries[last];
    const prevIncome = last > 0 ? revSeries[last - 1] : 0;
    const costs = costSeries[last];
    const prevCosts = last > 0 ? costSeries[last - 1] : 0;
    const profit = income - costs;
    const prevProfit = prevIncome - prevCosts;

    // VAT bieżącego miesiąca (należny − odliczalny)
    const ymNow = months[last].key;
    const monthInv = invoices.filter(i => String(i.issue_date || '').startsWith(ymNow));
    const monthExp = expenses.filter(e => String(e.date || '').startsWith(ymNow));
    const vatDue = sumBy(monthInv, i => i.btw_amount) - sumBy(monthExp, e => e.btw_deductible ? e.btw_amount : 0);

    renderDashboard(wrap, { now, months, revSeries, costSeries, income, prevIncome, costs, prevCosts, profit, prevProfit, vatDue });
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania pulpitu: ${escHtml(err.message)}</p>`;
  }
}

function renderDashboard(wrap, d) {
  const { now, months, revSeries, costSeries, income, prevIncome, costs, prevCosts, profit, prevProfit, vatDue } = d;
  const monthLong = cap(now.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }));
  const prevMonthLong = cap(months[months.length - 2]?.long || '');

  const qa = (id, cls, ic, label) =>
    `<button class="qa-btn" id="${id}"><span class="qa-icon ${cls}">${icon(ic, { size: 22 })}</span><span class="qa-label">${label}</span></button>`;

  wrap.innerHTML = `
    <div class="greeting">
      <div>
        <div class="greeting-title">Witaj, ${escHtml(_greetName)} 👋</div>
        <div class="greeting-sub">${escHtml(monthLong)}</div>
      </div>
      <button class="icon-btn" id="dash-bell" aria-label="Powiadomienia">${icon('bell', { size: 20 })}</button>
    </div>

    <div class="hero-card">
      <div class="hero-label">Przychód netto</div>
      <div class="hero-value">${fmtEur(income)}</div>
      <div class="hero-meta">
        ${deltaPill(pctChange(income, prevIncome), { big: true })}
        <span class="hero-sub">vs ${escHtml(prevMonthLong)}</span>
      </div>
      <div class="hero-chart">${areaSparkline(revSeries, { color: 'var(--accent-green)' })}</div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-chip green">${icon('trendUp', { size: 18 })}</div>
        <div class="stat-card-label">Przychód</div>
        <div class="stat-card-value">${fmtEur(income)}</div>
        ${deltaPill(pctChange(income, prevIncome))}
      </div>
      <div class="stat-card">
        <div class="stat-chip red">${icon('trendDown', { size: 18 })}</div>
        <div class="stat-card-label">Koszty</div>
        <div class="stat-card-value">${fmtEur(costs)}</div>
        ${deltaPill(pctChange(costs, prevCosts))}
      </div>
      <div class="stat-card">
        <div class="stat-chip ${profit >= 0 ? 'green' : 'red'}">${icon('chart', { size: 18 })}</div>
        <div class="stat-card-label">Zysk</div>
        <div class="stat-card-value">${fmtEur(profit)}</div>
        ${deltaPill(pctChange(profit, prevProfit))}
      </div>
      <div class="stat-card">
        <div class="stat-chip blue">${icon('percent', { size: 18 })}</div>
        <div class="stat-card-label">VAT do zapłaty</div>
        <div class="stat-card-value">${fmtEur(vatDue)}</div>
        <div class="stat-card-delta"><span class="text-muted">${escHtml(cap(now.toLocaleDateString('pl-PL', { month: 'long' })))}</span></div>
      </div>
    </div>

    <div class="panel" id="dash-overview">
      <div class="panel-head">
        <div class="panel-title">Przegląd miesięczny</div>
        <span class="chip-select">
          <span id="range-label">${_range} mies.</span>${icon('chevronDown', { size: 14 })}
          <select id="dash-range">
            <option value="6"${_range === 6 ? ' selected' : ''}>6 mies.</option>
            <option value="12"${_range === 12 ? ' selected' : ''}>12 mies.</option>
          </select>
        </span>
      </div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-dot" style="background:var(--accent-green)"></span>Przychód</span>
        <span class="legend-item"><span class="legend-dot" style="background:var(--accent-red)"></span>Koszty</span>
      </div>
      <div class="bars-chart">
        ${groupedBars({
          labels: months.map(m => m.short),
          series: [
            { name: 'Przychód', color: 'var(--accent-green)', values: revSeries },
            { name: 'Koszty', color: 'var(--accent-red)', values: costSeries }
          ]
        }, { fmtY: (v) => v >= 1000 ? (v / 1000) + 'k' : String(Math.round(v)) })}
      </div>
    </div>

    <h3 class="section-title">Szybkie akcje</h3>
    <div class="quick-actions">
      ${qa('qa-invoice', 'purple', 'filePlus', 'Nowa faktura')}
      ${qa('qa-expense', 'green', 'camera', 'Skanuj paragon')}
      ${qa('qa-time', 'orange', 'play', 'Start czasu')}
      ${qa('qa-mileage', 'blue', 'car', 'Dodaj kilometrówkę')}
    </div>
  `;

  document.getElementById('qa-invoice').addEventListener('click', () => navigate('new-invoice'));
  document.getElementById('qa-expense').addEventListener('click', () => navigate('add-expense'));
  document.getElementById('qa-time').addEventListener('click', () => navigate('time'));
  document.getElementById('qa-mileage').addEventListener('click', () => navigate('mileage'));
  document.getElementById('dash-bell').addEventListener('click', () => navigate('more'));

  document.getElementById('dash-range').addEventListener('change', (e) => {
    _range = Number(e.target.value) || 6;
    load(); // przelicz i przerysuj z nowym zakresem
  });
}

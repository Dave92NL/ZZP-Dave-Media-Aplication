/* Dashboard page */
'use strict';

const PageDashboard = (() => {
  let charts = {};

  // ── Entry point ──────────────────────────────────────────
  async function load() {
    renderSkeleton();
    try {
      const [kpis, alerts, chartRevenue, chartHours, chartExpCat, data] = await Promise.all([
        window.api.dashboard.getKPIs(),
        window.api.dashboard.getAlerts(),
        window.api.dashboard.getChartData('revenue_costs'),
        window.api.dashboard.getChartData('hours'),
        window.api.dashboard.getChartData('expenses_by_category'),
        window.api.dashboard.getData()
      ]);
      destroyCharts();
      renderAlerts(alerts);
      renderKPIs(kpis);
      renderCharts(chartRevenue, chartHours, chartExpCat);
      renderTimerWidget(data);
      renderQuickActions();
      renderUpcoming(data.upcoming);
      renderOverdue(data.overdueInvoices);
    } catch (err) {
      console.error('Dashboard load error:', err);
      document.getElementById('page-content').innerHTML +=
        `<div class="alert alert-danger">Błąd ładowania dashboardu: ${UI.esc(err.message)}</div>`;
    }
  }

  function renderSkeleton() {
    document.getElementById('page-content').innerHTML = `
      <div class="page" id="dashboard-page">
        <div class="page-header">
          <h1 class="page-title">🏠 Dashboard</h1>
          <div class="page-actions" id="dashboard-quick-actions"></div>
        </div>
        <div id="dashboard-alerts"></div>
        <div class="kpi-grid" id="kpi-grid">
          ${Array(6).fill('<div class="card kpi-card skeleton" style="height:96px"></div>').join('')}
        </div>
        <div class="grid-3-1" style="margin-top:20px;gap:16px;display:grid;grid-template-columns:1fr 1fr 1fr">
          <div class="card" style="grid-column:1/3"><div style="height:220px;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">Ładowanie wykresu…</div></div>
          <div class="card"><div style="height:220px;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">Ładowanie…</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px" id="dashboard-bottom"></div>
      </div>
    `;
  }

  function renderAlerts(alerts) {
    const el = document.getElementById('dashboard-alerts');
    if (!el) return;
    if (!alerts?.length) { el.innerHTML = ''; return; }
    el.innerHTML = alerts.map(a => `
      <div class="alert alert-${a.type}" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:10px 14px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--accent-${a.type === 'danger' ? 'red' : 'yellow'}) 12%,transparent);border:1px solid color-mix(in srgb,var(--accent-${a.type === 'danger' ? 'red' : 'yellow'}) 35%,transparent)">
        <span>${a.icon}</span>
        <span style="flex:1;font-size:13px">${UI.esc(a.message)}</span>
        ${a.action ? `<button class="btn btn-sm btn-secondary" onclick="App.navigate('${a.action.page}')">${a.action.label}</button>` : ''}
      </div>`).join('');
  }

  function renderKPIs(kpis) {
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;

    const fmtEur = v => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
    const fmtEurDec = v => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(v || 0);
    const pctBadge = (val) => {
      if (val === null || val === undefined) return '';
      const up = val >= 0;
      const color = up ? 'var(--accent-green)' : 'var(--accent-red)';
      return `<span style="color:${color};font-size:12px">${up ? '▲' : '▼'} ${Math.abs(val).toFixed(1)}% vs ub.m.</span>`;
    };

    const urenPct = kpis.urencriterium?.urencriterium_progress || 0;
    const urenH = (kpis.urencriterium?.total_hours || 0).toFixed(1);
    const progressBar = (pct, color) => `
      <div style="background:var(--bg-tertiary);border-radius:3px;height:4px;margin-top:6px">
        <div style="background:${color};width:${Math.min(100,pct).toFixed(0)}%;height:4px;border-radius:3px"></div>
      </div>`;

    const monthsLeft = 12 - new Date().getMonth();
    const neededPerMonth = kpis.urencriterium?.hours_remaining > 0 && monthsLeft > 0
      ? (kpis.urencriterium.hours_remaining / monthsLeft).toFixed(1) : 0;

    grid.innerHTML = `
      <div class="card kpi-card">
        <div class="kpi-label">💰 Przychody — ten miesiąc</div>
        <div class="kpi-value amount">${fmtEur(kpis.monthIncome)}</div>
        ${pctBadge(kpis.incomeChange)}
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">📋 Przychody YTD</div>
        <div class="kpi-value amount">${fmtEur(kpis.ytdIncome)}</div>
        <div style="font-size:12px;color:var(--text-muted)">Rok ${new Date().getFullYear()}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">⏱️ Godziny — ten miesiąc</div>
        <div class="kpi-value">${(kpis.monthHours || 0).toFixed(1)} h</div>
        <div style="font-size:12px;color:var(--text-muted)">${urenH}h / 1225h YTD</div>
        ${progressBar(urenPct, 'var(--accent-blue)')}
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">💸 Koszty — ten miesiąc</div>
        <div class="kpi-value amount" style="color:var(--accent-red)">${fmtEur(kpis.monthExpenses)}</div>
        ${pctBadge(kpis.expensesChange !== null ? -kpis.expensesChange : null)}
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">🧾 Podatek IB — szacowany ${new Date().getFullYear()}</div>
        <div class="kpi-value amount">${fmtEur(kpis.estimatedIBTax)}</div>
        <div style="font-size:12px;color:var(--text-muted)">Rezerwa: ${fmtEurDec(kpis.monthlyReserve)}/mies.</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">📅 Najbliższy termin</div>
        ${kpis.nextDeadline
          ? `<div class="kpi-value" style="font-size:16px">${UI.esc(kpis.nextDeadline.title.split(' ').slice(0,2).join(' '))}</div>
             <div style="font-size:12px;color:var(--accent-yellow)">${daysUntil(kpis.nextDeadline.due_date)}</div>`
          : `<div class="kpi-value" style="font-size:16px;color:var(--accent-green)">Brak</div>`}
      </div>
    `;
  }

  function renderCharts(chartRevenue, chartHours, chartExpCat) {
    const container = document.querySelector('.grid-3-1');
    if (!container) return;

    container.innerHTML = `
      <div class="card" style="grid-column:1/3">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="font-size:14px;font-weight:600">Przychody vs Koszty — 12 miesięcy</h3>
        </div>
        <div style="height:200px"><canvas id="chart-revenue-costs"></canvas></div>
      </div>
      <div class="card">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">Koszty wg kategorii</h3>
        <div style="height:200px"><canvas id="chart-exp-cat"></canvas></div>
      </div>
      <div class="card" style="grid-column:1/3">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">Godziny pracy — ostatnie 6 miesięcy</h3>
        <div style="height:160px"><canvas id="chart-hours"></canvas></div>
      </div>
    `;

    // Revenue/costs line chart
    if (chartRevenue?.labels?.length) {
      charts.revenueCosts = Charts.createLineChart('chart-revenue-costs', chartRevenue.labels, [
        { label: 'Przychody', data: chartRevenue.income, borderColor: 'rgba(63,185,80,0.85)', backgroundColor: 'rgba(63,185,80,0.1)', fill: true },
        { label: 'Koszty', data: chartRevenue.costs, borderColor: 'rgba(248,81,73,0.85)', backgroundColor: 'rgba(248,81,73,0.1)', fill: true }
      ]);
    }

    // Expenses by category doughnut
    if (chartExpCat?.labels?.length) {
      charts.expCat = Charts.createDoughnutChart('chart-exp-cat', chartExpCat.labels, chartExpCat.values);
    } else {
      const canvas = document.getElementById('chart-exp-cat');
      if (canvas) canvas.parentElement.innerHTML = '<p class="text-muted" style="text-align:center;padding:60px 0;font-size:13px">Brak kosztów w tym miesiącu</p>';
    }

    // Hours bar chart
    if (chartHours?.labels?.length) {
      charts.hours = Charts.createBarChart('chart-hours', chartHours.labels, [
        { label: 'Godziny', data: chartHours.hours }
      ], { colorIndex: 1 });
    }
  }

  function renderTimerWidget(data) {
    // Timer widget is handled by the global timer bar in app.js
  }

  function renderQuickActions() {
    const el = document.getElementById('dashboard-quick-actions');
    if (!el) return;
    el.innerHTML = `
      <button class="btn btn-primary" onclick="App.navigate('invoices');setTimeout(()=>PageInvoices.openCreate(),100)">+ Nowa faktura</button>
      <button class="btn btn-secondary" onclick="App.navigate('time')">▶ Start timer</button>
      <button class="btn btn-secondary" onclick="App.navigate('expenses')">+ Dodaj koszt</button>
      <button class="btn btn-secondary" onclick="App.navigate('tasks')">+ Nowe zadanie</button>
    `;
  }

  function renderUpcoming(upcoming) {
    const bottom = document.getElementById('dashboard-bottom');
    if (!bottom) return;
    const upcomingHTML = `
      <div class="card">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">🔔 Nadchodzące terminy</h3>
        ${!upcoming?.length
          ? '<p class="text-muted" style="font-size:13px">Brak aktywnych przypomnień.</p>'
          : upcoming.slice(0,5).map(r => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
              <div>
                <div style="font-size:13px;font-weight:500">${UI.esc(r.title)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${r.type}</div>
              </div>
              <span class="badge badge-warning">${r.due_date}</span>
            </div>`).join('')}
        <div style="margin-top:8px"><button class="btn btn-sm btn-secondary" onclick="App.navigate('reminders')">Wszystkie →</button></div>
      </div>`;
    bottom.innerHTML += upcomingHTML;
  }

  function renderOverdue(overdue) {
    const bottom = document.getElementById('dashboard-bottom');
    if (!bottom) return;
    const overdueHTML = `
      <div class="card">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">🔴 Przeterminowane faktury</h3>
        ${!overdue?.length
          ? '<p class="text-muted" style="font-size:13px;color:var(--accent-green)">✅ Brak przeterminowanych faktur!</p>'
          : overdue.slice(0,5).map(inv => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--accent-red)">${UI.esc(inv.invoice_number)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${UI.esc(inv.client_name || '—')}</div>
              </div>
              <div style="text-align:right">
                <div class="amount" style="font-size:13px">${fmtEurShort(inv.total)}</div>
                <div style="font-size:11px;color:var(--accent-red)">termin: ${inv.due_date}</div>
              </div>
            </div>`).join('')}
        <div style="margin-top:8px"><button class="btn btn-sm btn-secondary" onclick="App.navigate('invoices')">Wszystkie faktury →</button></div>
      </div>`;
    bottom.innerHTML += overdueHTML;
  }

  // ── Helpers ──────────────────────────────────────────────
  function destroyCharts() {
    Object.values(charts).forEach(c => Charts.destroyChart(c));
    charts = {};
  }

  function daysUntil(dateStr) {
    const d = Math.floor((new Date(dateStr) - new Date()) / 86400000);
    if (d < 0) return `${Math.abs(d)} dni po terminie`;
    if (d === 0) return 'Dziś!';
    return `za ${d} dni`;
  }

  function fmtEurShort(v) {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
  }

  return { load, destroyCharts };
})();

window.PageDashboard = PageDashboard;

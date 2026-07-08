/* Reports page */
'use strict';

const PageReports = (() => {
  let activeTab = 'monthly';
  let reportCharts = {};
  const MONTH_NAMES = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

  // ── Entry point ──────────────────────────────────────────
  async function load() {
    activeTab = 'monthly';
    document.getElementById('page-content').innerHTML = renderShell();
    bindTabNav();
    await loadCurrentTab();
  }

  function unload() {
    destroyCharts();
  }

  function renderShell() {
    return `
      <div class="page" id="reports-page">
        <div class="page-header">
          <h1 class="page-title">📊 Raporty finansowe</h1>
        </div>
        <div class="tabs" id="reports-tabs">
          <button class="tab-btn active" data-tab="monthly">Miesięczny</button>
          <button class="tab-btn" data-tab="quarterly">Kwartalny</button>
          <button class="tab-btn" data-tab="annual">Roczny</button>
          <button class="tab-btn" data-tab="yoy">Rok do roku</button>
        </div>
        <div id="reports-params"></div>
        <div id="reports-content"><div class="card" style="padding:60px;text-align:center;color:var(--text-muted)">Ładowanie…</div></div>
      </div>`;
  }

  function bindTabNav() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        destroyCharts();
        renderParams();
        await loadCurrentTab();
      });
    });
    renderParams();
  }

  function renderParams() {
    const el = document.getElementById('reports-params');
    if (!el) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const q = Math.ceil(m / 3);
    const years = Array.from({ length: 6 }, (_, i) => y - i);

    if (activeTab === 'monthly') {
      el.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          <select class="filter-select" id="rp-month">
            ${MONTH_NAMES.map((n,i) => `<option value="${i+1}" ${i+1 === m ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <select class="filter-select" id="rp-year">
            ${years.map(yr => `<option value="${yr}" ${yr === y ? 'selected' : ''}>${yr}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="PageReports.generate()">📊 Generuj</button>
          <button class="btn btn-secondary" onclick="PageReports.exportReport('csv')">📤 CSV</button>
          <button class="btn btn-secondary" onclick="PageReports.exportReport('xlsx')">📊 Excel</button>
          <button class="btn btn-secondary" onclick="PageReports.exportReport('pdf')">📄 PDF</button>
        </div>`;
    } else if (activeTab === 'quarterly') {
      el.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          <select class="filter-select" id="rp-quarter">
            ${[1,2,3,4].map(qi => `<option value="${qi}" ${qi === q ? 'selected' : ''}>Q${qi}</option>`).join('')}
          </select>
          <select class="filter-select" id="rp-year">
            ${years.map(yr => `<option value="${yr}" ${yr === y ? 'selected' : ''}>${yr}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="PageReports.generate()">📊 Generuj</button>
          <button class="btn btn-secondary" onclick="PageReports.exportReport('csv')">📤 CSV</button>
          <button class="btn btn-secondary" onclick="PageReports.exportReport('xlsx')">📊 Excel</button>
          <button class="btn btn-secondary" onclick="PageReports.exportReport('pdf')">📄 PDF</button>
        </div>`;
    } else if (activeTab === 'annual') {
      el.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          <select class="filter-select" id="rp-year">
            ${years.map(yr => `<option value="${yr}" ${yr === y ? 'selected' : ''}>${yr}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="PageReports.generate()">📊 Generuj</button>
          <button class="btn btn-secondary" onclick="PageReports.exportReport('csv')">📤 CSV</button>
          <button class="btn btn-secondary" onclick="PageReports.exportReport('xlsx')">📊 Excel</button>
          <button class="btn btn-secondary" onclick="PageReports.exportReport('pdf')">📄 PDF</button>
          <button class="btn btn-secondary" onclick="PageReports.generateWV()" title="Winst &amp; Verliesrekening PDF">📋 W&amp;V PDF</button>
        </div>`;
    } else if (activeTab === 'yoy') {
      el.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          <select class="filter-select" id="rp-year1">
            ${years.map(yr => `<option value="${yr}" ${yr === y - 1 ? 'selected' : ''}>${yr}</option>`).join('')}
          </select>
          <span style="color:var(--text-muted)">vs</span>
          <select class="filter-select" id="rp-year2">
            ${years.map(yr => `<option value="${yr}" ${yr === y ? 'selected' : ''}>${yr}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="PageReports.generate()">📊 Generuj</button>
        </div>`;
    }
  }

  async function loadCurrentTab() {
    await generate();
  }

  async function generate() {
    const el = document.getElementById('reports-content');
    if (!el) return;
    el.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--text-muted)">Generowanie raportu…</div>`;
    destroyCharts();

    try {
      const now = new Date();
      if (activeTab === 'monthly') {
        const month = +document.getElementById('rp-month')?.value || (now.getMonth() + 1);
        const year  = +document.getElementById('rp-year')?.value  || now.getFullYear();
        const data = await window.api.reports.monthly(year, month);
        renderMonthly(data);
      } else if (activeTab === 'quarterly') {
        const quarter = +document.getElementById('rp-quarter')?.value || Math.ceil((now.getMonth() + 1) / 3);
        const year    = +document.getElementById('rp-year')?.value    || now.getFullYear();
        const data = await window.api.reports.quarterly(year, quarter);
        renderQuarterly(data);
      } else if (activeTab === 'annual') {
        const year = +document.getElementById('rp-year')?.value || now.getFullYear();
        const data = await window.api.reports.annual(year);
        renderAnnual(data);
      } else if (activeTab === 'yoy') {
        const y1 = +document.getElementById('rp-year1')?.value || (now.getFullYear() - 1);
        const y2 = +document.getElementById('rp-year2')?.value || now.getFullYear();
        const data = await window.api.reports.yearOverYear(y1, y2);
        renderYoY(data);
      }
    } catch (err) {
      el.innerHTML = `<div class="card"><p class="text-danger" style="padding:20px">Błąd: ${UI.esc(err.message)}</p></div>`;
    }
  }

  // ── Renderers ────────────────────────────────────────────
  function renderMonthly(d) {
    const el = document.getElementById('reports-content');
    const monthName = MONTH_NAMES[d.month - 1];
    const margin = d.totalIncome > 0 ? ((d.netProfit / d.totalIncome) * 100).toFixed(1) : '0.0';

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card">
          <h3 style="font-size:14px;font-weight:600;margin-bottom:16px">📄 ${monthName} ${d.year}</h3>

          ${repSection('PRZYCHODY')}
          ${repRow('Faktury (zapłacone)', fmt(d.totalIncome))}
          ${repRowTotal('Suma przychodów', fmt(d.totalIncome), 'var(--accent-green)')}

          ${repSection('KOSZTY')}
          ${(d.expensesByCategory || []).map(c => repRow(c.category, fmt(c.total))).join('')}
          ${repRowTotal('Suma kosztów', fmt(d.totalExpenses), 'var(--accent-red)')}

          ${repRowTotal('Zysk netto', fmt(d.netProfit), d.netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)')}
          ${repRow('Marża netto', margin + '%')}

          ${repSection('CZAS PRACY')}
          ${repRow('Łączne godziny', fmtHours(d.totalMinutes))}
          ${repRow('Billable', fmtHours(d.billableMinutes) + ' (' + (d.totalMinutes > 0 ? Math.round(d.billableMinutes / d.totalMinutes * 100) : 0) + '%)')}
        </div>
        <div class="card">
          <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">Koszty wg kategorii</h3>
          <div style="height:200px"><canvas id="chart-rep-cat"></canvas></div>
          ${d.expensesByCategory?.length ? '' : '<p class="text-muted" style="text-align:center;padding:40px 0;font-size:13px">Brak kosztów w tym miesiącu</p>'}
        </div>
      </div>`;

    if (d.expensesByCategory?.length) {
      reportCharts.cat = Charts.createDoughnutChart(
        'chart-rep-cat',
        d.expensesByCategory.map(c => c.category),
        d.expensesByCategory.map(c => c.total)
      );
    }
  }

  function renderQuarterly(d) {
    const el = document.getElementById('reports-content');
    const qMonthNames = d.months.map(m => MONTH_NAMES[m.month - 1]);

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card">
          <h3 style="font-size:14px;font-weight:600;margin-bottom:16px">📅 Q${d.quarter} ${d.year}</h3>

          ${repSection('PODSUMOWANIE KWARTAŁU')}
          ${repRow('Przychody', fmt(d.totalIncome), 'var(--accent-green)')}
          ${repRow('Koszty', fmt(d.totalExpenses), 'var(--accent-red)')}
          ${repRowTotal('Zysk netto', fmt(d.netProfit), d.netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)')}
          ${repRow('Godziny łącznie', d.totalHours.toFixed(1) + 'h')}

          ${repSection('PER MIESIĄC')}
          <table style="width:100%;font-size:12px;margin-top:8px">
            <thead><tr>
              <th style="text-align:left;padding:4px 8px">Miesiąc</th>
              <th style="text-align:right;padding:4px 8px">Przychody</th>
              <th style="text-align:right;padding:4px 8px">Koszty</th>
              <th style="text-align:right;padding:4px 8px">Zysk</th>
            </tr></thead>
            <tbody>
              ${d.months.map((m, i) => `<tr>
                <td style="padding:4px 8px">${qMonthNames[i]}</td>
                <td style="text-align:right;padding:4px 8px;color:var(--accent-green)" class="mono">${fmt(m.totalIncome)}</td>
                <td style="text-align:right;padding:4px 8px;color:var(--accent-red)" class="mono">${fmt(m.totalExpenses)}</td>
                <td style="text-align:right;padding:4px 8px" class="mono">${fmt(m.netProfit)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">Przychody / Koszty — Q${d.quarter}</h3>
          <div style="height:200px"><canvas id="chart-rep-q"></canvas></div>
        </div>
      </div>`;

    reportCharts.q = Charts.createBarChart(
      'chart-rep-q',
      qMonthNames,
      [
        { label: 'Przychody', data: d.months.map(m => m.totalIncome) },
        { label: 'Koszty',    data: d.months.map(m => m.totalExpenses) }
      ]
    );
  }

  function renderAnnual(d) {
    const el = document.getElementById('reports-content');
    const urenTotal = d.totalHours.toFixed(1);

    el.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:16px">📆 Raport roczny ${d.year}</h3>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
          ${kpi('Przychody łącznie', fmt(d.totalIncome), 'var(--accent-green)')}
          ${kpi('Koszty łącznie', fmt(d.totalExpenses), 'var(--accent-red)')}
          ${kpi('Zysk netto', fmt(d.netProfit), d.netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)')}
          ${kpi('Godziny', urenTotal + 'h', 'var(--accent-blue)')}
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
          <div>
            <div style="font-size:13px;font-weight:600;margin-bottom:10px">Przychody vs Koszty — per miesiąc</div>
            <div style="height:200px"><canvas id="chart-rep-annual"></canvas></div>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;margin-bottom:10px">Koszty wg kategorii</div>
            <div style="height:200px"><canvas id="chart-rep-annual-cat"></canvas></div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">Szczegóły miesięczne</h3>
        <table style="width:100%">
          <thead><tr>
            <th>Miesiąc</th>
            <th style="text-align:right">Przychody</th>
            <th style="text-align:right">Koszty</th>
            <th style="text-align:right">Zysk netto</th>
            <th style="text-align:right">Marża %</th>
            <th style="text-align:right">Godziny</th>
          </tr></thead>
          <tbody>
            ${d.months.map(m => `<tr>
              <td>${MONTH_NAMES[m.month - 1]}</td>
              <td class="text-right amount" style="color:var(--accent-green)">${fmt(m.totalIncome)}</td>
              <td class="text-right amount" style="color:var(--accent-red)">${fmt(m.totalExpenses)}</td>
              <td class="text-right amount" style="color:${m.netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${fmt(m.netProfit)}</td>
              <td class="text-right" style="font-size:12px;color:var(--text-secondary)">${m.totalIncome > 0 ? ((m.netProfit / m.totalIncome) * 100).toFixed(1) + '%' : '—'}</td>
              <td class="text-right mono" style="font-size:12px">${m.totalHours.toFixed(1)}h</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;border-top:2px solid var(--border)">
              <td>SUMA</td>
              <td class="text-right amount" style="color:var(--accent-green)">${fmt(d.totalIncome)}</td>
              <td class="text-right amount" style="color:var(--accent-red)">${fmt(d.totalExpenses)}</td>
              <td class="text-right amount">${fmt(d.netProfit)}</td>
              <td class="text-right">${d.totalIncome > 0 ? ((d.netProfit / d.totalIncome) * 100).toFixed(1) + '%' : '—'}</td>
              <td class="text-right mono">${d.totalHours.toFixed(1)}h</td>
            </tr>
          </tfoot>
        </table>
      </div>`;

    reportCharts.annual = Charts.createLineChart(
      'chart-rep-annual',
      MONTH_NAMES,
      [
        { label: 'Przychody', data: d.months.map(m => m.totalIncome),   borderColor: 'rgba(63,185,80,0.85)',  backgroundColor: 'rgba(63,185,80,0.1)',  fill: true },
        { label: 'Koszty',    data: d.months.map(m => m.totalExpenses), borderColor: 'rgba(248,81,73,0.85)',  backgroundColor: 'rgba(248,81,73,0.1)',  fill: true }
      ]
    );

    const allCats = {};
    d.months.forEach(m => (m.expensesByCategory || []).forEach(c => {
      allCats[c.category] = (allCats[c.category] || 0) + c.total;
    }));
    const catEntries = Object.entries(allCats).sort((a,b) => b[1] - a[1]);
    if (catEntries.length) {
      reportCharts.annualCat = Charts.createDoughnutChart(
        'chart-rep-annual-cat',
        catEntries.map(e => e[0]),
        catEntries.map(e => e[1])
      );
    } else {
      const c = document.getElementById('chart-rep-annual-cat');
      if (c) c.parentElement.innerHTML = '<p class="text-muted" style="text-align:center;padding:60px 0;font-size:13px">Brak kosztów</p>';
    }
  }

  function renderYoY(d) {
    const el = document.getElementById('reports-content');

    el.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:16px">📈 ${d.year1} vs ${d.year2}</h3>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
          ${kpiCompare('Przychody', fmt(d.totals.income1), fmt(d.totals.income2), d.totals.income1, d.totals.income2)}
          ${kpiCompare('Koszty', fmt(d.totals.expenses1), fmt(d.totals.expenses2), d.totals.expenses1, d.totals.expenses2, true)}
          ${kpiCompare('Zysk netto', fmt(d.totals.profit1), fmt(d.totals.profit2), d.totals.profit1, d.totals.profit2)}
        </div>
        <div style="height:220px"><canvas id="chart-rep-yoy"></canvas></div>
      </div>

      <div class="card">
        <table style="width:100%;font-size:12px">
          <thead><tr>
            <th>Miesiąc</th>
            <th style="text-align:right">${d.year1} Przych.</th>
            <th style="text-align:right">${d.year2} Przych.</th>
            <th style="text-align:right">Zmiana %</th>
            <th style="text-align:right">${d.year1} Zysk</th>
            <th style="text-align:right">${d.year2} Zysk</th>
          </tr></thead>
          <tbody>
            ${d.months.map((m, i) => {
              const chg = m.income1 > 0 ? (((m.income2 - m.income1) / m.income1) * 100).toFixed(1) : '—';
              const chgColor = parseFloat(chg) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
              return `<tr>
                <td style="padding:5px 8px">${MONTH_NAMES[i]}</td>
                <td class="text-right mono" style="padding:5px 8px">${fmt(m.income1)}</td>
                <td class="text-right mono" style="padding:5px 8px">${fmt(m.income2)}</td>
                <td class="text-right" style="padding:5px 8px;color:${chgColor};font-weight:600">${chg !== '—' ? (parseFloat(chg) >= 0 ? '+' : '') + chg + '%' : '—'}</td>
                <td class="text-right mono" style="padding:5px 8px">${fmt(m.profit1)}</td>
                <td class="text-right mono" style="padding:5px 8px">${fmt(m.profit2)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    reportCharts.yoy = Charts.createLineChart(
      'chart-rep-yoy',
      MONTH_NAMES,
      [
        { label: `${d.year1} Przychody`, data: d.months.map(m => m.income1),  borderColor: 'rgba(139,92,246,0.85)',  backgroundColor: 'rgba(139,92,246,0.08)', fill: false },
        { label: `${d.year2} Przychody`, data: d.months.map(m => m.income2),  borderColor: 'rgba(63,185,80,0.85)',   backgroundColor: 'rgba(63,185,80,0.08)',  fill: false },
        { label: `${d.year1} Zysk`,      data: d.months.map(m => m.profit1),  borderColor: 'rgba(139,92,246,0.4)',   backgroundColor: 'transparent',            fill: false, borderDash: [5,5] },
        { label: `${d.year2} Zysk`,      data: d.months.map(m => m.profit2),  borderColor: 'rgba(63,185,80,0.4)',    backgroundColor: 'transparent',            fill: false, borderDash: [5,5] }
      ]
    );
  }

  // ── W&V PDF ──────────────────────────────────────────────
  async function generateWV() {
    const year = +document.getElementById('rp-year')?.value || new Date().getFullYear();
    try {
      UI.toast('Generowanie W&V PDF…', 'info');
      const filePath = await window.api.reports.generateWV(year);
      if (filePath) {
        UI.toast('📋 W&V PDF zapisany!', 'success');
        await window.api.util.openFile(filePath);
      }
    } catch (err) {
      UI.toast('Błąd generowania W&V: ' + err.message, 'error');
    }
  }

  // ── Export ───────────────────────────────────────────────
  async function exportReport(format) {
    const now = new Date();
    let type, params;

    if (activeTab === 'monthly') {
      type = 'monthly';
      params = { month: +document.getElementById('rp-month')?.value || (now.getMonth() + 1), year: +document.getElementById('rp-year')?.value || now.getFullYear() };
    } else if (activeTab === 'quarterly') {
      type = 'quarterly';
      params = { quarter: +document.getElementById('rp-quarter')?.value || 1, year: +document.getElementById('rp-year')?.value || now.getFullYear() };
    } else if (activeTab === 'annual') {
      type = 'annual';
      params = { year: +document.getElementById('rp-year')?.value || now.getFullYear() };
    } else {
      UI.toast('Eksport niedostępny dla tego widoku.', 'warning');
      return;
    }

    try {
      UI.toast('Przygotowywanie eksportu…', 'info');
      const result = await window.api.reports.export(type, format, params);
      if (result) UI.toast(`Raport zapisany: ${result.split(/[\\/]/).pop()}`, 'success');
    } catch (err) {
      UI.toast('Błąd eksportu: ' + err.message, 'error');
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  function destroyCharts() {
    Object.values(reportCharts).forEach(c => Charts.destroyChart(c));
    reportCharts = {};
  }

  function repSection(title) {
    return `<div style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:var(--text-muted);text-transform:uppercase;padding:10px 0 4px;border-top:1px solid var(--border);margin-top:6px">${title}</div>`;
  }

  function repRow(label, value, color = '') {
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px">
      <span style="color:var(--text-secondary)">${label}</span>
      <span class="mono" ${color ? `style="color:${color}"` : ''}>${value}</span>
    </div>`;
  }

  function repRowTotal(label, value, color = 'var(--text-primary)') {
    return `<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:14px;font-weight:700;border-bottom:2px solid var(--border)">
      <span>${label}</span>
      <span class="mono" style="color:${color}">${value}</span>
    </div>`;
  }

  function kpi(label, value, color) {
    return `<div style="background:var(--bg-tertiary);border-radius:var(--radius-sm);padding:12px">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">${label}</div>
      <div style="font-size:18px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${color}">${value}</div>
    </div>`;
  }

  function kpiCompare(label, v1, v2, n1, n2, invertColor = false) {
    const pct = n1 > 0 ? (((n2 - n1) / n1) * 100).toFixed(1) : null;
    const up = pct !== null && parseFloat(pct) >= 0;
    const good = invertColor ? !up : up;
    const chgColor = pct !== null ? (good ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-muted)';
    return `<div style="background:var(--bg-tertiary);border-radius:var(--radius-sm);padding:12px">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${label}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:2px">2024: ${v1}</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:4px">${v2}</div>
      ${pct !== null ? `<div style="font-size:12px;font-weight:600;color:${chgColor}">${up ? '▲ +' : '▼ '}${pct}%</div>` : ''}
    </div>`;
  }

  function fmt(v) {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v || 0);
  }

  function fmtHours(minutes) {
    const h = Math.floor((minutes || 0) / 60);
    const m = (minutes || 0) % 60;
    return `${h}h ${m}min`;
  }

  return { load, unload, generate, exportReport, generateWV };
})();

window.PageReports = PageReports;

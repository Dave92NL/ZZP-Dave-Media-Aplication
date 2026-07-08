'use strict';

window.PageYoutube = (() => {
  let _chartInstance = null;
  let _year = new Date().getFullYear();

  const MONTH_NL = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  const MONTH_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

  let _autoSyncUnsubscribe = null;

  async function load() {
    const el = document.getElementById('page-content');
    el.innerHTML = _shell();
    await Promise.all([_loadDashboard(), _updateSyncUI()]);
    _bind();

    // Listen for background auto-sync completions
    _autoSyncUnsubscribe = window.api.on('youtube:autoSynced', async () => {
      await _loadDashboard();
      await _updateSyncUI();
    });
  }

  function unload() {
    _destroyChart();
    if (_autoSyncUnsubscribe) { _autoSyncUnsubscribe(); _autoSyncUnsubscribe = null; }
  }

  function _destroyChart() {
    if (_chartInstance) {
      _chartInstance.destroy();
      _chartInstance = null;
    }
    // fallback: destroy any orphaned chart on this canvas (Chart.js 4 registry)
    const canvas = document.getElementById('yt-revenue-chart');
    if (canvas) {
      const orphan = Chart.getChart(canvas);
      if (orphan) orphan.destroy();
    }
  }

  // ── Shell ────────────────────────────────────────────────
  function _shell() {
    const years = [];
    for (let y = new Date().getFullYear(); y >= 2022; y--) years.push(y);
    return `
<div class="page" style="padding-bottom:32px">

  <!-- Header -->
  <div class="page-header">
    <h1>🎬 YouTube / AdSense</h1>
    <div style="display:flex;gap:8px;align-items:center">
      <select id="yt-year" class="filter-select">
        ${years.map(y => `<option value="${y}"${y===_year?' selected':''}>${y}</option>`).join('')}
      </select>
      <button class="btn btn-secondary btn-sm" id="yt-refresh-btn">↺ Odśwież</button>
      <button class="btn btn-primary btn-sm" id="yt-api-sync-btn" style="display:none">☁ Synchronizuj YT API</button>
      <span id="yt-sync-status" style="font-size:11px;color:var(--text-muted);white-space:nowrap"></span>
    </div>
  </div>

  <!-- KPI row -->
  <div id="yt-kpi-row" class="kpi-grid" style="margin-bottom:20px">
    ${[0,1,2,3,4].map(() => `<div class="skeleton kpi-card" style="height:90px"></div>`).join('')}
  </div>

  <!-- Chart -->
  <div class="card" style="margin-bottom:20px">
    <h3 class="section-title">Przychody + RPM + wyświetlenia — <span id="yt-chart-year"></span></h3>
    <canvas id="yt-revenue-chart" height="70"></canvas>
  </div>

  <!-- Bottom: table + sidebar -->
  <div style="display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start">

    <!-- LEFT: monthly history table -->
    <div>
      <div class="card" style="margin-bottom:20px">
        <h3 class="section-title">Historia miesięczna</h3>
        <div id="yt-history-table" style="overflow-x:auto"></div>
      </div>

      <div class="card">
        <h3 class="section-title">Historia importów</h3>
        <div id="yt-import-history"><div class="skeleton" style="height:60px;border-radius:6px"></div></div>
      </div>
    </div>

    <!-- RIGHT: import + manual -->
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card">
        <h3 class="section-title">Import CSV</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary btn-sm" id="yt-import-adsense-btn">📂 Importuj CSV AdSense</button>
          <p class="text-muted" style="font-size:11px;margin:0;line-height:1.4">
            AdSense → Płatności → Historia → Eksport CSV
          </p>
          <button class="btn btn-secondary btn-sm" id="yt-import-analytics-btn">📂 Importuj CSV YouTube Analytics</button>
          <div style="font-size:11px;color:var(--text-muted);line-height:1.6;margin-top:2px;padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);border-left:3px solid var(--accent-blue)">
            <strong style="color:var(--text-secondary)">Jak pobrać:</strong><br>
            YouTube Studio → Analityka<br>
            → <strong>Przychody</strong><br>
            → <em>Ile zarabiasz</em> → <strong>Pokaż więcej</strong><br>
            → Widok: <strong>Wykres co miesiąc</strong><br>
            → Kliknij <strong>Eksport ↓</strong>
          </div>
          <hr style="border:none;border-top:1px solid var(--border);margin:4px 0">
          <button class="btn btn-danger btn-sm" id="yt-reset-btn">🗑 Wyczyść wszystkie dane YT</button>
        </div>
      </div>

      <div class="card">
        <h3 class="section-title">Dodaj ręcznie</h3>
        <div class="form-grid-1" style="gap:8px">
          <div class="form-group">
            <label style="font-size:12px">Miesiąc / Rok</label>
            <div style="display:flex;gap:6px">
              <select id="yt-m-month" class="filter-select" style="flex:1">
                ${MONTH_PL.map((m,i) => `<option value="${i+1}"${i+1===new Date().getMonth()+1?' selected':''}>${m}</option>`).join('')}
              </select>
              <select id="yt-m-year" class="filter-select" style="width:80px">
                ${years.map(y => `<option value="${y}"${y===_year?' selected':''}>${y}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label style="font-size:12px">Wyświetlenia</label>
            <input type="number" id="yt-m-views" class="filter-select" style="width:100%" min="0" value="0">
          </div>
          <div class="form-group">
            <label style="font-size:12px">Czas oglądania (h)</label>
            <input type="number" id="yt-m-hours" class="filter-select" style="width:100%" min="0" step="0.1" value="0">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div class="form-group">
              <label style="font-size:12px">Nowi sub.</label>
              <input type="number" id="yt-m-subs-gained" class="filter-select" style="width:100%" min="0" value="0">
            </div>
            <div class="form-group">
              <label style="font-size:12px">Utraceni sub.</label>
              <input type="number" id="yt-m-subs-lost" class="filter-select" style="width:100%" min="0" value="0">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div class="form-group">
              <label style="font-size:12px">Przychód AdSense (€)</label>
              <input type="number" id="yt-m-revenue" class="filter-select" style="width:100%" min="0" step="0.01" value="0">
            </div>
            <div class="form-group">
              <label style="font-size:12px">RPM (€)</label>
              <input type="number" id="yt-m-rpm" class="filter-select" style="width:100%" min="0" step="0.001" value="0">
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="yt-m-save-btn" style="margin-top:10px;width:100%">💾 Zapisz</button>
      </div>
    </div>

  </div>
</div>`;
  }

  // ── Load data ────────────────────────────────────────────
  async function _loadDashboard() {
    const [dash, history] = await Promise.all([
      window.api.youtube.getDashboard(_year),
      window.api.youtube.getImportHistory()
    ]);

    _renderKPIs(dash);
    _renderChart(dash);
    _renderHistoryTable(dash);
    _renderImportHistory(history);
  }

  // ── KPIs ─────────────────────────────────────────────────
  function _renderKPIs(dash) {
    const t = dash.totals || {};
    const kpis = [
      { icon:'📈', label:'Wyświetlenia', val: _fmtNum(t.total_views), sub: 'w tym roku' },
      { icon:'⏱',  label:'Czas oglądania', val: _fmtNum(Math.round(t.total_hours||0))+'h', sub: 'w tym roku' },
      { icon:'👥', label:'Nowi sub.', val: '+'+_fmtNum(t.total_subs_gained), sub: '— '+_fmtNum(t.total_subs_lost)+' utraconych' },
      { icon:'💰', label:'Przychód AdSense', val: '€'+_fmtEur(t.total_revenue), sub: 'w tym roku' },
      { icon:'📊', label:'Śr. RPM', val: t.avg_rpm ? '€'+_fmtEur(t.avg_rpm) : '—', sub: 'revenue per mille' }
    ];
    document.getElementById('yt-kpi-row').innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-icon">${k.icon}</div>
        <div class="kpi-value">${k.val}</div>
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-sub" style="font-size:11px;color:var(--text-muted)">${k.sub}</div>
      </div>`).join('');
  }

  // ── Chart ────────────────────────────────────────────────
  function _renderChart(dash) {
    _destroyChart();

    document.getElementById('yt-chart-year').textContent = _year;

    const labels    = MONTH_NL.map(m => `${m} ${String(_year).slice(2)}`);
    const revenueData = Array(12).fill(0);
    const viewsData   = Array(12).fill(0);
    const rpmData     = Array(12).fill(null);

    for (const row of (dash.monthlyRevenue || [])) {
      const idx = parseInt(row.month, 10) - 1;
      if (idx >= 0 && idx < 12) {
        revenueData[idx] = row.revenue || 0;
        viewsData[idx]   = Math.round((row.views || 0) / 1000);
        if (row.avg_rpm) rpmData[idx] = Math.round(row.avg_rpm * 100) / 100;
      }
    }
    // Override revenue with AdSense income_entries if available
    for (const row of (dash.adSenseIncome || [])) {
      const idx = parseInt(row.month, 10) - 1;
      if (idx >= 0 && idx < 12 && row.total) revenueData[idx] = row.total;
    }

    const hasRPM = rpmData.some(v => v !== null);
    const ctx = document.getElementById('yt-revenue-chart')?.getContext('2d');
    if (!ctx) return;

    const datasets = [
      {
        type: 'bar',
        label: 'Przychód AdSense (€)',
        backgroundColor: 'rgba(63,185,80,0.7)',
        data: revenueData,
        yAxisID: 'y-rev',
        order: 3
      },
      {
        type: 'line',
        label: 'Wyświetlenia (tys.)',
        borderColor: '#58A6FF',
        backgroundColor: 'rgba(88,166,255,0.08)',
        data: viewsData,
        yAxisID: 'y-views',
        tension: 0.3,
        fill: true,
        order: 2,
        pointRadius: 3
      }
    ];

    if (hasRPM) {
      datasets.push({
        type: 'line',
        label: 'RPM (€)',
        borderColor: '#F7A23C',
        backgroundColor: 'transparent',
        data: rpmData,
        yAxisID: 'y-rpm',
        tension: 0.3,
        fill: false,
        order: 1,
        pointRadius: 3,
        borderDash: [4, 3]
      });
    }

    const scales = {
      x: { ticks: { color: '#8B949E' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      'y-rev': {
        type: 'linear', position: 'left',
        ticks: { color: '#3FB950', callback: v => '€'+v },
        grid: { color: 'rgba(255,255,255,0.05)' }
      },
      'y-views': {
        type: 'linear', position: 'right',
        ticks: { color: '#58A6FF', callback: v => v+'k' },
        grid: { drawOnChartArea: false }
      }
    };

    if (hasRPM) {
      scales['y-rpm'] = {
        type: 'linear', position: 'right',
        ticks: { color: '#F7A23C', callback: v => '€'+v },
        grid: { drawOnChartArea: false },
        offset: true
      };
    }

    _chartInstance = new Chart(ctx, {
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { mode: 'index' },
        plugins: { legend: { labels: { color: '#8B949E' } } },
        scales
      }
    });
  }

  // ── History table ─────────────────────────────────────────
  function _renderHistoryTable(dash) {
    const rows = [...(dash.monthlyRevenue || [])].reverse();
    const el = document.getElementById('yt-history-table');
    if (!rows.length) { el.innerHTML = '<p class="text-muted" style="padding:16px;text-align:center">Brak danych. Dodaj statystyki lub importuj CSV.</p>'; return; }

    const adsByMonth = {};
    for (const r of (dash.adSenseIncome || [])) adsByMonth[r.month] = r.total;

    el.innerHTML = `<table><thead><tr>
      <th>Miesiąc</th><th>Wyświetlenia</th><th>Czas ogl.</th><th>Subskr. ±</th><th>Przychód</th><th>RPM</th>
    </tr></thead><tbody>
    ${rows.map(r => {
      const m = parseInt(r.month, 10);
      const rev = adsByMonth[r.month] ?? r.revenue ?? 0;
      const rpm = r.avg_rpm ? '€'+_fmtEur(r.avg_rpm) : '—';
      return `<tr>
        <td>${MONTH_PL[m-1]} ${_year}</td>
        <td>${_fmtNum(r.views)}</td>
        <td>${_fmtNum(Math.round(r.hours||0))}h</td>
        <td style="color:var(--accent-green)">+${_fmtNum(r.subscribers_gained||0)}</td>
        <td style="color:var(--accent-green)">€${_fmtEur(rev)}</td>
        <td style="color:#F7A23C">${rpm}</td>
      </tr>`;
    }).join('')}
    </tbody></table>`;
  }

  // ── Import history ────────────────────────────────────────
  function _renderImportHistory(items) {
    const el = document.getElementById('yt-import-history');
    if (!items?.length) { el.innerHTML = '<p class="text-muted" style="font-size:12px">Brak importów.</p>'; return; }
    el.innerHTML = items.slice(0,10).map(i => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span>📊 ${UI.esc(i.filename)}</span>
        <span style="color:var(--text-muted)">${(i.import_date||'').slice(0,10)}</span>
        <span style="color:var(--accent-green)">${i.total_amount ? '€'+_fmtEur(i.total_amount) : '—'}</span>
        <span class="badge badge-success">✅</span>
      </div>`).join('');
  }

  // ── Bind events ───────────────────────────────────────────
  function _bind() {
    document.getElementById('yt-year')?.addEventListener('change', async e => {
      _year = +e.target.value;
      await _loadDashboard();
    });
    document.getElementById('yt-refresh-btn')?.addEventListener('click', _loadDashboard);

    document.getElementById('yt-api-sync-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('yt-api-sync-btn');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Synchronizacja…'; }
      try {
        const r = await window.api.youtube.syncStats(_year);
        UI.toast(`☁ Zsynchronizowano ${r.rowsSynced} wpisów (${r.dateFrom} – ${r.dateTo})`, 'success');
        await _loadDashboard();
        await _updateSyncUI();
      } catch (e) {
        UI.toast('Błąd synchronizacji: ' + e.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '☁ Synchronizuj YT API'; }
      }
    });

    document.getElementById('yt-import-adsense-btn')?.addEventListener('click', async () => {
      try {
        const r = await window.api.youtube.importAdSenseCSV();
        if (!r) return;
        UI.toast(`Zaimportowano ${r.rowsImported} wpisów | €${_fmtEur(r.totalAmount)}`, 'success');
        await _loadDashboard();
      } catch (e) { UI.toast('Błąd importu: ' + e.message, 'error'); }
    });

    document.getElementById('yt-reset-btn')?.addEventListener('click', async () => {
      const ok = await UI.confirm('Usunąć wszystkie zaimportowane dane YouTube (statystyki, historia importów, przychody AdSense)?');
      if (!ok) return;
      await window.api.youtube.resetData();
      UI.toast('Dane YouTube wyczyszczone', 'success');
      await _loadDashboard();
    });

    document.getElementById('yt-import-analytics-btn')?.addEventListener('click', async () => {
      try {
        const r = await window.api.youtube.importAnalyticsCSV();
        if (!r) return;
        UI.toast(`Zaimportowano ${r.rowsImported} ${r.rowsImported === 1 ? 'miesiąc' : 'miesięcy'}`, 'success');
        await _loadDashboard();
      } catch (e) { UI.toast('Błąd importu: ' + e.message, 'error'); }
    });

    document.getElementById('yt-m-save-btn')?.addEventListener('click', async () => {
      const month = +document.getElementById('yt-m-month').value;
      const year  = +document.getElementById('yt-m-year').value;
      const date  = `${year}-${String(month).padStart(2,'0')}-01`;
      await window.api.youtube.addStats({
        date,
        views:               +document.getElementById('yt-m-views').value,
        watch_time_hours:    +document.getElementById('yt-m-hours').value,
        subscribers_gained:  +document.getElementById('yt-m-subs-gained').value,
        subscribers_lost:    +document.getElementById('yt-m-subs-lost').value,
        estimated_revenue:   +document.getElementById('yt-m-revenue').value,
        rpm:                 +document.getElementById('yt-m-rpm').value
      });
      UI.toast('Statystyki zapisane', 'success');
      await _loadDashboard();
    });
  }

  // ── Sync UI ───────────────────────────────────────────────
  async function _updateSyncUI() {
    try {
      const status = await window.api.youtube.getAuthStatus();
      const syncBtn    = document.getElementById('yt-api-sync-btn');
      const statusSpan = document.getElementById('yt-sync-status');
      if (!syncBtn || !statusSpan) return;

      if (status.connected) {
        syncBtn.style.display = '';
        if (status.lastSync) {
          const d = new Date(parseInt(status.lastSync));
          const fmt = d.toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          statusSpan.textContent = `Ostatni sync: ${fmt}`;
        } else {
          statusSpan.textContent = 'Połączono — synchronizuj teraz';
        }
      } else {
        syncBtn.style.display = 'none';
        statusSpan.textContent = '';
      }
    } catch (_) { /* getAuthStatus might fail during load — ignore */ }
  }

  // ── Helpers ───────────────────────────────────────────────
  function _fmtNum(n) { return Number(n||0).toLocaleString('nl-NL'); }
  function _fmtEur(n) { return Number(n||0).toLocaleString('nl-NL', { minimumFractionDigits:2, maximumFractionDigits:2 }); }

  return { load, unload };
})();

/* Mileage page — kilometrówka (rejestr przejazdów służbowych, odliczenie €/km) */
'use strict';

const PageMileage = (() => {
  let entries = [];
  let clients = [];
  let projects = [];
  let summary = null;
  let filters = { year: new Date().getFullYear(), month: '' };

  async function load() {
    document.getElementById('page-content').innerHTML = `
      <div class="page" id="mileage-page">
        <div class="page-header">
          <h1 class="page-title">🚗 Kilometrówka</h1>
          <div class="page-actions">
            <button class="btn btn-primary" onclick="PageMileage.openCreate()">+ Dodaj przejazd</button>
          </div>
        </div>

        <div id="mileage-summary" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px"></div>

        <div class="card" style="margin-bottom:16px;padding:12px 16px">
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
            <select id="mil-f-year" class="filter-select" onchange="PageMileage.applyFilters()">${yearOptions()}</select>
            <select id="mil-f-month" class="filter-select" onchange="PageMileage.applyFilters()">
              <option value="">Wszystkie miesiące</option>
              ${monthOptions()}
            </select>
          </div>
        </div>

        <div class="card" style="overflow-x:auto" id="mileage-table-wrap">
          <div style="padding:40px;text-align:center;color:var(--text-muted)">Ładowanie…</div>
        </div>
      </div>`;

    try {
      [clients, projects] = await Promise.all([
        window.api.contacts.getAll(),
        window.api.projects.getAll()
      ]);
      await refresh();
    } catch (err) {
      console.error('Mileage load error:', err);
    }
  }

  async function refresh() {
    try {
      const f = {};
      if (filters.year) f.year = filters.year;
      if (filters.month) f.month = filters.month;
      [entries, summary] = await Promise.all([
        window.api.mileage.getAll(f),
        window.api.mileage.getSummary(filters.year)
      ]);
      renderSummary();
      renderTable();
    } catch (err) {
      console.error('Mileage refresh error:', err);
    }
  }

  function applyFilters() {
    filters.year = document.getElementById('mil-f-year')?.value || new Date().getFullYear();
    filters.month = document.getElementById('mil-f-month')?.value || '';
    refresh();
  }

  function renderSummary() {
    const el = document.getElementById('mileage-summary');
    if (!el || !summary) return;
    el.innerHTML = `
      <div class="card" style="padding:14px 18px;min-width:170px">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Kilometry ${summary.year}</div>
        <div style="font-size:22px;font-weight:700">${fmtKm(summary.total_km)} km</div>
      </div>
      <div class="card" style="padding:14px 18px;min-width:170px">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Odliczenie ${summary.year}</div>
        <div style="font-size:22px;font-weight:700;color:var(--accent-green)">${fmtEur(summary.total_deduction)}</div>
      </div>
      <div class="card" style="padding:14px 18px;min-width:170px">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Przejazdy</div>
        <div style="font-size:22px;font-weight:700">${summary.entry_count}</div>
      </div>
      <div class="card" style="padding:14px 18px;min-width:170px">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Stawka</div>
        <div style="font-size:22px;font-weight:700">€ ${Number(summary.default_rate).toFixed(2)}/km</div>
      </div>`;
  }

  function renderTable() {
    const wrap = document.getElementById('mileage-table-wrap');
    if (!wrap) return;

    if (!entries.length) {
      wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Brak przejazdów w wybranym okresie.</div>';
      return;
    }

    wrap.innerHTML = `
      <table style="width:100%;font-size:13px">
        <thead><tr>
          <th style="padding:8px;text-align:left">Data</th>
          <th style="padding:8px;text-align:left">Trasa</th>
          <th style="padding:8px;text-align:left">Cel</th>
          <th style="padding:8px;text-align:left">Klient / projekt</th>
          <th style="padding:8px;text-align:right">Km</th>
          <th style="padding:8px;text-align:right">Odliczenie</th>
          <th style="padding:8px;width:70px"></th>
        </tr></thead>
        <tbody>
          ${entries.map(e => `
            <tr>
              <td style="padding:8px" class="mono">${fmtDate(e.date)}</td>
              <td style="padding:8px">${UI.esc(e.from_location || '')} → ${UI.esc(e.to_location || '')}${e.is_return ? ' <span class="badge badge-muted" title="Tam i z powrotem">⇄</span>' : ''}</td>
              <td style="padding:8px">${UI.esc(e.purpose || '—')}</td>
              <td style="padding:8px" class="text-muted">${UI.esc(e.client_name || e.project_name || '—')}</td>
              <td style="padding:8px;text-align:right" class="mono">${fmtKm(e.total_km)}</td>
              <td style="padding:8px;text-align:right" class="mono">${fmtEur(e.deduction)}</td>
              <td style="padding:8px;text-align:right;white-space:nowrap">
                <button class="btn btn-icon btn-sm btn-secondary" title="Edytuj" onclick="PageMileage.openEdit(${e.id})">✏️</button>
                <button class="btn btn-icon btn-sm btn-danger" title="Usuń" onclick="PageMileage.deleteEntry(${e.id})">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  // ── Form ─────────────────────────────────────────────────
  function openCreate() { showForm(null, { date: todayStr(), is_return: 1 }); }

  function openEdit(id) {
    const e = entries.find(x => x.id === id);
    if (e) showForm(id, e);
  }

  function showForm(id, e) {
    const clientOptions = '<option value="">— brak —</option>' + clients.map(c =>
      `<option value="${c.id}" ${e.client_id == c.id ? 'selected' : ''}>${UI.esc(c.name)}</option>`).join('');
    const projectOptions = '<option value="">— brak —</option>' + projects.map(p =>
      `<option value="${p.id}" ${e.project_id == p.id ? 'selected' : ''}>${UI.esc(p.name)}</option>`).join('');

    UI.openModal(id ? 'Edytuj przejazd' : 'Nowy przejazd', `
      <div class="form-grid-2">
        <div class="form-group">
          <label>Data *</label>
          <input type="date" id="mil-date" value="${e.date || todayStr()}">
        </div>
        <div class="form-group">
          <label>Dystans w jedną stronę (km) *</label>
          <input type="number" id="mil-km" value="${e.distance_km || ''}" min="0.1" step="0.1" placeholder="np. 24.5">
        </div>
        <div class="form-group">
          <label>Skąd</label>
          <input type="text" id="mil-from" value="${UI.esc(e.from_location || '')}" placeholder="np. Alphen aan den Rijn">
        </div>
        <div class="form-group">
          <label>Dokąd</label>
          <input type="text" id="mil-to" value="${UI.esc(e.to_location || '')}" placeholder="np. Amsterdam">
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0 12px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="mil-return" ${e.is_return ? 'checked' : ''}>
        Tam i z powrotem (km ×2)
      </label>
      <div class="form-group">
        <label>Cel przejazdu</label>
        <input type="text" id="mil-purpose" value="${UI.esc(e.purpose || '')}" placeholder="np. nagranie materiału, spotkanie z klientem">
      </div>
      <div class="form-grid-2">
        <div class="form-group">
          <label>Klient (opcjonalnie)</label>
          <select id="mil-client">${clientOptions}</select>
        </div>
        <div class="form-group">
          <label>Projekt (opcjonalnie)</label>
          <select id="mil-project">${projectOptions}</select>
        </div>
      </div>
      <div class="form-group" style="max-width:160px">
        <label>Stawka €/km</label>
        <input type="number" id="mil-rate" value="${e.rate_per_km != null ? e.rate_per_km : 0.23}" min="0" step="0.01">
      </div>`,
      {
        footer: `
          <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
          <button class="btn btn-primary" onclick="PageMileage.save(${id || 'null'})">💾 Zapisz</button>`
      }
    );
  }

  async function save(id) {
    const data = {
      date: document.getElementById('mil-date')?.value,
      distance_km: parseFloat(document.getElementById('mil-km')?.value) || 0,
      from_location: document.getElementById('mil-from')?.value?.trim() || '',
      to_location: document.getElementById('mil-to')?.value?.trim() || '',
      is_return: document.getElementById('mil-return')?.checked ? 1 : 0,
      purpose: document.getElementById('mil-purpose')?.value?.trim() || '',
      client_id: document.getElementById('mil-client')?.value || null,
      project_id: document.getElementById('mil-project')?.value || null,
      rate_per_km: parseFloat(document.getElementById('mil-rate')?.value) || 0.23
    };
    if (!data.date) { UI.toast('Data jest wymagana.', 'warning'); return; }
    if (!data.distance_km || data.distance_km <= 0) { UI.toast('Podaj dystans w km.', 'warning'); return; }

    try {
      if (id) {
        await window.api.mileage.update(id, data);
        UI.toast('Przejazd zaktualizowany.', 'success');
      } else {
        await window.api.mileage.create(data);
        UI.toast('Przejazd zapisany.', 'success');
      }
      UI.closeModal();
      await refresh();
    } catch (err) {
      UI.toast('Błąd zapisu: ' + err.message, 'error');
    }
  }

  function deleteEntry(id) {
    UI.openModal('🗑 Usuń przejazd', '<p>Czy na pewno usunąć ten przejazd?</p>', {
      footer: `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
        <button class="btn btn-danger" onclick="PageMileage.confirmDelete(${id})">Usuń</button>`
    });
  }

  async function confirmDelete(id) {
    try {
      await window.api.mileage.delete(id);
      UI.toast('Przejazd usunięty.', 'success');
      UI.closeModal();
      await refresh();
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  function fmtKm(v) { return Number(v || 0).toLocaleString('nl-NL', { maximumFractionDigits: 1 }); }
  function fmtEur(v) { return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(v || 0); }
  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`;
  }
  function todayStr() { return new Date().toISOString().split('T')[0]; }

  function yearOptions() {
    const cur = new Date().getFullYear();
    return [cur+1, cur, cur-1, cur-2].map(y =>
      `<option value="${y}" ${y == filters.year ? 'selected' : ''}>${y}</option>`).join('');
  }

  function monthOptions() {
    const names = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
                   'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
    return names.map((n, i) =>
      `<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0') == filters.month ? 'selected' : ''}>${n}</option>`).join('');
  }

  return {
    load, refresh, applyFilters,
    openCreate, openEdit, save,
    deleteEntry, confirmDelete
  };
})();

window.PageMileage = PageMileage;

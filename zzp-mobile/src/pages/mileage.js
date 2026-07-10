import { todayStr, fmtDateNL, fmtEur, escHtml } from '../lib/format.js';
import { navigate } from '../router.js';
import * as repo from '../data/repo.js';

const DEFAULT_RATE = 0.23; // stawka kilometrówki 2024/2025 (NL)

function totalKm(m) {
  return Number(m.distance_km || 0) * (m.is_return ? 2 : 1);
}

function deduction(m) {
  return totalKm(m) * (Number(m.rate_per_km) || DEFAULT_RATE);
}

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <h1 class="page-title">🚗 Kilometrówka</h1>

      <details class="manual-details">
        <summary>➕ Dopisz przejazd</summary>
        <div class="card-form">
          <div class="form-grid-2">
            <div class="form-group"><label>Data</label><input type="date" id="km-date" value="${todayStr()}"></div>
            <div class="form-group"><label>Kilometry (w jedną stronę)</label><input type="number" id="km-distance" step="0.1" min="0" placeholder="np. 42" inputmode="decimal"></div>
          </div>
          <div class="form-grid-2">
            <div class="form-group"><label>Skąd</label><input type="text" id="km-from" placeholder="np. Amsterdam"></div>
            <div class="form-group"><label>Dokąd</label><input type="text" id="km-to" placeholder="np. Rotterdam"></div>
          </div>
          <label class="check-row"><input type="checkbox" id="km-return" checked> Przejazd w obie strony (×2)</label>
          <div class="form-group"><label>Cel przejazdu</label><input type="text" id="km-purpose" placeholder="np. spotkanie z klientem"></div>
          <div class="form-group"><label>Klient</label><select id="km-client"><option value="">— brak —</option></select></div>
          <div class="form-group"><label>Projekt</label><select id="km-project"><option value="">— brak —</option></select></div>
          <div class="form-group"><label>Stawka za km (€)</label><input type="number" id="km-rate" step="0.01" min="0" value="${DEFAULT_RATE}" inputmode="decimal"></div>
          <div id="km-error" class="error-msg hidden"></div>
          <button class="btn btn-secondary btn-block" id="km-save-btn">💾 Zapisz przejazd</button>
        </div>
      </details>

      <div id="km-summary" class="summary-box hidden"></div>

      <h3 class="section-title">Ostatnie przejazdy</h3>
      <div id="km-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;

  await _loadOptions();
  document.getElementById('km-save-btn').addEventListener('click', _save);
  await _renderList();
}

async function _loadOptions() {
  try {
    const [clients, projects] = await Promise.all([repo.listActiveClients(), repo.listProjects()]);
    const cSel = document.getElementById('km-client');
    if (cSel) cSel.innerHTML = '<option value="">— brak —</option>' +
      clients.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
    const pSel = document.getElementById('km-project');
    if (pSel) pSel.innerHTML = '<option value="">— brak —</option>' +
      projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  } catch { /* offline — opcje z cache lub puste */ }
}

async function _save() {
  const distance = parseFloat(document.getElementById('km-distance').value);
  const date = document.getElementById('km-date').value;
  const errorEl = document.getElementById('km-error');
  errorEl.classList.add('hidden');
  if (!date) { errorEl.textContent = 'Data jest wymagana.'; errorEl.classList.remove('hidden'); return; }
  if (!distance || distance <= 0) { errorEl.textContent = 'Podaj liczbę kilometrów.'; errorEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('km-save-btn');
  btn.disabled = true; btn.textContent = '⏳ Zapisywanie…';
  try {
    await repo.createMileage({
      date,
      from_location: document.getElementById('km-from').value.trim(),
      to_location: document.getElementById('km-to').value.trim(),
      distance_km: distance,
      is_return: document.getElementById('km-return').checked,
      purpose: document.getElementById('km-purpose').value.trim(),
      client_id: document.getElementById('km-client').value || null,
      project_id: document.getElementById('km-project').value || null,
      rate_per_km: parseFloat(document.getElementById('km-rate').value) || DEFAULT_RATE
    });
    navigate('mileage');
  } catch (err) {
    errorEl.textContent = err.message; errorEl.classList.remove('hidden');
    btn.disabled = false; btn.textContent = '💾 Zapisz przejazd';
  }
}

async function _renderList() {
  const wrap = document.getElementById('km-list-wrap');
  try {
    const entries = await repo.listMileage(100);
    if (!entries.length) { wrap.innerHTML = '<p class="text-muted">Brak przejazdów.</p>'; return; }

    const sumKm = entries.reduce((s, m) => s + totalKm(m), 0);
    const sumDed = entries.reduce((s, m) => s + deduction(m), 0);
    const summary = document.getElementById('km-summary');
    summary.classList.remove('hidden');
    summary.innerHTML = `
      <div><span class="text-muted">Razem km</span><strong>${sumKm.toFixed(0)} km</strong></div>
      <div><span class="text-muted">Odliczenie</span><strong>${fmtEur(sumDed)}</strong></div>`;

    wrap.innerHTML = entries.map(m => {
      const route = [m.from_location, m.to_location].filter(Boolean).join(' → ') || (m.purpose || '—');
      const tag = m.client_name || m.project_name || 'bez przypisania';
      return `
      <div class="list-card">
        <div class="list-card-header">
          <span class="badge badge-info">${totalKm(m).toFixed(0)} km${m.is_return ? ' ⇄' : ''}</span>
          <span>${m._pending ? '<span class="badge badge-pending">⏳ oczekuje</span>' : ''}</span>
        </div>
        <div class="list-card-body">
          <div>${escHtml(route)}</div>
          <div class="text-muted">${escHtml(tag)} · ${fmtDateNL(m.date)}</div>
        </div>
        <div class="list-card-amount">${fmtEur(deduction(m))}</div>
      </div>`;
    }).join('');
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania przejazdów: ${escHtml(err.message)}</p>`;
  }
}

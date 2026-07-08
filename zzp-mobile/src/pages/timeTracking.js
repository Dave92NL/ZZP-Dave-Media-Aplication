import { todayStr, fmtDateNL, escHtml } from '../lib/format.js';
import { navigate } from '../router.js';
import * as repo from '../data/repo.js';

const CATEGORIES = [
  'YouTube/Archiwum Zła', 'Edycja wideo', 'Research/Scenariusz',
  'Administracja ZZP', 'Marketing/Social Media', 'IT/Techniczne', 'Inne'
];

let _tickInterval = null;

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function catOptions(selected) {
  return CATEGORIES.map(c => `<option value="${escHtml(c)}"${c === selected ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
}

export async function load() {
  if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }

  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <h1 class="page-title">⏱️ Czas pracy</h1>
      <div id="timer-zone"></div>

      <details class="manual-details">
        <summary>➕ Dopisz godziny ręcznie</summary>
        <div class="card-form">
          <div class="form-group"><label>Kategoria</label><select id="tm-category">${catOptions('Edycja wideo')}</select></div>
          <div class="form-group"><label>Projekt</label><select id="tm-project"><option value="">— brak —</option></select></div>
          <div class="form-grid-2">
            <div class="form-group"><label>Data</label><input type="date" id="tm-date" value="${todayStr()}"></div>
            <div class="form-group"><label>Godziny</label><input type="number" id="tm-hours" step="0.25" min="0" placeholder="np. 2.5" inputmode="decimal"></div>
          </div>
          <div class="form-group"><label>Opis</label><input type="text" id="tm-desc" placeholder="Co robiłeś?"></div>
          <label class="check-row"><input type="checkbox" id="tm-billable" checked> Rozliczalne (do faktury)</label>
          <div id="tm-error" class="error-msg hidden"></div>
          <button class="btn btn-secondary btn-block" id="tm-save-btn">💾 Zapisz wpis</button>
        </div>
      </details>

      <h3 class="section-title">Ostatnie wpisy</h3>
      <div id="tm-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;

  await _loadProjectOptions();
  document.getElementById('tm-save-btn').addEventListener('click', _saveManual);

  await _renderTimer();
  await _renderList();
}

async function _loadProjectOptions() {
  const projects = await repo.listProjects();
  const opts = '<option value="">— brak —</option>' +
    projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  const tm = document.getElementById('tm-project');
  if (tm) tm.innerHTML = opts;
  const st = document.getElementById('tk-project');
  if (st) st.innerHTML = opts;
}

async function _renderTimer() {
  const zone = document.getElementById('timer-zone');
  const timer = await repo.getRunningTimer();

  if (timer) {
    zone.innerHTML = `
      <div class="timer-running">
        <div class="timer-elapsed" id="timer-elapsed">00:00:00</div>
        <div class="timer-meta text-muted">${escHtml(timer.category)}${timer.description ? ' · ' + escHtml(timer.description) : ''}</div>
        <button class="btn btn-danger btn-block" id="timer-stop-btn">⏹ Zatrzymaj i zapisz</button>
      </div>
    `;
    const startedAt = new Date(timer.started_at).getTime();
    const update = () => {
      const elapsedEl = document.getElementById('timer-elapsed');
      if (!elapsedEl) { clearInterval(_tickInterval); _tickInterval = null; return; }
      elapsedEl.textContent = fmtElapsed(Date.now() - startedAt);
    };
    update();
    _tickInterval = setInterval(update, 1000);
    document.getElementById('timer-stop-btn').addEventListener('click', () => _stopTimer(timer));
  } else {
    zone.innerHTML = `
      <div class="timer-idle card-form">
        <div class="form-group"><label>Kategoria</label><select id="tk-category">${catOptions('Edycja wideo')}</select></div>
        <div class="form-group"><label>Projekt</label><select id="tk-project"><option value="">— brak —</option></select></div>
        <div class="form-group"><label>Opis</label><input type="text" id="tk-desc" placeholder="Nad czym pracujesz?"></div>
        <label class="check-row"><input type="checkbox" id="tk-billable" checked> Rozliczalne (do faktury)</label>
        <button class="btn btn-primary btn-block" id="timer-start-btn">▶ Start licznika</button>
      </div>
    `;
    await _loadProjectOptions();
    document.getElementById('timer-start-btn').addEventListener('click', _startTimer);
  }
}

async function _startTimer() {
  const timer = {
    category: document.getElementById('tk-category').value,
    project_id: document.getElementById('tk-project').value || null,
    description: document.getElementById('tk-desc').value.trim(),
    is_billable: document.getElementById('tk-billable').checked,
    started_at: new Date().toISOString()
  };
  await repo.setRunningTimer(timer);
  await _renderTimer();
}

async function _stopTimer(timer) {
  if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
  const start = new Date(timer.started_at);
  const end = new Date();
  const durationMinutes = Math.max(1, Math.round((end - start) / 60000));

  try {
    await repo.createTimeEntry({
      project_id: timer.project_id || null, invoice_id: null,
      category: timer.category, description: timer.description || '',
      start_time: timer.started_at, end_time: end.toISOString(),
      duration_minutes: durationMinutes, is_pomodoro: false,
      is_billable: timer.is_billable !== false, date: start.toISOString().slice(0, 10)
    });
    await repo.clearRunningTimer();
    navigate('time'); // przeładuj widok z nowym wpisem
  } catch (err) {
    alert('Nie udało się zapisać wpisu: ' + err.message);
  }
}

async function _saveManual() {
  const hours = parseFloat(document.getElementById('tm-hours').value);
  const date = document.getElementById('tm-date').value;
  const errorEl = document.getElementById('tm-error');
  errorEl.classList.add('hidden');
  if (!hours || hours <= 0) { errorEl.textContent = 'Podaj liczbę godzin.'; errorEl.classList.remove('hidden'); return; }
  if (!date) { errorEl.textContent = 'Data jest wymagana.'; errorEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('tm-save-btn');
  btn.disabled = true; btn.textContent = '⏳ Zapisywanie…';
  try {
    await repo.createTimeEntry({
      project_id: document.getElementById('tm-project').value || null, invoice_id: null,
      category: document.getElementById('tm-category').value,
      description: document.getElementById('tm-desc').value.trim(),
      start_time: null, end_time: null,
      duration_minutes: Math.round(hours * 60), is_pomodoro: false,
      is_billable: document.getElementById('tm-billable').checked, date
    });
    navigate('time');
  } catch (err) {
    errorEl.textContent = err.message; errorEl.classList.remove('hidden');
    btn.disabled = false; btn.textContent = '💾 Zapisz wpis';
  }
}

async function _renderList() {
  const wrap = document.getElementById('tm-list-wrap');
  try {
    const entries = await repo.listTimeEntries(100);
    if (!entries.length) { wrap.innerHTML = '<p class="text-muted">Brak wpisów.</p>'; return; }

    wrap.innerHTML = entries.map(t => `
      <div class="list-card">
        <div class="list-card-header">
          <span class="badge badge-info">${escHtml(t.category)}</span>
          <span>
            ${t._pending ? '<span class="badge badge-pending">⏳ oczekuje</span>' : ''}
            ${t.is_billable ? '' : '<span class="badge badge-muted">nierozl.</span>'}
          </span>
        </div>
        <div class="list-card-body">
          <div>${escHtml(t.description || '—')}</div>
          <div class="text-muted">${escHtml(t.project_name || 'bez projektu')} · ${fmtDateNL(t.date)}</div>
        </div>
        <div class="list-card-amount">${fmtDuration(t.duration_minutes)}</div>
      </div>`).join('');
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania wpisów: ${escHtml(err.message)}</p>`;
  }
}

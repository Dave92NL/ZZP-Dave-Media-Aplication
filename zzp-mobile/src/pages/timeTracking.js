import { todayStr, fmtDateNL, escHtml } from '../lib/format.js';
import { navigate } from '../router.js';
import * as repo from '../data/repo.js';
import { translateWidgetHTML } from '../lib/translateWidget.js';
import { icon } from '../lib/icons.js';
import { progressRing } from '../lib/charts.js';

const WORKDAY_MS = 8 * 3600 * 1000; // pełny pierścień = 8 h dnia pracy

const CATEGORIES = [
  'YouTube/Archiwum Zła', 'Edycja wideo', 'Research/Scenariusz',
  'Administracja ZZP', 'Marketing/Social Media', 'IT/Techniczne', 'Inne'
];

let _tickInterval = null;
let _entries = [];      // ostatnio wczytane wpisy (do formularza edycji)
let _projects = [];     // cache projektów (do selecta w edycji)
let _editingId = null;  // id aktualnie edytowanego wpisu (null = lista)

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

function projectOptions(selectedId) {
  return '<option value="">— brak —</option>' +
    _projects.map(p => `<option value="${p.id}"${String(p.id) === String(selectedId) ? ' selected' : ''}>${escHtml(p.name)}</option>`).join('');
}

// Godziny (liczba dziesiętna) z minut, ładnie skrócone (np. 2.5, 1.25, 3).
function hoursFromMinutes(minutes) {
  const h = (Number(minutes) || 0) / 60;
  return String(Math.round(h * 100) / 100);
}

export async function load() {
  if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }

  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <div class="page-head">
        <h1 class="page-title">Czas pracy</h1>
        <button class="icon-btn" id="tm-cal" aria-label="Dopisz ręcznie">${icon('calendar', { size: 20 })}</button>
      </div>
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
          <div class="form-group"><label>Przerwa (min)</label><input type="number" id="tm-break" min="0" step="5" placeholder="np. 45"></div>
          <div class="form-group"><label>Opis</label><div class="tr-field" style="display:flex;align-items:center;gap:6px"><input type="text" id="tm-desc" placeholder="Co robiłeś?" style="flex:1">${translateWidgetHTML('tm-desc')}</div></div>
          <label class="check-row"><input type="checkbox" id="tm-billable" checked> Rozliczalne (do faktury)</label>
          <div id="tm-error" class="error-msg hidden"></div>
          <button class="btn btn-secondary btn-block" id="tm-save-btn">💾 Zapisz wpis</button>
        </div>
      </details>

      <h3 class="section-title">Ostatnie sesje</h3>
      <div id="tm-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;

  await _loadProjectOptions();
  document.getElementById('tm-save-btn').addEventListener('click', _saveManual);
  document.getElementById('tm-cal').addEventListener('click', () => {
    const d = document.querySelector('.manual-details');
    if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });

  await _renderTimer();
  await _renderList();
}

async function _loadProjectOptions() {
  const projects = await repo.listProjects();
  _projects = projects;
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
    const startTime = new Date(timer.started_at);
    const startHM = String(startTime.getHours()).padStart(2, '0') + ':' + String(startTime.getMinutes()).padStart(2, '0');
    const projName = timer.project_id ? (_projects.find(p => String(p.id) === String(timer.project_id))?.name || '—') : null;
    zone.innerHTML = `
      <div class="timer-card">
        <div class="timer-ring-wrap" id="timer-ring"></div>
        <div class="timer-startedat"><span class="dot"></span>Rozpoczęto: ${startHM}</div>
        <div class="timer-project">${icon('folder', { size: 16 })}${projName ? 'Projekt: ' + escHtml(projName) : escHtml(timer.category)}</div>
        <button class="btn btn-accent-blue btn-block" id="timer-stop-btn">${icon('stop', { size: 18 })} Zatrzymaj</button>
      </div>
    `;
    const startedAt = startTime.getTime();
    const ringEl = document.getElementById('timer-ring');
    const renderRing = (elapsedMs) => `
      ${progressRing(Math.min(1, elapsedMs / WORKDAY_MS), { color: 'var(--accent-blue)' })}
      <div class="ring-center">
        <span class="ring-top">Dzisiaj</span>
        <span class="ring-time">${fmtElapsed(elapsedMs)}</span>
        <span class="ring-label">Godzin</span>
      </div>`;
    ringEl.innerHTML = renderRing(0);
    const update = () => {
      const el2 = document.getElementById('timer-ring');
      if (!el2) { clearInterval(_tickInterval); _tickInterval = null; return; }
      el2.innerHTML = renderRing(Date.now() - startedAt);
    };
    update();
    _tickInterval = setInterval(update, 1000);
    document.getElementById('timer-stop-btn').addEventListener('click', () => _stopTimer(timer));
  } else {
    zone.innerHTML = `
      <div class="timer-idle card-form">
        <div class="form-group"><label>Kategoria</label><select id="tk-category">${catOptions('Edycja wideo')}</select></div>
        <div class="form-group"><label>Projekt</label><select id="tk-project"><option value="">— brak —</option></select></div>
        <div class="form-group"><label>Opis</label><div class="tr-field" style="display:flex;align-items:center;gap:6px"><input type="text" id="tk-desc" placeholder="Nad czym pracujesz?" style="flex:1">${translateWidgetHTML('tk-desc')}</div></div>
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
      break_minutes: Math.max(0, parseInt(document.getElementById('tm-break').value) || 0),
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
    _entries = await repo.listTimeEntries(100);
    if (_editingId) { _renderEditForm(_editingId); return; }
    if (!_entries.length) { wrap.innerHTML = '<p class="text-muted">Brak wpisów.</p>'; return; }

    wrap.innerHTML = _entries.map(t => {
      const title = t.description?.trim() || t.category;
      const sub = `${escHtml(t.project_name || t.category)} · ${fmtDateNL(t.date)}`;
      const flags = [
        t._pending ? '<span class="pill pill-yellow"><span class="pill-dot"></span>oczekuje</span>' : '',
        t.is_billable ? '' : '<span class="badge badge-muted">nierozl.</span>'
      ].filter(Boolean).join(' ');
      return `
      <div class="session-row" data-id="${t.id}" role="button" tabindex="0">
        <div class="session-main">
          <div class="session-title">${escHtml(title)}</div>
          <div class="session-sub">${sub}${flags ? ' · ' + flags : ''}</div>
        </div>
        <div class="session-dur">${fmtDuration(t.duration_minutes)}</div>
        <span class="session-chevron">${icon('chevronRight', { size: 18 })}</span>
      </div>`;
    }).join('');

    wrap.querySelectorAll('.session-row[data-id]').forEach(card => {
      card.addEventListener('click', () => _renderEditForm(card.dataset.id));
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania wpisów: ${escHtml(err.message)}</p>`;
  }
}

function _renderEditForm(id) {
  const entry = _entries.find(t => String(t.id) === String(id));
  const wrap = document.getElementById('tm-list-wrap');
  if (!entry) { _editingId = null; _renderList(); return; }
  _editingId = id;

  wrap.innerHTML = `
    <div class="card-form">
      <div class="edit-form-title">✏️ Edytuj wpis${entry._pending ? ' <span class="badge badge-pending">⏳ oczekuje</span>' : ''}</div>
      <div class="form-group"><label>Kategoria</label><select id="te-category">${catOptions(entry.category)}</select></div>
      <div class="form-group"><label>Projekt</label><select id="te-project">${projectOptions(entry.project_id)}</select></div>
      <div class="form-grid-2">
        <div class="form-group"><label>Data</label><input type="date" id="te-date" value="${escHtml(entry.date || todayStr())}"></div>
        <div class="form-group"><label>Godziny</label><input type="number" id="te-hours" step="0.25" min="0" inputmode="decimal" value="${hoursFromMinutes(entry.duration_minutes)}"></div>
      </div>
      <div class="form-group"><label>Przerwa (min)</label><input type="number" id="te-break" min="0" step="5" value="${entry.break_minutes || 0}"></div>
      <div class="form-group"><label>Opis</label><div class="tr-field" style="display:flex;align-items:center;gap:6px"><input type="text" id="te-desc" placeholder="Co robiłeś?" style="flex:1" value="${escHtml(entry.description || '')}">${translateWidgetHTML('te-desc')}</div></div>
      <label class="check-row"><input type="checkbox" id="te-billable"${entry.is_billable !== false ? ' checked' : ''}> Rozliczalne (do faktury)</label>
      <div id="te-error" class="error-msg hidden"></div>
      <button class="btn btn-primary btn-block" id="te-save-btn">💾 Zapisz zmiany</button>
      <button class="btn btn-secondary btn-block" id="te-cancel-btn" style="margin-top:8px">Anuluj</button>
      <button class="btn btn-danger btn-block" id="te-delete-btn" style="margin-top:8px">🗑 Usuń wpis</button>
    </div>
  `;

  document.getElementById('te-cancel-btn').addEventListener('click', () => { _editingId = null; _renderList(); });
  document.getElementById('te-save-btn').addEventListener('click', () => _saveEdit(id));
  document.getElementById('te-delete-btn').addEventListener('click', () => _deleteEntry(id));
}

async function _saveEdit(id) {
  const hours = parseFloat(document.getElementById('te-hours').value);
  const date = document.getElementById('te-date').value;
  const errorEl = document.getElementById('te-error');
  errorEl.classList.add('hidden');
  if (!hours || hours <= 0) { errorEl.textContent = 'Podaj liczbę godzin.'; errorEl.classList.remove('hidden'); return; }
  if (!date) { errorEl.textContent = 'Data jest wymagana.'; errorEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('te-save-btn');
  btn.disabled = true; btn.textContent = '⏳ Zapisywanie…';
  const patch = {
    category: document.getElementById('te-category').value,
    project_id: document.getElementById('te-project').value || null,
    description: document.getElementById('te-desc').value.trim(),
    is_billable: document.getElementById('te-billable').checked,
    duration_minutes: Math.round(hours * 60),
    break_minutes: Math.max(0, parseInt(document.getElementById('te-break').value) || 0),
    date
  };
  try {
    await repo.updateTimeEntry(id, patch);
    _editingId = null;
    await _renderList();
  } catch (err) {
    errorEl.textContent = err.message; errorEl.classList.remove('hidden');
    btn.disabled = false; btn.textContent = '💾 Zapisz zmiany';
  }
}

async function _deleteEntry(id) {
  if (!confirm('Usunąć ten wpis? Zniknie też na komputerze po synchronizacji.')) return;
  const errorEl = document.getElementById('te-error');
  const btn = document.getElementById('te-delete-btn');
  errorEl.classList.add('hidden');
  btn.disabled = true; btn.textContent = '⏳ Usuwanie…';
  try {
    await repo.deleteTimeEntry(id);
    _editingId = null;
    await _renderList();
  } catch (err) {
    errorEl.textContent = err.message; errorEl.classList.remove('hidden');
    btn.disabled = false; btn.textContent = '🗑 Usuń wpis';
  }
}

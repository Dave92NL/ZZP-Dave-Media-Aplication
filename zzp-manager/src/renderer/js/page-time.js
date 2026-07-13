/* Time Tracking page — Pomodoro + manual entry + list */
'use strict';

const PageTime = (() => {
  // ── Timer state ──────────────────────────────────────────
  let timerState = 'idle'; // idle | running | paused
  let timerMode = 'pomodoro'; // pomodoro | free
  let timerInterval = null;
  let timerStartTs = null;
  let timerPausedMs = 0;
  let timerDurationSec = 25 * 60; // pomodoro default
  let pomodoroSessions = 0;
  let pomodoroMax = 4;
  let sessionStartWalltime = null;

  let projects = [];
  let entries = [];
  let filterYear = new Date().getFullYear();
  let filterMonth = new Date().getMonth() + 1;
  let filterProject = '';
  let filterCategory = '';

  let idleCheckInterval = null;
  let idleWarnShown = false;
  let idleThresholdMin = 5;

  const CATEGORIES = [
    'YouTube/Archiwum Zła', 'Edycja wideo', 'Research/Scenariusz',
    'Administracja ZZP', 'Marketing/Social Media', 'IT/Techniczne', 'Inne'
  ];

  // ── Entry point ──────────────────────────────────────────
  async function load() {
    projects = await window.api.projects.getAll().catch(() => []);
    render();
    await refreshList();
    startIdleCheck();
  }

  function render() {
    document.getElementById('page-content').innerHTML = `
      <div class="page" id="time-page">
        <div class="page-header">
          <h1 class="page-title">⏱️ Czas pracy</h1>
          <div class="page-actions">
            <button class="btn btn-secondary" onclick="PageTime.openImportWizard()" title="Importuj godzinówkę z efaktura.nl (PDF/XML)">📥 Import godzin</button>
            <button class="btn btn-secondary" onclick="PageTime.openExportModal()">📤 Eksportuj</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:360px 1fr;gap:16px;align-items:start">
          <!-- LEFT PANEL -->
          <div>
            <!-- Timer card -->
            <div class="card" style="margin-bottom:16px" id="timer-card">
              ${renderTimerCard()}
            </div>
            <!-- Manual entry card -->
            <div class="card" id="manual-card">
              ${renderManualCard()}
            </div>
          </div>
          <!-- RIGHT PANEL -->
          <div>
            <div class="card" style="margin-bottom:12px">
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <select id="tl-year" class="filter-select" onchange="PageTime.applyListFilters()">
                  ${yearOpts()}
                </select>
                <select id="tl-month" class="filter-select" onchange="PageTime.applyListFilters()">
                  ${monthOpts()}
                </select>
                <select id="tl-project" class="filter-select" onchange="PageTime.applyListFilters()">
                  <option value="">Wszystkie projekty</option>
                  ${projects.map(p => `<option value="${p.id}">${UI.esc(p.name)}</option>`).join('')}
                </select>
                <select id="tl-category" class="filter-select" onchange="PageTime.applyListFilters()">
                  <option value="">Wszystkie kategorie</option>
                  ${CATEGORIES.map(c => `<option>${UI.esc(c)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="card" id="time-list-wrap">
              <div style="padding:40px;text-align:center;color:var(--text-muted)">Ładowanie…</div>
            </div>
            <div class="card" style="margin-top:12px" id="time-summary-wrap"></div>
          </div>
        </div>
      </div>`;
  }

  function renderTimerCard() {
    const isFree = timerMode === 'free';
    const pomDur = Math.round(timerDurationSec / 60);
    const catOpts = CATEGORIES.map(c => `<option>${UI.esc(c)}</option>`).join('');
    const projOpts = `<option value="">— projekt —</option>` +
      projects.map(p => `<option value="${p.id}">${UI.esc(p.name)}</option>`).join('');

    return `
      <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">⏱ Timer</h3>
      <div class="form-grid-2" style="margin-bottom:10px">
        <div class="form-group">
          <label>Projekt</label>
          <select id="timer-project">${projOpts}</select>
        </div>
        <div class="form-group">
          <label>Kategoria</label>
          <select id="timer-category">${catOpts}</select>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label>Opis</label>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="text" id="timer-desc" placeholder="Nad czym pracujesz?" style="flex:1">
          ${window.Translator ? Translator.widgetHTML('timer-desc') : ''}
        </div>
      </div>

      <div style="text-align:center;margin-bottom:12px">
        <div id="timer-display" style="font-family:'JetBrains Mono',monospace;font-size:52px;font-weight:700;letter-spacing:2px;color:var(--text-primary);line-height:1">
          ${formatTimerDisplay()}
        </div>
        <div id="pomodoro-dots" style="margin-top:10px;display:flex;justify-content:center;gap:8px">
          ${renderPomodoroDots()}
        </div>
      </div>

      <div style="display:flex;justify-content:center;gap:10px;margin-bottom:14px">
        <button class="btn btn-primary" id="btn-start" onclick="PageTime.timerStart()" ${timerState === 'running' ? 'disabled' : ''}>▶ START</button>
        <button class="btn btn-secondary" id="btn-pause" onclick="PageTime.timerPause()" ${timerState !== 'running' ? 'disabled' : ''}>⏸ PAUZA</button>
        <button class="btn btn-danger" id="btn-stop" onclick="PageTime.timerStop()" ${timerState === 'idle' ? 'disabled' : ''}>⏹ STOP</button>
      </div>

      <div style="display:flex;gap:16px;justify-content:center;margin-bottom:10px;font-size:13px">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
          <input type="radio" name="timer-mode" value="pomodoro" ${!isFree ? 'checked' : ''} onchange="PageTime.setTimerMode('pomodoro')">
          Pomodoro
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
          <input type="radio" name="timer-mode" value="free" ${isFree ? 'checked' : ''} onchange="PageTime.setTimerMode('free')">
          Własny czas
        </label>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;align-items:center;font-size:12px">
        <span class="text-muted">Pomodoro:</span>
        <input type="number" id="pom-dur" value="${pomDur}" min="1" max="120" style="width:54px;text-align:center" onchange="PageTime.updatePomDuration()">
        <span class="text-muted">min &nbsp; Przerwa:</span>
        <input type="number" id="pom-break" value="5" min="1" max="30" style="width:54px;text-align:center">
        <span class="text-muted">min</span>
      </div>`;
  }

  function renderManualCard() {
    const projOpts = `<option value="">— projekt —</option>` +
      projects.map(p => `<option value="${p.id}">${UI.esc(p.name)}</option>`).join('');
    const catOpts = CATEGORIES.map(c => `<option>${UI.esc(c)}</option>`).join('');
    return `
      <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">✏️ Ręczny wpis czasu</h3>
      <div class="form-grid-2">
        <div class="form-group">
          <label>Data</label>
          <input type="date" id="m-date" value="${todayStr()}">
        </div>
        <div class="form-group">
          <label>Godzina od</label>
          <input type="time" id="m-from" oninput="PageTime.calcDuration()">
        </div>
        <div class="form-group">
          <label>Godzina do</label>
          <input type="time" id="m-to" oninput="PageTime.calcDuration()">
        </div>
        <div class="form-group">
          <label>Przerwa (min)</label>
          <input type="number" id="m-break" min="0" step="5" placeholder="np. 45" oninput="PageTime.calcDuration()">
        </div>
        <div class="form-group">
          <label>Czas trwania</label>
          <input type="text" id="m-duration" placeholder="np. 1h 30m" oninput="PageTime.onDurationInput()">
        </div>
        <div class="form-group">
          <label>Projekt</label>
          <select id="m-project">${projOpts}</select>
        </div>
        <div class="form-group">
          <label>Kategoria</label>
          <select id="m-category">${catOpts}</select>
        </div>
        <div class="form-group full">
          <label>Opis</label>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="text" id="m-desc" placeholder="Opis zadania…" style="flex:1">
            ${window.Translator ? Translator.widgetHTML('m-desc') : ''}
          </div>
        </div>
        <div class="form-group" style="flex-direction:row;align-items:center;gap:8px">
          <label style="margin:0">Billable</label>
          <input type="checkbox" id="m-billable" checked style="width:auto">
        </div>
      </div>
      <button class="btn btn-primary" style="margin-top:10px;width:100%" onclick="PageTime.addManualEntry()">+ Dodaj wpis</button>`;
  }

  function renderPomodoroDots() {
    return Array.from({ length: pomodoroMax }, (_, i) =>
      `<span style="width:10px;height:10px;border-radius:50%;background:${i < pomodoroSessions ? 'var(--accent-orange)' : 'var(--bg-tertiary)'};border:2px solid ${i < pomodoroSessions ? 'var(--accent-orange)' : 'var(--border)'}"></span>`
    ).join('');
  }

  // ── Timer logic ──────────────────────────────────────────
  function timerStart() {
    if (timerState === 'running') return;
    if (timerState === 'idle') {
      sessionStartWalltime = new Date().toISOString();
      timerStartTs = Date.now();
      timerPausedMs = 0;
    } else if (timerState === 'paused') {
      timerStartTs = Date.now() - timerPausedMs;
    }
    timerState = 'running';
    timerInterval = setInterval(() => tick(), 500);
    updateTimerButtons();
  }

  function timerPause() {
    if (timerState !== 'running') return;
    timerPausedMs = Date.now() - timerStartTs;
    clearInterval(timerInterval);
    timerState = 'paused';
    updateTimerButtons();
  }

  async function timerStop() {
    if (timerState === 'idle') return;
    clearInterval(timerInterval);

    const elapsedMs = timerState === 'paused' ? timerPausedMs : Date.now() - timerStartTs;
    const elapsedMin = Math.round(elapsedMs / 60000);

    timerState = 'idle';
    timerPausedMs = 0;
    timerStartTs = null;

    if (elapsedMin > 0) {
      const projectId = document.getElementById('timer-project')?.value || null;
      const category = document.getElementById('timer-category')?.value || CATEGORIES[0];
      const desc = document.getElementById('timer-desc')?.value || '';
      const isPomodoro = timerMode === 'pomodoro';

      try {
        await window.api.time.create({
          project_id: projectId || null,
          category,
          description: desc,
          date: todayStr(),
          start_time: sessionStartWalltime,
          end_time: new Date().toISOString(),
          duration_minutes: elapsedMin,
          is_pomodoro: isPomodoro ? 1 : 0,
          is_billable: 1
        });
        UI.toast(`Czas zapisany: ${fmtDuration(elapsedMin)}`, 'success');
        await refreshList();
      } catch (err) {
        UI.toast('Błąd zapisu: ' + err.message, 'error');
      }
    }

    if (timerMode === 'pomodoro') {
      pomodoroSessions = 0;
      timerDurationSec = (parseInt(document.getElementById('pom-dur')?.value) || 25) * 60;
    }

    updateTimerDisplay();
    updateTimerButtons();
    updatePomodoroDots();
  }

  function tick() {
    if (timerState !== 'running') return;

    const elapsedMs = Date.now() - timerStartTs;
    const elapsedSec = Math.floor(elapsedMs / 1000);

    if (timerMode === 'pomodoro') {
      const remaining = timerDurationSec - elapsedSec;
      if (remaining <= 0) {
        // Pomodoro complete
        pomodoroSessions = Math.min(pomodoroSessions + 1, pomodoroMax);
        clearInterval(timerInterval);
        timerState = 'idle';
        timerStartTs = null;
        timerPausedMs = 0;
        updatePomodoroDots();
        updateTimerButtons();

        // Notify
        try {
          new Notification('ZZP Manager', {
            body: `Pomodoro ukończony (${pomodoroSessions}/${pomodoroMax}) — czas na przerwę!`
          });
        } catch {}
        UI.toast(`🍅 Pomodoro #${pomodoroSessions} ukończony!`, 'success');

        // Auto-save
        const projectId = document.getElementById('timer-project')?.value || null;
        const category = document.getElementById('timer-category')?.value || CATEGORIES[0];
        const desc = document.getElementById('timer-desc')?.value || '';
        window.api.time.create({
          project_id: projectId || null, category, description: desc,
          date: todayStr(), duration_minutes: Math.round(timerDurationSec / 60),
          is_pomodoro: 1, is_billable: 1
        }).then(() => refreshList()).catch(() => {});

        if (pomodoroSessions >= pomodoroMax) {
          pomodoroSessions = 0;
          timerDurationSec = (parseInt(document.getElementById('pom-dur')?.value) || 25) * 60;
          UI.toast('🎉 Ukończono pełny cykl Pomodoro (4 sesje)!', 'success');
        } else {
          const breakMin = parseInt(document.getElementById('pom-break')?.value) || 5;
          timerDurationSec = breakMin * 60;
          timerStartTs = Date.now();
          timerState = 'running';
          timerInterval = setInterval(tick, 500);
          UI.toast(`☕ Przerwa ${breakMin} min`, 'info');
        }
      } else {
        document.getElementById('timer-display').textContent = formatSecs(remaining);
      }
    } else {
      // Free mode — count up
      document.getElementById('timer-display').textContent = formatSecs(elapsedSec);
    }
  }

  function setTimerMode(mode) {
    if (timerState !== 'idle') {
      UI.toast('Zatrzymaj timer przed zmianą trybu.', 'warning');
      const radio = document.querySelector(`input[name="timer-mode"][value="${timerMode}"]`);
      if (radio) radio.checked = true;
      return;
    }
    timerMode = mode;
    if (mode === 'pomodoro') {
      timerDurationSec = (parseInt(document.getElementById('pom-dur')?.value) || 25) * 60;
    } else {
      timerDurationSec = 0;
    }
    updateTimerDisplay();
  }

  function updatePomDuration() {
    if (timerState === 'idle' && timerMode === 'pomodoro') {
      timerDurationSec = (parseInt(document.getElementById('pom-dur')?.value) || 25) * 60;
      updateTimerDisplay();
    }
  }

  function formatTimerDisplay() {
    if (timerMode !== 'pomodoro') return '00:00:00';
    if (timerState === 'idle') return formatSecs(timerDurationSec);
    // running/paused — pokaż realny pozostały czas (nie pełny czas trwania),
    // inaczej powrót do zakładki po nawigacji pokazywałby zawsze świeże 25:00
    // mimo że timer jest zatrzymany w połowie odliczania.
    const elapsedMs = timerState === 'paused' ? timerPausedMs : Date.now() - timerStartTs;
    const remaining = Math.max(0, timerDurationSec - Math.floor(elapsedMs / 1000));
    return formatSecs(remaining);
  }

  function formatSecs(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function updateTimerDisplay() {
    const el = document.getElementById('timer-display');
    if (el) el.textContent = formatTimerDisplay();
  }

  function updateTimerButtons() {
    const start = document.getElementById('btn-start');
    const pause = document.getElementById('btn-pause');
    const stop = document.getElementById('btn-stop');
    if (start) start.disabled = timerState === 'running';
    if (pause) pause.disabled = timerState !== 'running';
    if (stop) stop.disabled = timerState === 'idle';
  }

  function updatePomodoroDots() {
    const el = document.getElementById('pomodoro-dots');
    if (el) el.innerHTML = renderPomodoroDots();
  }

  // ── Idle detection ───────────────────────────────────────
  function startIdleCheck() {
    stopIdleCheck();
    idleCheckInterval = setInterval(async () => {
      if (timerState !== 'running' || idleWarnShown) return;
      try {
        const idleSec = await window.api.system.getIdleTime();
        if (idleSec > idleThresholdMin * 60) {
          idleWarnShown = true;
          timerPause();
          const idleMin = Math.round(idleSec / 60);
          UI.openModal('⚠️ Wykryto bezczynność',
            `<p>Byłeś nieaktywny przez <strong>${idleMin} minut</strong>.</p>
             <p style="margin-top:8px;color:var(--text-muted)">Co zrobić z tym czasem?</p>`,
            {
              footer: `
                <button class="btn btn-secondary" onclick="PageTime.idleAddToSession()">✅ Dodaj do sesji</button>
                <button class="btn btn-secondary" onclick="PageTime.idleSubtract(${idleMin})">❌ Odejmij czas</button>
                <button class="btn btn-danger" onclick="PageTime.idleStopSession()">⏹ Zatrzymaj</button>`
            });
        }
      } catch {}
    }, 60000);
  }

  function stopIdleCheck() {
    if (idleCheckInterval) { clearInterval(idleCheckInterval); idleCheckInterval = null; }
  }

  function idleAddToSession() {
    idleWarnShown = false;
    UI.closeModal();
    timerStart(); // resume
    UI.toast('Czas bezczynności doliczony.', 'info');
  }

  function idleSubtract(idleMin) {
    idleWarnShown = false;
    UI.closeModal();
    if (timerStartTs) {
      timerStartTs += idleMin * 60000;
    }
    timerStart();
    UI.toast(`Odjęto ${idleMin} min bezczynności.`, 'info');
  }

  function idleStopSession() {
    idleWarnShown = false;
    UI.closeModal();
    timerStop();
  }

  // ── Manual entry ─────────────────────────────────────────
  function calcDuration() {
    const from = document.getElementById('m-from')?.value;
    const to = document.getElementById('m-to')?.value;
    if (!from || !to) return;
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    let mins = (th * 60 + tm) - (fh * 60 + fm);
    if (mins < 0) mins += 24 * 60;
    // Odejmij przerwę — czas trwania to czas netto pracy (jak w efakturze).
    const brk = Math.max(0, parseInt(document.getElementById('m-break')?.value) || 0);
    mins = Math.max(0, mins - brk);
    document.getElementById('m-duration').value = fmtDuration(mins);
  }

  function onDurationInput() {
    // allow free-text duration like "2h 30m" or "90m"
  }

  function parseDuration(str) {
    if (!str) return 0;
    const hMatch = str.match(/(\d+)h/);
    const mMatch = str.match(/(\d+)m/);
    if (hMatch || mMatch) {
      return (parseInt(hMatch?.[1] || 0) * 60) + parseInt(mMatch?.[1] || 0);
    }
    // plain number = minutes
    const n = parseInt(str);
    return isNaN(n) ? 0 : n;
  }

  async function addManualEntry() {
    const date = document.getElementById('m-date')?.value;
    const from = document.getElementById('m-from')?.value;
    const to = document.getElementById('m-to')?.value;
    const durationStr = document.getElementById('m-duration')?.value;
    const projectId = document.getElementById('m-project')?.value || null;
    const category = document.getElementById('m-category')?.value || CATEGORIES[0];
    const desc = document.getElementById('m-desc')?.value || '';
    const billable = document.getElementById('m-billable')?.checked !== false;

    if (!date) { UI.toast('Data jest wymagana.', 'warning'); return; }

    const breakMinutes = Math.max(0, parseInt(document.getElementById('m-break')?.value) || 0);

    let durationMinutes = 0;
    if (from && to) {
      const [fh, fm] = from.split(':').map(Number);
      const [th, tm] = to.split(':').map(Number);
      durationMinutes = (th * 60 + tm) - (fh * 60 + fm);
      if (durationMinutes < 0) durationMinutes += 24 * 60;
      durationMinutes -= breakMinutes; // czas netto (bez przerwy)
    } else {
      durationMinutes = parseDuration(durationStr);
    }

    if (durationMinutes <= 0) { UI.toast('Podaj czas trwania lub godziny od/do.', 'warning'); return; }

    try {
      await window.api.time.create({
        project_id: projectId, category, description: desc,
        date,
        start_time: from ? `${date}T${from}:00` : null,
        end_time: to ? `${date}T${to}:00` : null,
        duration_minutes: durationMinutes,
        break_minutes: breakMinutes,
        is_billable: billable ? 1 : 0
      });
      UI.toast(`Dodano: ${fmtDuration(durationMinutes)}`, 'success');
      // Clear form
      document.getElementById('m-from').value = '';
      document.getElementById('m-to').value = '';
      document.getElementById('m-break').value = '';
      document.getElementById('m-duration').value = '';
      document.getElementById('m-desc').value = '';
      await refreshList();
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  // ── List ─────────────────────────────────────────────────
  async function refreshList() {
    entries = await window.api.time.getAll({
      year: filterYear, month: filterMonth,
      project_id: filterProject, category: filterCategory
    }).catch(() => []);
    renderList();
    await renderSummary();
  }

  function applyListFilters() {
    filterYear = document.getElementById('tl-year')?.value || new Date().getFullYear();
    filterMonth = document.getElementById('tl-month')?.value || '';
    filterProject = document.getElementById('tl-project')?.value || '';
    filterCategory = document.getElementById('tl-category')?.value || '';
    refreshList();
  }

  function renderList() {
    const wrap = document.getElementById('time-list-wrap');
    if (!wrap) return;
    if (!entries.length) {
      wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Brak wpisów dla wybranych filtrów.</div>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr>
          <th>Data</th><th>Projekt</th><th>Kategoria</th><th>Opis</th>
          <th style="text-align:right">Czas</th><th>Bill.</th><th>Akcje</th>
        </tr></thead>
        <tbody>
          ${entries.map(e => `
            <tr onclick="PageTime.viewEntry(${e.id})" style="cursor:pointer" title="Kliknij, aby zobaczyć szczegóły">
              <td class="mono">${fmtDate(e.date)}</td>
              <td>${UI.esc(e.project_name || '—')}</td>
              <td><span class="badge badge-muted" style="font-size:11px">${UI.esc(e.category)}</span></td>
              <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${UI.esc(e.description || '—')}</td>
              <td class="mono" style="text-align:right;color:var(--accent-blue)">${fmtDuration(e.duration_minutes)}</td>
              <td style="text-align:center">${e.is_billable ? '✅' : '—'}</td>
              <td onclick="event.stopPropagation()">
                <div style="display:flex;gap:4px">
                  <button class="btn btn-icon btn-sm btn-secondary" onclick="PageTime.editEntry(${e.id})" title="Edytuj">✏️</button>
                  <button class="btn btn-icon btn-sm btn-danger" onclick="PageTime.deleteEntry(${e.id})" title="Usuń">🗑</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  async function renderSummary() {
    const wrap = document.getElementById('time-summary-wrap');
    if (!wrap) return;

    const summary = await window.api.time.getSummary({
      year: filterYear, month: filterMonth, project_id: filterProject
    }).catch(() => ({}));
    const yearTotal = await window.api.time.getYearTotal(new Date().getFullYear()).catch(() => ({}));

    const total = summary.total_minutes || 0;
    const billable = summary.billable_minutes || 0;
    const nonBillable = total - billable;
    const billablePct = total > 0 ? ((billable / total) * 100).toFixed(1) : '0';

    const urenH = yearTotal.total_hours?.toFixed(1) || 0;
    const urenPct = yearTotal.urencriterium_progress || 0;
    const urenRemaining = yearTotal.hours_remaining || 0;
    const monthsLeft = 12 - new Date().getMonth();
    const neededPerMonth = monthsLeft > 0 ? (urenRemaining / monthsLeft).toFixed(1) : 0;
    const onTrack = urenRemaining <= neededPerMonth * monthsLeft;

    wrap.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);margin-bottom:8px">Podsumowanie okresu</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px">
            <span>Łączne godziny:</span><strong>${fmtDuration(total)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;color:var(--accent-green)">
            <span>Billable:</span><strong>${fmtDuration(billable)} (${billablePct}%)</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary)">
            <span>Non-billable:</span><strong>${fmtDuration(nonBillable)}</strong>
          </div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);margin-bottom:8px">Urencriterium ${new Date().getFullYear()}</div>
          <div style="font-size:13px;margin-bottom:6px">${urenH}h / 1225h &nbsp; <strong>${urenPct.toFixed(1)}%</strong></div>
          <div style="background:var(--bg-tertiary);border-radius:4px;height:8px;overflow:hidden;margin-bottom:8px">
            <div style="background:${urenPct >= 80 ? 'var(--accent-green)' : urenPct >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)'};width:${Math.min(100,urenPct).toFixed(0)}%;height:100%;border-radius:4px"></div>
          </div>
          <div style="font-size:12px;color:var(--text-muted)">
            Pozostało: ${urenRemaining.toFixed(0)}h w ${monthsLeft} mies. = ${neededPerMonth}h/mies.
            ${onTrack ? '<span style="color:var(--accent-green)">✅ na dobrej drodze</span>' : '<span style="color:var(--accent-red)">⚠️ zagrożone</span>'}
          </div>
        </div>
      </div>`;
  }

  // ── Podgląd wpisu (karta jak w efakturze) ────────────────
  function viewEntry(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;

    // Tytuł: klient (jak w efakturze); gdy brak — projekt albo kategoria.
    const title = e.client_name || e.project_name || e.category || 'Wpis czasu';
    const subtitle = e.client_name ? (e.project_name || e.category || '') : (e.project_name ? e.category : '');

    // „środa, 1 lipca"
    const dayLabel = new Date(e.date + 'T00:00:00')
      .toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });

    // Zakres godzin tylko dla wpisów z licznika (start/end); wpisy ręczne go nie mają.
    const hm = (ts) => {
      const d = new Date(ts);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    };
    const range = (e.start_time && e.end_time) ? `${hm(e.start_time)} - ${hm(e.end_time)}` : '';

    const mins = Number(e.duration_minutes) || 0;
    const brk = Number(e.break_minutes) || 0;
    const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const durLabel = `${hhmm(mins)} godzin${brk > 0 ? ` (${hhmm(brk)} przerwy)` : ''}`;

    UI.openModal('', `
      <div class="time-view-card">
        <div class="time-view-head">
          <div class="time-view-title">${UI.esc(title)}</div>
          ${subtitle ? `<div class="time-view-subtitle">${UI.esc(subtitle)}</div>` : ''}
        </div>
        <div class="time-view-meta">
          <div>${UI.esc(dayLabel)}</div>
          ${range ? `<div>${range}</div>` : ''}
          <div>${durLabel}${e.is_billable ? '' : ' · nierozliczalne'}</div>
        </div>
        ${e.description ? `<div class="time-view-desc">${UI.esc(e.description)}</div>` : ''}
      </div>`, {
      footer: `
        <button class="btn btn-primary" onclick="PageTime.editEntry(${e.id})" title="Edytuj">✏️ Edytuj</button>
        <button class="btn btn-danger" onclick="PageTime.deleteEntry(${e.id})" title="Usuń">🗑</button>`
    });
  }

  // ── Edit / Delete ────────────────────────────────────────
  function editEntry(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    const projOpts = `<option value="">— projekt —</option>` +
      projects.map(p => `<option value="${p.id}" ${p.id == entry.project_id ? 'selected' : ''}>${UI.esc(p.name)}</option>`).join('');
    const catOpts = CATEGORIES.map(c => `<option ${c === entry.category ? 'selected' : ''}>${UI.esc(c)}</option>`).join('');

    // Prefill godzin od/do z istniejącego start/end (wpisy z licznika je mają).
    const hmVal = (ts) => {
      if (!ts) return '';
      const d = new Date(ts);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    };

    UI.openModal('Edytuj wpis czasu', `
      <div class="form-grid-2">
        <div class="form-group"><label>Data</label><input type="date" id="e-date" value="${entry.date}"></div>
        <div class="form-group"><label>Czas trwania (min)</label><input type="number" id="e-duration" value="${entry.duration_minutes}" min="1"></div>
        <div class="form-group"><label>Godzina od</label><input type="time" id="e-from" value="${hmVal(entry.start_time)}"></div>
        <div class="form-group"><label>Godzina do</label><input type="time" id="e-to" value="${hmVal(entry.end_time)}"></div>
        <div class="form-group"><label>Przerwa (min)</label><input type="number" id="e-break" value="${entry.break_minutes || 0}" min="0" step="5"></div>
        <div class="form-group"><label>Projekt</label><select id="e-project">${projOpts}</select></div>
        <div class="form-group"><label>Kategoria</label><select id="e-category">${catOpts}</select></div>
        <div class="form-group full"><label>Opis</label><div style="display:flex;align-items:center;gap:6px"><input type="text" id="e-desc" value="${UI.esc(entry.description || '')}" style="flex:1">${window.Translator ? Translator.widgetHTML('e-desc') : ''}</div></div>
        <div class="form-group" style="flex-direction:row;align-items:center;gap:8px">
          <label>Billable</label>
          <input type="checkbox" id="e-billable" ${entry.is_billable ? 'checked' : ''} style="width:auto">
        </div>
      </div>`, {
      footer: `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
        <button class="btn btn-primary" onclick="PageTime.confirmEdit(${id})">💾 Zapisz</button>`
    });
  }

  async function confirmEdit(id) {
    const date = document.getElementById('e-date')?.value;
    const from = document.getElementById('e-from')?.value;
    const to = document.getElementById('e-to')?.value;
    const breakMinutes = Math.max(0, parseInt(document.getElementById('e-break')?.value) || 0);

    // Gdy podano od/do — czas trwania liczony z zakresu minus przerwa (netto);
    // inaczej obowiązuje ręczna wartość „Czas trwania (min)".
    let durationMinutes = parseInt(document.getElementById('e-duration')?.value) || 0;
    if (from && to) {
      const [fh, fm] = from.split(':').map(Number);
      const [th, tm] = to.split(':').map(Number);
      let mins = (th * 60 + tm) - (fh * 60 + fm);
      if (mins < 0) mins += 24 * 60;
      durationMinutes = Math.max(0, mins - breakMinutes);
    }

    const data = {
      date,
      duration_minutes: durationMinutes,
      break_minutes: breakMinutes,
      start_time: (from && date) ? `${date}T${from}:00` : null,
      end_time: (to && date) ? `${date}T${to}:00` : null,
      project_id: document.getElementById('e-project')?.value || null,
      category: document.getElementById('e-category')?.value,
      description: document.getElementById('e-desc')?.value || '',
      is_billable: document.getElementById('e-billable')?.checked ? 1 : 0
    };
    try {
      await window.api.time.update(id, data);
      UI.closeModal();
      UI.toast('Wpis zaktualizowany.', 'success');
      await refreshList();
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  function deleteEntry(id) {
    UI.openModal('🗑 Usuń wpis', `<p>Czy na pewno chcesz usunąć ten wpis czasu?</p>`, {
      footer: `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
        <button class="btn btn-danger" onclick="PageTime.confirmDelete(${id})">🗑 Usuń</button>`
    });
  }

  async function confirmDelete(id) {
    try {
      await window.api.time.delete(id);
      UI.closeModal();
      UI.toast('Wpis usunięty.', 'success');
      await refreshList();
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  // ── Export ───────────────────────────────────────────────
  function openExportModal() {
    UI.openModal('📤 Eksport czasu pracy', `
      <div class="form-grid-2">
        <div class="form-group full">
          <label>Zakres</label>
          <div style="display:flex;flex-direction:column;gap:6px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
              <input type="radio" name="exp-range" value="month" checked> Ten miesiąc (${new Date().toLocaleString('pl-PL',{month:'long',year:'numeric'})})
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
              <input type="radio" name="exp-range" value="year"> Ten rok (${new Date().getFullYear()})
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
              <input type="radio" name="exp-range" value="custom"> Własny zakres:
              <input type="date" id="exp-from" style="margin:0 4px"> —
              <input type="date" id="exp-to">
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Format</label>
          <select id="exp-format">
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
        <div class="form-group">
          <label>Grupowanie</label>
          <select id="exp-group">
            <option value="day">Per dzień</option>
            <option value="project">Per projekt</option>
            <option value="category">Per kategoria</option>
          </select>
        </div>
      </div>`, {
      footer: `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
        <button class="btn btn-primary" onclick="PageTime.doExport()">📤 Eksportuj</button>`
    });
  }

  async function doExport() {
    const range = document.querySelector('input[name="exp-range"]:checked')?.value || 'month';
    const format = document.getElementById('exp-format')?.value || 'csv';
    const now = new Date();

    let dateFrom, dateTo;
    if (range === 'month') {
      dateFrom = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      dateTo = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${lastDay}`;
    } else if (range === 'year') {
      dateFrom = `${now.getFullYear()}-01-01`;
      dateTo = `${now.getFullYear()}-12-31`;
    } else {
      dateFrom = document.getElementById('exp-from')?.value;
      dateTo = document.getElementById('exp-to')?.value;
      if (!dateFrom || !dateTo) { UI.toast('Podaj zakres dat.', 'warning'); return; }
    }

    UI.closeModal();

    if (format === 'pdf') {
      // Build filter object for PDF export
      let filters = {};
      if (range === 'month') {
        filters = { year: now.getFullYear(), month: now.getMonth() + 1 };
      } else if (range === 'year') {
        filters = { year: now.getFullYear() };
      } else {
        filters = { date_from: dateFrom, date_to: dateTo };
      }
      try {
        const path = await window.api.time.exportPDF(filters);
        if (path) {
          UI.toast('📄 PDF zapisany!', 'success');
          await window.api.util.openFile(path);
        }
      } catch(e) {
        UI.toast('Błąd eksportu PDF: ' + e.message, 'error');
      }
      return;
    }

    // CSV export
    const data = await window.api.time.getAll({ date_from: dateFrom, date_to: dateTo }).catch(() => []);
    if (format === 'csv') {
      const csv = buildCSV(data);
      downloadCSV(csv, `czas-pracy-${dateFrom}-${dateTo}.csv`);
      UI.toast('CSV wygenerowany.', 'success');
    }
  }

  function buildCSV(data) {
    const header = ['Data', 'Projekt', 'Kategoria', 'Opis', 'Czas (min)', 'Godziny', 'Billable'];
    const rows = data.map(e => [
      e.date,
      e.project_name || '',
      e.category,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      e.duration_minutes,
      (e.duration_minutes / 60).toFixed(2),
      e.is_billable ? 'Tak' : 'Nie'
    ]);
    return [header, ...rows].map(r => r.join(';')).join('\n');
  }

  function downloadCSV(csv, filename) {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Helpers ──────────────────────────────────────────────
  function fmtDuration(mins) {
    if (!mins) return '0h 0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${String(m).padStart(2,'0')}m`;
  }

  function fmtDate(d) {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`;
    } catch { return d; }
  }

  function todayStr() { return new Date().toISOString().split('T')[0]; }

  function yearOpts() {
    const cur = new Date().getFullYear();
    return [cur, cur-1].map(y => `<option value="${y}" ${y == filterYear ? 'selected' : ''}>${y}</option>`).join('');
  }

  function monthOpts() {
    const names = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
                   'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
    return `<option value="">Wszystkie miesiące</option>` +
      names.map((n,i) => `<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0') == String(filterMonth).padStart(2,'0') ? 'selected' : ''}>${n}</option>`).join('');
  }

  // Cleanup on page leave
  function unload() {
    stopIdleCheck();
    if (timerState === 'running') timerPause();
  }

  // ── Import godzinówki z efaktura.nl ──────────────────────
  let _hoursResults = [];

  async function openImportWizard() {
    const paths = await window.api.hours.pickFiles();
    if (!paths.length) return;
    const btn = document.querySelector('[onclick*="openImportWizard"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Analizuję…'; }
    let results;
    try {
      results = await window.api.hours.analyze(paths);
    } catch (err) {
      UI.toast('Błąd analizy plików: ' + err.message, 'error');
      return;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📥 Import godzin'; }
    }
    _hoursResults = results;
    _showHoursPreview(results);
  }

  function _fmtDur(min) {
    const h = Math.floor((min || 0) / 60), m = (min || 0) % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  function _showHoursPreview(results) {
    const okFiles = results.filter(r => r.status !== 'error');
    const errFiles = results.filter(r => r.status === 'error');
    const allEntries = okFiles.flatMap(r => r.data || []);
    const totalMin = allEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0);

    const catOpts = CATEGORIES.map(c => `<option value="${UI.escHtml(c)}"${c === 'Inne' ? ' selected' : ''}>${UI.escHtml(c)}</option>`).join('');

    const rows = allEntries.map((e, idx) => `
      <tr>
        <td style="text-align:center"><input type="checkbox" class="hrs-chk" data-idx="${idx}" ${e.duration_minutes ? 'checked' : ''}></td>
        <td class="mono">${UI.escHtml(e.date || '—')}</td>
        <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${UI.escHtml(e.description || '')}">${UI.escHtml(e.description || '—')}</td>
        <td>${UI.escHtml(e._clientName || '—')}</td>
        <td style="text-align:right">${e.duration_minutes ? _fmtDur(e.duration_minutes) : '<span style="color:var(--accent-yellow)">0 — uzupełnij</span>'}</td>
      </tr>`).join('');

    const errNote = errFiles.length
      ? `<p style="color:var(--accent-red);font-size:12px;margin-top:6px">❌ ${errFiles.length} plik(ów) nie rozpoznano: ${errFiles.map(f => UI.escHtml(f.basename)).join(', ')}. Dla PDF-skanów bez tekstu import nie zadziała.</p>`
      : '';

    const html = `
      <div id="hrs-modal-overlay" class="modal-overlay" style="z-index:9999">
        <div class="modal" style="max-width:860px;width:95vw">
          <div class="modal-header">
            <h3>📥 Import godzinówki z efaktura.nl</h3>
            <button class="modal-close" onclick="document.getElementById('hrs-modal-overlay').remove()">×</button>
          </div>
          <div class="modal-body">
            <p style="margin-bottom:10px;color:var(--text-muted)">
              Znaleziono <strong>${allEntries.length}</strong> wpisów (${_fmtDur(totalMin)} łącznie) w ${okFiles.length} plik(ach).
              Odznacz niechciane i wybierz kategorię — wpisy trafią do rejestru czasu.
            </p>
            <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
              <label style="font-size:13px">Kategoria dla importu:
                <select id="hrs-category" style="margin-left:6px">${catOpts}</select>
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                <input type="checkbox" id="hrs-billable" checked> rozliczalne
              </label>
            </div>
            <div style="overflow:auto;max-height:420px">
              <table class="data-table" style="width:100%;font-size:13px">
                <thead><tr>
                  <th style="width:36px"><input type="checkbox" id="hrs-chk-all" checked onchange="document.querySelectorAll('.hrs-chk').forEach(c=>c.checked=this.checked)"></th>
                  <th>Data</th><th>Opis</th><th>Klient</th><th style="text-align:right">Czas</th>
                </tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-muted)">Brak wpisów</td></tr>'}</tbody>
              </table>
            </div>
            ${errNote}
          </div>
          <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:10px;padding:16px">
            <button class="btn btn-secondary" onclick="document.getElementById('hrs-modal-overlay').remove()">Anuluj</button>
            <button class="btn btn-primary" onclick="PageTime.doHoursImport()">Importuj zaznaczone</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  async function doHoursImport() {
    const checks = Array.from(document.querySelectorAll('.hrs-chk'));
    const category = document.getElementById('hrs-category')?.value || 'Inne';
    const isBillable = document.getElementById('hrs-billable')?.checked !== false;

    // Zbuduj listę pozycji z zaznaczonymi wpisami (spłaszczone → per plik)
    const allEntries = _hoursResults.filter(r => r.status !== 'error').flatMap(r => r.data || []);
    const selectedEntries = allEntries.filter((_, i) => checks[i]?.checked);
    if (!selectedEntries.length) { UI.toast('Nie zaznaczono żadnych wpisów.', 'warning'); return; }

    document.getElementById('hrs-modal-overlay')?.remove();
    try {
      const r = await window.api.hours.import(
        [{ basename: 'import', status: 'ok', data: selectedEntries }],
        { category, is_billable: isBillable }
      );
      const msg = `✅ Zaimportowano ${r.imported} wpis(ów) godzin` +
        (r.skipped ? `, pominięto ${r.skipped}` : '') +
        (r.errors?.length ? `, błędy: ${r.errors.length}` : '');
      UI.toast(msg, r.errors?.length ? 'warning' : 'success');
      await refreshList();
    } catch (err) {
      UI.toast('Błąd importu: ' + err.message, 'error');
    }
  }

  return {
    load, unload,
    timerStart, timerPause, timerStop,
    setTimerMode, updatePomDuration,
    idleAddToSession, idleSubtract, idleStopSession,
    calcDuration, onDurationInput, addManualEntry,
    applyListFilters, refreshList,
    viewEntry, editEntry, confirmEdit, deleteEntry, confirmDelete,
    openExportModal, doExport,
    openImportWizard, doHoursImport
  };
})();

window.PageTime = PageTime;

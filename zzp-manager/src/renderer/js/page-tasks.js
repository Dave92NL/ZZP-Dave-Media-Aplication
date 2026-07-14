/* Tasks + Calendar page */
'use strict';

const PageTasks = (() => {
  let allTasks = [];
  let allProjects = [];
  let currentView = 'list'; // 'list' | 'calendar'
  let filterStatus = 'active';
  let filterProject = '';
  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth() + 1;

  const PRIORITY_COLOR = { urgent: 'var(--accent-red)', high: 'var(--accent-orange)', medium: 'var(--accent-yellow)', low: 'var(--accent-green)' };
  const PRIORITY_LABEL = { urgent: 'PILNE', high: 'WYSOKI', medium: 'ŚREDNI', low: 'NISKI' };
  const MONTH_NAMES = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
  // "Ndz" zamiast "Nie" — unika kolizji z kluczem 'Nie' (Tak/Nie) w DOM_MAP tłumaczeń,
  // który inaczej cicho przesłania tłumaczenie skrótu dnia tygodnia.
  const DAY_NAMES = ['Pon','Wto','Śro','Czw','Pią','Sob','Ndz'];

  // ── Entry point ──────────────────────────────────────────
  async function load() {
    document.getElementById('page-content').innerHTML = renderShell();
    try {
      [allTasks, allProjects] = await Promise.all([
        window.api.tasks.getAll(),
        window.api.projects.getAll()
      ]);
      renderView();
      bindToolbar();
    } catch (err) { console.error(err); }
  }

  function renderShell() {
    return `<div class="page" id="tasks-page">
      <div class="page-header">
        <h1 class="page-title">✅ Zadania</h1>
        <button class="btn btn-primary" onclick="PageTasks.openCreate()">+ Nowe zadanie</button>
      </div>
      <div class="filter-bar" id="tasks-toolbar"></div>
      <div id="tasks-content"></div>
    </div>`;
  }

  function bindToolbar() {
    const tb = document.getElementById('tasks-toolbar');
    if (!tb) return;
    tb.innerHTML = `
      <div style="display:flex;gap:4px">
        <button class="btn btn-sm ${currentView==='list'?'btn-primary':'btn-secondary'}" onclick="PageTasks.setView('list')">≡ Lista</button>
        <button class="btn btn-sm ${currentView==='calendar'?'btn-primary':'btn-secondary'}" onclick="PageTasks.setView('calendar')">📅 Kalendarz</button>
      </div>
      ${currentView === 'list' ? `
        <select class="filter-select" id="tf-status">
          <option value="">Wszystkie</option>
          <option value="active" ${filterStatus==='active'?'selected':''}>Aktywne</option>
          <option value="todo" ${filterStatus==='todo'?'selected':''}>Do zrobienia</option>
          <option value="in_progress" ${filterStatus==='in_progress'?'selected':''}>W toku</option>
          <option value="done" ${filterStatus==='done'?'selected':''}>Ukończone</option>
        </select>
        <select class="filter-select" id="tf-proj">
          <option value="">Wszystkie projekty</option>
          ${allProjects.map(p=>`<option value="${p.id}" ${filterProject==p.id?'selected':''}>${UI.esc(p.name)}</option>`).join('')}
        </select>` : ''}`;
    document.getElementById('tf-status')?.addEventListener('change', e => { filterStatus = e.target.value; renderList(); });
    document.getElementById('tf-proj')?.addEventListener('change', e => { filterProject = e.target.value; renderList(); });
  }

  function setView(v) { currentView = v; bindToolbar(); renderView(); }
  function renderView() { currentView === 'list' ? renderList() : renderCalendar(); }

  // ── List view ────────────────────────────────────────────
  function getFiltered() {
    return allTasks.filter(t => {
      if (filterProject && String(t.project_id) !== String(filterProject)) return false;
      if (!filterStatus) return true;
      if (filterStatus === 'active') return t.status !== 'done' && t.status !== 'cancelled';
      return t.status === filterStatus;
    });
  }

  function renderList() {
    const el = document.getElementById('tasks-content');
    if (!el) return;
    const rows = getFiltered();
    const today = new Date().toISOString().split('T')[0];

    if (!rows.length) {
      el.innerHTML = `<div class="card" style="padding:60px;text-align:center;color:var(--text-muted)">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <div>${filterStatus === 'done' ? 'Brak ukończonych zadań.' : filterStatus === 'active' ? '🎉 Wszystkie zadania ukończone!' : 'Brak zadań.'}</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="PageTasks.openCreate()">+ Nowe zadanie</button>
      </div>`;
      return;
    }

    el.innerHTML = `<div class="card" style="padding:0">
      ${rows.map(t => {
        const overdue = t.due_date && t.due_date < today && t.status !== 'done';
        const done = t.status === 'done';
        return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);${done?'opacity:0.6':''}">
          <input type="checkbox" style="margin-top:3px;cursor:pointer" ${done?'checked':''} onchange="PageTasks.toggleDone(${t.id},this.checked)">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:500;${done?'text-decoration:line-through':''}">${UI.esc(t.title)}</span>
              <span style="width:8px;height:8px;border-radius:50%;background:${PRIORITY_COLOR[t.priority]||'var(--text-muted)'};flex-shrink:0" title="${PRIORITY_LABEL[t.priority]||''}"></span>
              <span style="font-size:10px;font-weight:700;color:${PRIORITY_COLOR[t.priority]};text-transform:uppercase">${PRIORITY_LABEL[t.priority]||''}</span>
              ${t.project_name ? `<span style="font-size:11px;background:var(--bg-tertiary);padding:2px 7px;border-radius:10px;color:var(--text-secondary)">📁 ${UI.esc(t.project_name)}</span>` : ''}
            </div>
            ${t.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:3px">${UI.esc(t.description)}</div>` : ''}
            ${t.due_date ? `<div style="font-size:11px;margin-top:3px;color:${overdue?'var(--accent-red)':done?'var(--text-muted)':'var(--text-secondary)'}">
              📅 ${UI.formatDate(t.due_date)} ${overdue?'⚠️ PRZETERMINOWANE':''}
            </div>` : ''}
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-sm btn-secondary" onclick="PageTasks.openEdit(${t.id})">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="PageTasks.deleteTask(${t.id})">🗑</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  async function toggleDone(id, done) {
    await window.api.tasks.update(id, { status: done ? 'done' : 'todo' });
    const t = allTasks.find(t => t.id === id);
    if (t) t.status = done ? 'done' : 'todo';
    renderList();
  }

  // ── Calendar view ────────────────────────────────────────
  async function renderCalendar() {
    const el = document.getElementById('tasks-content');
    if (!el) return;
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted)">Ładowanie kalendarza…</div>`;
    try {
      const data = await window.api.tasks.getCalendar(calYear, calMonth);
      el.innerHTML = buildCalendar(data);
    } catch (err) {
      el.innerHTML = `<div class="card"><p class="text-danger" style="padding:20px">Błąd: ${UI.esc(err.message)}</p></div>`;
    }
  }

  function buildCalendar(data) {
    const firstDay = new Date(calYear, calMonth - 1, 1);
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    let startDow = firstDay.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon=0

    const today = new Date().toISOString().split('T')[0];
    const todayFull = `${calYear}-${String(calMonth).padStart(2,'0')}`;

    // Index events by day
    const tasksByDay = {};
    for (const t of data.tasks || []) {
      const d = t.due_date?.split('-')[2];
      if (d) (tasksByDay[+d] = tasksByDay[+d] || []).push({ type: 'task', item: t });
    }
    for (const i of data.invoiceDueDates || []) {
      const d = i.due_date?.split('-')[2];
      if (d) (tasksByDay[+d] = tasksByDay[+d] || []).push({ type: 'invoice', item: i });
    }
    for (const r of data.reminders || []) {
      const d = r.due_date?.split('-')[2];
      if (d) (tasksByDay[+d] = tasksByDay[+d] || []).push({ type: 'reminder', item: r });
    }

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const dayHeadersHTML = DAY_NAMES.map(d => `<div style="background:var(--bg-secondary);padding:8px;text-align:center;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-secondary)">${d}</div>`).join('');

    const daysHTML = cells.map(d => {
      if (!d) return `<div style="background:var(--bg-primary);min-height:72px"></div>`;
      const dateStr = `${todayFull}-${String(d).padStart(2,'0')}`;
      const isToday = dateStr === today;
      const events = tasksByDay[d] || [];
      const eventsHTML = events.slice(0,3).map(e => {
        if (e.type === 'task') {
          return `<div style="font-size:10px;padding:1px 4px;border-radius:2px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:${PRIORITY_COLOR[e.item.priority]}22;color:${PRIORITY_COLOR[e.item.priority]}">${UI.esc(e.item.title)}</div>`;
        } else if (e.type === 'invoice') {
          return `<div style="font-size:10px;padding:1px 4px;border-radius:2px;margin-bottom:1px;background:rgba(56,139,253,0.15);color:var(--accent-blue)">📄 ${UI.esc(e.item.invoice_number)}</div>`;
        } else {
          return `<div style="font-size:10px;padding:1px 4px;border-radius:2px;margin-bottom:1px;background:rgba(248,81,73,0.15);color:var(--accent-red)">🔔 ${UI.esc(e.item.title)}</div>`;
        }
      }).join('');
      const moreCount = events.length > 3 ? events.length - 3 : 0;
      return `<div onclick="PageTasks.showDayPopup(${d},${calYear},${calMonth})" style="background:var(--bg-card);min-height:72px;padding:6px;cursor:pointer;transition:background 0.1s;${isToday?'background:color-mix(in srgb,var(--accent-orange) 8%,var(--bg-card))':''}">
        <div style="font-size:13px;font-weight:${isToday?700:400};color:${isToday?'var(--accent-orange)':'var(--text-primary)'};margin-bottom:3px">${d}</div>
        ${eventsHTML}
        ${moreCount > 0 ? `<div style="font-size:10px;color:var(--text-muted)">+${moreCount} więcej</div>` : ''}
      </div>`;
    }).join('');

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <button class="btn btn-secondary" onclick="PageTasks.calNav(-1)">◀</button>
        <h3 style="font-size:15px;font-weight:600">${MONTH_NAMES[calMonth-1]} ${calYear}</h3>
        <button class="btn btn-secondary" onclick="PageTasks.calNav(1)">▶</button>
      </div>
      <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:0;border-bottom:1px solid var(--border)">${dayHeadersHTML}</div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--border)">${daysHTML}</div>
      </div>
      <div style="display:flex;gap:12px;margin-top:8px;font-size:11px;color:var(--text-muted)">
        <span>🔴 Zadania pilne</span><span>🟠 Wysoki</span><span>🟡 Średni</span><span>🟢 Niski</span>
        <span>📄 Termin faktury</span><span>🔔 Przypomnienie</span>
      </div>`;
  }

  function calNav(dir) {
    calMonth += dir;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    if (calMonth < 1)  { calMonth = 12; calYear--; }
    renderCalendar();
  }

  async function showDayPopup(day, year, month) {
    const data = await window.api.tasks.getCalendar(year, month);
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const tasks = (data.tasks||[]).filter(t => t.due_date === dateStr);
    const invoices = (data.invoiceDueDates||[]).filter(i => i.due_date === dateStr);
    const reminders = (data.reminders||[]).filter(r => r.due_date === dateStr);

    const allEvents = [
      ...reminders.map(r => `<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)"><span>🔔</span><div><div style="font-weight:500;font-size:13px">${UI.esc(r.title)}</div><div style="font-size:11px;color:var(--accent-red)">TERMIN</div></div></div>`),
      ...invoices.map(i => `<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)"><span>📄</span><div><div style="font-weight:500;font-size:13px">${UI.esc(i.invoice_number)}</div><div style="font-size:11px;color:var(--accent-blue)">${UI.esc(i.client_name||'')}</div></div></div>`),
      ...tasks.map(t => `<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)"><span style="color:${PRIORITY_COLOR[t.priority]}">●</span><div><div style="font-weight:500;font-size:13px">${UI.esc(t.title)}</div>${t.project_name?`<div style="font-size:11px;color:var(--text-muted)">📁 ${UI.esc(t.project_name)}</div>`:''}</div></div>`)
    ];

    UI.openModal(`📅 ${UI.formatDate(dateStr)}`,
      (allEvents.length ? allEvents.join('') : '<p class="text-muted" style="text-align:center;padding:20px">Brak wydarzeń.</p>') +
      `<div style="margin-top:12px"><button class="btn btn-primary" onclick="UI.closeModal();PageTasks.openCreate('${dateStr}')">+ Dodaj zadanie na ten dzień</button></div>`,
      { size: 'sm' }
    );
  }

  // ── Create / Edit ────────────────────────────────────────
  function openCreate(datePreset = '') {
    openForm(null, datePreset);
  }

  async function openEdit(id) {
    const t = allTasks.find(t => t.id === id) || await window.api.tasks.getAll().then(ts => ts.find(t => t.id === id));
    if (t) openForm(t);
  }

  function openForm(t, datePreset = '') {
    UI.openModal(t ? '✏️ Edytuj zadanie' : '+ Nowe zadanie', `
      <div class="form-group"><label>Tytuł *</label><div style="display:flex;align-items:center;gap:6px"><input type="text" id="tf-title" value="${UI.esc(t?.title||'')}" style="flex:1">${window.Translator ? Translator.widgetHTML('tf-title') : ''}</div></div>
      <div class="form-group"><label>Opis</label><div class="tr-field"><textarea id="tf-desc" rows="2">${UI.esc(t?.description||'')}</textarea>${window.Translator ? Translator.widgetHTML('tf-desc') : ''}</div></div>
      <div class="form-group"><label>Priorytet</label>
        <div style="display:flex;gap:12px;padding-top:8px">
          ${['urgent','high','medium','low'].map(p=>`<label style="display:flex;gap:6px;align-items:center;cursor:pointer">
            <input type="radio" name="tf-prio" value="${p}" ${(t?.priority||'medium')===p?'checked':''}> <span style="color:${PRIORITY_COLOR[p]};font-weight:600">${PRIORITY_LABEL[p]}</span>
          </label>`).join('')}
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-group"><label>Termin</label><input type="date" id="tf-due" value="${t?.due_date||datePreset}"></div>
        <div class="form-group"><label>Projekt</label>
          <select id="tf-proj"><option value="">— brak —</option>
            ${allProjects.map(p=>`<option value="${p.id}" ${t?.project_id==p.id?'selected':''}>${UI.esc(p.name)}</option>`).join('')}
          </select></div>
      </div>
    `, {
      footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
               <button class="btn btn-primary" onclick="PageTasks.saveForm(${t?.id||'null'})">${t?'💾 Zapisz':'+ Dodaj'}</button>`
    });
  }

  async function saveForm(id) {
    const title = document.getElementById('tf-title')?.value.trim();
    if (!title) { UI.toast('Tytuł jest wymagany.', 'warning'); return; }
    const data = {
      title,
      description: document.getElementById('tf-desc')?.value.trim(),
      priority: document.querySelector('input[name="tf-prio"]:checked')?.value || 'medium',
      due_date: document.getElementById('tf-due')?.value || null,
      project_id: document.getElementById('tf-proj')?.value || null
    };
    try {
      if (id) {
        await window.api.tasks.update(id, data);
        const idx = allTasks.findIndex(t => t.id === id);
        if (idx >= 0) allTasks[idx] = { ...allTasks[idx], ...data };
        UI.toast('Zadanie zaktualizowane.', 'success');
      } else {
        const r = await window.api.tasks.create(data);
        allTasks = await window.api.tasks.getAll();
        UI.toast('Zadanie dodane.', 'success');
      }
      UI.closeModal();
      renderView();
    } catch (err) { UI.toast('Błąd: ' + err.message, 'error'); }
  }

  async function deleteTask(id) {
    const ok = await UI.confirm('Usunąć to zadanie?');
    if (!ok) return;
    await window.api.tasks.delete(id);
    allTasks = allTasks.filter(t => t.id !== id);
    UI.toast('Zadanie usunięte.', 'success');
    renderView();
  }

  return { load, setView, toggleDone, calNav, showDayPopup, openCreate, openEdit, saveForm, deleteTask };
})();

window.PageTasks = PageTasks;

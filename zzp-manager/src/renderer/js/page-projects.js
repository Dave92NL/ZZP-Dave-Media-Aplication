/* Projects page */
'use strict';

const PageProjects = (() => {
  let allProjects = [];
  let allClients = [];
  let currentView = 'cards'; // 'cards' | 'table'
  let filterStatus = '';
  let filterClient = '';
  let currentProjectId = null;
  let currentProjectTab = 'overview';

  const STATUS_LABELS = { active: 'W toku', paused: 'Wstrzymany', completed: 'Zakończony', cancelled: 'Anulowany' };
  const STATUS_ICONS  = { active: '🟢', paused: '🟡', completed: '✅', cancelled: '❌' };

  // ── Entry point ──────────────────────────────────────────
  async function load() {
    currentProjectId = null;
    document.getElementById('page-content').innerHTML = renderShell();
    try {
      [allProjects, allClients] = await Promise.all([
        window.api.projects.getAll(),
        window.api.contacts.getAll()
      ]);
      renderList();
      bindToolbar();
    } catch (err) {
      console.error(err);
    }
  }

  function renderShell() {
    return `<div class="page" id="projects-page">
      <div class="page-header">
        <h1 class="page-title">📁 Projekty</h1>
        <button class="btn btn-primary" onclick="PageProjects.openCreate()">+ Nowy projekt</button>
      </div>
      <div class="filter-bar" id="proj-toolbar"></div>
      <div id="proj-content"></div>
    </div>`;
  }

  function bindToolbar() {
    const tb = document.getElementById('proj-toolbar');
    if (!tb) return;
    tb.innerHTML = `
      <div style="display:flex;gap:4px">
        <button class="btn btn-sm ${currentView==='cards'?'btn-primary':'btn-secondary'}" onclick="PageProjects.setView('cards')">⊞ Karty</button>
        <button class="btn btn-sm ${currentView==='table'?'btn-primary':'btn-secondary'}" onclick="PageProjects.setView('table')">≡ Tabela</button>
      </div>
      <select class="filter-select" id="pf-status">
        <option value="">Wszystkie statusy</option>
        ${Object.entries(STATUS_LABELS).map(([v,l])=>`<option value="${v}" ${filterStatus===v?'selected':''}>${l}</option>`).join('')}
      </select>
      <select class="filter-select" id="pf-client">
        <option value="">Wszyscy klienci</option>
        ${allClients.map(c=>`<option value="${c.id}" ${filterClient==c.id?'selected':''}>${UI.esc(c.name)}</option>`).join('')}
      </select>`;
    document.getElementById('pf-status')?.addEventListener('change', e => { filterStatus = e.target.value; renderList(); });
    document.getElementById('pf-client')?.addEventListener('change', e => { filterClient = e.target.value; renderList(); });
  }

  function filtered() {
    return allProjects.filter(p =>
      (!filterStatus || p.status === filterStatus) &&
      (!filterClient || String(p.client_id) === String(filterClient))
    );
  }

  function setView(v) { currentView = v; bindToolbar(); renderList(); }

  function renderList() {
    const rows = filtered();
    const el = document.getElementById('proj-content');
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = `<div class="card" style="padding:60px;text-align:center;color:var(--text-muted)">
        <div style="font-size:48px;margin-bottom:12px">📁</div>
        <div>Brak projektów. Utwórz pierwszy projekt.</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="PageProjects.openCreate()">+ Nowy projekt</button>
      </div>`;
      return;
    }
    el.innerHTML = currentView === 'cards' ? renderCards(rows) : renderTable(rows);
  }

  function renderCards(rows) {
    return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      ${rows.map(p => {
        const hours = ((p.total_minutes||0)/60).toFixed(1);
        const lastAct = p.last_activity ? relativeDate(p.last_activity) : 'brak aktywności';
        return `<div class="card" style="display:flex;flex-direction:column;gap:0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:15px;font-weight:600">${UI.esc(p.name)}</span>
            <span style="font-size:11px">${STATUS_ICONS[p.status]||''} ${STATUS_LABELS[p.status]||p.status}</span>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">${UI.esc(p.client_name||'—')}</div>
          <div style="height:1px;background:var(--border);margin-bottom:10px"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin-bottom:10px">
            <div>⏱ ${hours}h</div>
            <div>💰 ${fmt(p.paid_revenue)}</div>
            <div>💸 ${fmt(p.total_expenses)}</div>
            <div>📅 ${p.start_date ? UI.formatDate(p.start_date) : '—'}</div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Aktywność: ${lastAct}</div>
          <div style="height:1px;background:var(--border);margin-bottom:10px"></div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-primary" onclick="PageProjects.openProject(${p.id})">Otwórz</button>
            ${p.status === 'active' ? `<button class="btn btn-sm btn-secondary" onclick="App.navigate('time')">▶ Timer</button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="PageProjects.openEdit(${p.id})">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="PageProjects.deleteProject(${p.id})">🗑</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function renderTable(rows) {
    return `<div class="card" style="padding:0;overflow:hidden">
      <table>
        <thead><tr>
          <th>Nazwa projektu</th><th>Klient</th><th>Status</th>
          <th class="text-right">Godziny</th><th class="text-right">Przychód</th>
          <th class="text-right">Koszty</th><th>Data końca</th><th>Akcje</th>
        </tr></thead>
        <tbody>
          ${rows.map(p => `<tr>
            <td><a href="#" style="color:var(--accent-orange);font-weight:500" onclick="event.preventDefault();PageProjects.openProject(${p.id})">${UI.esc(p.name)}</a></td>
            <td style="font-size:12px">${UI.esc(p.client_name||'—')}</td>
            <td>${STATUS_ICONS[p.status]||''} <span class="badge badge-${p.status==='active'?'success':p.status==='completed'?'info':p.status==='paused'?'warning':'muted'}">${STATUS_LABELS[p.status]||p.status}</span></td>
            <td class="text-right mono">${((p.total_minutes||0)/60).toFixed(1)}h</td>
            <td class="text-right amount">${fmt(p.paid_revenue)}</td>
            <td class="text-right amount">${fmt(p.total_expenses)}</td>
            <td style="font-size:12px">${p.end_date ? UI.formatDate(p.end_date) : '—'}</td>
            <td class="table-actions">
              <button class="btn btn-sm btn-secondary" onclick="PageProjects.openProject(${p.id})">👁</button>
              <button class="btn btn-sm btn-secondary" onclick="PageProjects.openEdit(${p.id})">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="PageProjects.deleteProject(${p.id})">🗑</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── Single project view ──────────────────────────────────
  async function openProject(id) {
    currentProjectId = id;
    currentProjectTab = 'overview';
    const proj = await window.api.projects.getById(id);
    if (!proj) return;
    renderProjectView(proj);
  }

  function renderProjectView(proj) {
    const margin = proj.paidRevenue > 0 ? (((proj.paidRevenue - proj.totalExpenses) / proj.paidRevenue) * 100).toFixed(1) : '0.0';
    document.getElementById('page-content').innerHTML = `
      <div class="page" id="project-detail">
        <div style="margin-bottom:16px">
          <button class="btn btn-sm btn-secondary" onclick="PageProjects.load()">← Powrót do listy</button>
        </div>
        <div class="page-header">
          <div>
            <h1 class="page-title">${UI.esc(proj.name)}</h1>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">
              ${UI.esc(proj.client_name||'—')} &nbsp;|&nbsp; ${STATUS_ICONS[proj.status]||''} ${STATUS_LABELS[proj.status]||proj.status}
              ${proj.start_date ? `&nbsp;|&nbsp; Start: ${UI.formatDate(proj.start_date)}` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary" onclick="PageProjects.openEdit(${proj.id})">✏️ Edytuj</button>
            <button class="btn btn-secondary" onclick="App.navigate('time')">▶ Timer</button>
          </div>
        </div>

        <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
          <div class="card kpi-card"><div class="kpi-label">⏱ Godziny</div><div class="kpi-value">${proj.totalHours.toFixed(1)}h</div></div>
          <div class="card kpi-card"><div class="kpi-label">💰 Przychód</div><div class="kpi-value amount">${fmt(proj.paidRevenue)}</div></div>
          <div class="card kpi-card"><div class="kpi-label">💸 Koszty</div><div class="kpi-value amount" style="color:var(--accent-red)">${fmt(proj.totalExpenses)}</div></div>
          <div class="card kpi-card"><div class="kpi-label">📈 Marża</div><div class="kpi-value">${margin}%</div></div>
        </div>

        <div class="tabs">
          ${['overview','time','invoices','expenses','tasks','notes'].map(t => {
            const labels = {overview:'📊 Przegląd',time:'⏱ Czas',invoices:'📄 Faktury',expenses:'💸 Koszty',tasks:'✅ Zadania',notes:'📝 Notatki'};
            return `<button class="tab-btn ${t===currentProjectTab?'active':''}" onclick="PageProjects.switchTab('${t}',${proj.id})">${labels[t]}</button>`;
          }).join('')}
        </div>
        <div id="proj-tab-content"></div>
      </div>`;
    switchTab(currentProjectTab, proj.id, proj);
  }

  async function switchTab(tab, projId, projData) {
    currentProjectTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(tab === 'overview' ? 'przegl' : tab === 'time' ? 'czas' : tab === 'invoices' ? 'faktur' : tab === 'expenses' ? 'koszty' : tab === 'tasks' ? 'zadan' : 'notatk')));
    const el = document.getElementById('proj-tab-content');
    if (!el) return;

    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Ładowanie…</div>`;

    if (tab === 'overview') {
      const proj = projData || await window.api.projects.getById(projId);
      el.innerHTML = `<div class="card">
        <div class="form-grid-2">
          ${proj.youtube_episode ? `<div class="form-group"><label>Epizod YouTube</label><div style="padding:8px 0">${UI.esc(proj.youtube_episode)}</div></div>` : ''}
          ${proj.hourly_rate > 0 ? `<div class="form-group"><label>Stawka godzinowa</label><div style="padding:8px 0">${fmt(proj.hourly_rate)}/h</div></div>` : ''}
          ${proj.start_date ? `<div class="form-group"><label>Data rozpoczęcia</label><div style="padding:8px 0">${UI.formatDate(proj.start_date)}</div></div>` : ''}
          ${proj.end_date ? `<div class="form-group"><label>Data zakończenia</label><div style="padding:8px 0">${UI.formatDate(proj.end_date)}</div></div>` : ''}
          ${proj.description ? `<div class="form-group full"><label>Opis</label><div style="padding:8px 0;white-space:pre-wrap">${UI.esc(proj.description)}</div></div>` : ''}
        </div>
      </div>`;
    } else if (tab === 'time') {
      const entries = await window.api.time.getAll({ project_id: projId });
      el.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" onclick="App.navigate('time')">+ Dodaj wpis czasu</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        ${!entries.length ? '<p class="text-muted" style="padding:40px;text-align:center">Brak wpisów czasu dla tego projektu.</p>' :
        `<table><thead><tr><th>Data</th><th>Kategoria</th><th>Opis</th><th class="text-right">Czas</th><th>Billable</th></tr></thead>
        <tbody>${entries.map(e=>`<tr>
          <td class="mono">${UI.formatDate(e.date)}</td>
          <td><span class="badge badge-muted">${UI.esc(e.category)}</span></td>
          <td style="font-size:12px">${UI.esc(e.description||'—')}</td>
          <td class="text-right mono">${fmtDuration(e.duration_minutes)}</td>
          <td>${e.is_billable?'✅':'—'}</td>
        </tr>`).join('')}</tbody></table>`}
      </div>`;
    } else if (tab === 'invoices') {
      const invs = await window.api.invoices.getAll({ project_id: projId });
      el.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
        ${!invs.length ? '<p class="text-muted" style="padding:40px;text-align:center">Brak faktur dla tego projektu.</p>' :
        `<table><thead><tr><th>Nr faktury</th><th>Klient</th><th>Data</th><th>Status</th><th class="text-right">Kwota</th></tr></thead>
        <tbody>${invs.map(i=>`<tr>
          <td class="mono">${UI.esc(i.invoice_number)}</td>
          <td style="font-size:12px">${UI.esc(i.client_name||'—')}</td>
          <td class="mono">${UI.formatDate(i.issue_date)}</td>
          <td>${UI.statusBadge(i.status)}</td>
          <td class="text-right amount">${fmt(i.total_eur||i.total)}</td>
        </tr>`).join('')}</tbody></table>`}
      </div>`;
    } else if (tab === 'expenses') {
      const exps = await window.api.expenses.getAll({ project_id: projId });
      el.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
        ${!exps.length ? '<p class="text-muted" style="padding:40px;text-align:center">Brak kosztów dla tego projektu.</p>' :
        `<table><thead><tr><th>Data</th><th>Kategoria</th><th>Opis</th><th class="text-right">Kwota</th></tr></thead>
        <tbody>${exps.map(e=>`<tr>
          <td class="mono">${UI.formatDate(e.date)}</td>
          <td><span class="badge badge-muted">${UI.esc(e.category)}</span></td>
          <td style="font-size:12px">${UI.esc(e.description)}</td>
          <td class="text-right amount">${fmt(e.amount_eur)}</td>
        </tr>`).join('')}</tbody></table>`}
      </div>`;
    } else if (tab === 'tasks') {
      const tks = await window.api.tasks.getAll({ project_id: projId });
      el.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" onclick="PageProjects._quickTask(${projId})">+ Nowe zadanie</button>
      </div>
      ${renderTaskList(tks)}`;
    } else if (tab === 'notes') {
      const ns = await window.api.notes.getAll({ project_id: projId });
      el.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" onclick="App.navigate('notes')">📝 Otwórz notatnik</button>
      </div>
      ${!ns.length ? '<div class="card"><p class="text-muted" style="padding:40px;text-align:center">Brak notatek dla tego projektu.</p></div>' :
      `<div style="display:grid;gap:8px">${ns.map(n=>`<div class="card" style="cursor:pointer" onclick="App.navigate('notes')">
        <div style="font-weight:500">${n.is_pinned?'📌 ':''} ${UI.esc(n.title)}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${UI.formatDate(n.updated_at)}</div>
      </div>`).join('')}</div>`}`;
    }
  }

  function renderTaskList(tks) {
    if (!tks.length) return `<div class="card"><p class="text-muted" style="padding:40px;text-align:center">Brak zadań.</p></div>`;
    const PCOL = { urgent:'var(--accent-red)', high:'var(--accent-orange)', medium:'var(--accent-yellow)', low:'var(--accent-green)' };
    return `<div class="card" style="padding:0">
      ${tks.map(t => `<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border)">
        <input type="checkbox" ${t.status==='done'?'checked':''} onchange="PageProjects._toggleTask(${t.id},this.checked)">
        <div style="flex:1;${t.status==='done'?'opacity:0.5;text-decoration:line-through':''}">
          <div style="font-size:13px">${UI.esc(t.title)}</div>
          ${t.due_date?`<div style="font-size:11px;color:var(--text-muted)">📅 ${UI.formatDate(t.due_date)}</div>`:''}
        </div>
        <span style="width:8px;height:8px;border-radius:50%;background:${PCOL[t.priority]||'var(--text-muted)'};display:inline-block"></span>
      </div>`).join('')}
    </div>`;
  }

  async function _quickTask(projId) {
    UI.openModal('+ Nowe zadanie', `
      <div class="form-group"><label>Tytuł *</label><input type="text" id="qt-title" placeholder="Tytuł zadania"></div>
      <div class="form-group"><label>Termin</label><input type="date" id="qt-due"></div>
    `, {
      footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
               <button class="btn btn-primary" onclick="PageProjects._saveQuickTask(${projId})">Zapisz</button>`
    });
  }

  async function _saveQuickTask(projId) {
    const title = document.getElementById('qt-title')?.value.trim();
    if (!title) { UI.toast('Tytuł jest wymagany.', 'warning'); return; }
    await window.api.tasks.create({ title, project_id: projId, due_date: document.getElementById('qt-due')?.value || null });
    UI.closeModal();
    UI.toast('Zadanie dodane.', 'success');
    switchTab('tasks', projId);
  }

  async function _toggleTask(id, done) {
    await window.api.tasks.update(id, { status: done ? 'done' : 'todo' });
  }

  // ── Create / Edit ────────────────────────────────────────
  function openCreate() { openForm(null); }

  async function openEdit(id) {
    const proj = await window.api.projects.getById(id);
    if (proj) openForm(proj);
  }

  function openForm(proj) {
    const isEdit = !!proj;
    const today = new Date().toISOString().split('T')[0];
    UI.openModal(isEdit ? '✏️ Edytuj projekt' : '+ Nowy projekt', `
      <div class="form-grid-2">
        <div class="form-group full"><label>Nazwa projektu *</label><input type="text" id="pf-name" value="${UI.esc(proj?.name||'')}"></div>
        <div class="form-group"><label>Klient</label>
          <select id="pf-client"><option value="">— brak —</option>
            ${allClients.map(c=>`<option value="${c.id}" ${proj?.client_id==c.id?'selected':''}>${UI.esc(c.name)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Status</label>
          <select id="pf-status">
            ${Object.entries(STATUS_LABELS).map(([v,l])=>`<option value="${v}" ${(proj?.status||'active')===v?'selected':''}>${l}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Data rozpoczęcia</label><input type="date" id="pf-start" value="${proj?.start_date||today}"></div>
        <div class="form-group"><label>Data zakończenia</label><input type="date" id="pf-end" value="${proj?.end_date||''}"></div>
        <div class="form-group"><label>Epizod YouTube</label><input type="text" id="pf-yt" placeholder="np. ep.47" value="${UI.esc(proj?.youtube_episode||'')}"></div>
        <div class="form-group"><label>Stawka godzinowa (€/h)</label><input type="number" id="pf-rate" step="0.01" value="${proj?.hourly_rate||0}"></div>
        <div class="form-group"><label>Waluta</label>
          <select id="pf-cur">${['EUR','USD','GBP','PLN'].map(c=>`<option ${(proj?.currency||'EUR')===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="form-group full"><label>Opis</label><textarea id="pf-desc" rows="3">${UI.esc(proj?.description||'')}</textarea></div>
      </div>
    `, {
      size: 'lg',
      footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
               <button class="btn btn-primary" onclick="PageProjects.saveForm(${proj?.id||'null'})">${isEdit?'💾 Zapisz':'+ Utwórz'}</button>`
    });
  }

  async function saveForm(id) {
    const name = document.getElementById('pf-name')?.value.trim();
    if (!name) { UI.toast('Nazwa projektu jest wymagana.', 'warning'); return; }
    const data = {
      name,
      client_id: document.getElementById('pf-client')?.value || null,
      status: document.getElementById('pf-status')?.value || 'active',
      start_date: document.getElementById('pf-start')?.value || null,
      end_date: document.getElementById('pf-end')?.value || null,
      youtube_episode: document.getElementById('pf-yt')?.value.trim(),
      hourly_rate: parseFloat(document.getElementById('pf-rate')?.value) || 0,
      currency: document.getElementById('pf-cur')?.value || 'EUR',
      description: document.getElementById('pf-desc')?.value.trim()
    };
    try {
      if (id) {
        await window.api.projects.update(id, data);
        UI.toast('Projekt zaktualizowany.', 'success');
        UI.closeModal();
        openProject(id);
      } else {
        const r = await window.api.projects.create(data);
        UI.toast('Projekt utworzony.', 'success');
        UI.closeModal();
        openProject(r.id);
      }
    } catch (err) { UI.toast('Błąd: ' + err.message, 'error'); }
  }

  async function deleteProject(id) {
    const ok = await UI.confirm('Usunąć ten projekt? Powiązane wpisy czasu i koszty pozostaną.', 'Usuń projekt');
    if (!ok) return;
    await window.api.projects.delete(id);
    UI.toast('Projekt usunięty.', 'success');
    allProjects = allProjects.filter(p => p.id !== id);
    renderList();
  }

  // ── Helpers ──────────────────────────────────────────────
  function fmt(v) { return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v||0); }
  function fmtDuration(m) { const h=Math.floor((m||0)/60),mn=(m||0)%60; return `${h}h ${mn}min`; }
  function relativeDate(dtStr) {
    const diff = Math.floor((Date.now() - new Date(dtStr))/86400000);
    if (diff === 0) return 'dziś';
    if (diff === 1) return 'wczoraj';
    if (diff < 30) return `${diff} dni temu`;
    return UI.formatDate(dtStr.split('T')[0]);
  }

  return { load, openProject, switchTab, openCreate, openEdit, saveForm, deleteProject, setView, _quickTask, _saveQuickTask, _toggleTask };
})();

window.PageProjects = PageProjects;

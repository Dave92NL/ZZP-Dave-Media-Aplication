'use strict';

window.PageReminders = (() => {
  let _all = [];
  let _filter = 'all';

  const TYPE_LABELS = {
    btw:    'BTW aangifte',
    icp:    'ICP opgaaf',
    invoice:'Faktura',
    custom: 'Własne'
  };

  async function load() {
    const el = document.getElementById('page-content');
    const dashDays = await window.api.settings.get('reminders_dashboard_days') || '30';
    el.innerHTML = `
<div class="page-header">
  <h1>🔔 Przypomnienia</h1>
  <button class="btn btn-primary" id="rem-new-btn">+ Nowe przypomnienie</button>
</div>
<div class="filter-bar" style="margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
  <select id="rem-filter" class="filter-select">
    <option value="all">Wszystkie</option>
    <option value="active">Aktywne</option>
    <option value="urgent">Pilne (≤7 dni)</option>
    <option value="dismissed">Odwołane</option>
  </select>
  <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
    <span style="font-size:13px;color:var(--text-secondary)">📊 Na dashboardzie pokaż:</span>
    <select id="rem-dash-days" class="filter-select" style="width:170px">
      <option value="7"  ${dashDays==='7' ?'selected':''}>Następne 7 dni</option>
      <option value="14" ${dashDays==='14'?'selected':''}>Następne 14 dni</option>
      <option value="30" ${dashDays==='30'?'selected':''}>Następne 30 dni</option>
      <option value="60" ${dashDays==='60'?'selected':''}>Następne 60 dni</option>
      <option value="90" ${dashDays==='90'?'selected':''}>Następne 90 dni</option>
      <option value="0"  ${dashDays==='0' ?'selected':''}>Wszystkie przyszłe</option>
    </select>
  </div>
</div>
<div class="card" id="rem-list-wrap"><div class="skeleton" style="height:200px;border-radius:6px"></div></div>`;

    await _loadList();
    _bind();
  }

  async function _loadList() {
    _all = await window.api.reminders.getAll();
    _render();
  }

  function _render() {
    const today = new Date();
    today.setHours(0,0,0,0);

    let rows = _all;
    if (_filter === 'active')    rows = rows.filter(r => !r.is_dismissed);
    if (_filter === 'urgent')    rows = rows.filter(r => !r.is_dismissed && _daysUntil(r.due_date) <= 7);
    if (_filter === 'dismissed') rows = rows.filter(r => r.is_dismissed);

    const el = document.getElementById('rem-list-wrap');
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<p class="text-muted" style="padding:32px;text-align:center">Brak przypomnień</p>';
      return;
    }

    el.innerHTML = `<table><thead><tr>
      <th>Status</th><th>Typ</th><th>Tytuł</th><th>Termin</th><th>Godzina</th><th>Akcje</th>
    </tr></thead><tbody>
    ${rows.map(r => {
      const days = _daysUntil(r.due_date);
      let badge, dot;
      if (r.is_dismissed)       { badge = '<span class="badge badge-muted">✅ Odwołane</span>'; dot = '✅'; }
      else if (days <= 0)       { badge = '<span class="badge badge-danger">🔴 Pilne</span>'; dot = '🔴'; }
      else if (days <= 7)       { badge = '<span class="badge badge-danger">🔴 Pilne</span>'; dot = '🔴'; }
      else if (days <= 14)      { badge = '<span class="badge badge-warning">🟡 Zbliżające się</span>'; dot = '🟡'; }
      else                      { badge = '<span class="badge badge-success">🟢 Przyszłe</span>'; dot = '🟢'; }

      const typeLabel = TYPE_LABELS[r.type] || r.type || 'Własne';
      const actions = r.is_dismissed
        ? `<button class="btn btn-sm btn-danger" onclick="PageReminders._delete(${r.id})">🗑</button>`
        : `<button class="btn btn-sm btn-secondary" onclick="PageReminders._edit(${r.id})">✏️</button>
           <button class="btn btn-sm btn-success" onclick="PageReminders._dismiss(${r.id})">✅</button>
           <button class="btn btn-sm btn-danger" onclick="PageReminders._delete(${r.id})">🗑</button>`;
      return `<tr>
        <td>${badge}</td>
        <td><span class="badge badge-info">${UI.esc(typeLabel)}</span></td>
        <td style="font-weight:500">${UI.esc(r.title)}</td>
        <td class="mono">${_fmtDate(r.due_date)}</td>
        <td class="mono">${r.due_time || '09:00'}</td>
        <td style="display:flex;gap:4px">${actions}</td>
      </tr>`;
    }).join('')}
    </tbody></table>`;
  }

  function _bind() {
    document.getElementById('rem-new-btn')?.addEventListener('click', () => _openForm(null));
    document.getElementById('rem-filter')?.addEventListener('change', e => {
      _filter = e.target.value;
      _render();
    });
    document.getElementById('rem-dash-days')?.addEventListener('change', async e => {
      await window.api.settings.set('reminders_dashboard_days', e.target.value);
      const label = e.target.options[e.target.selectedIndex].text;
      UI.toast(`Dashboard: ${label}`, 'success');
    });
  }

  function _openForm(id) {
    const item = id ? _all.find(r => r.id === id) : null;
    const today = new Date().toISOString().split('T')[0];
    UI.openModal(id ? 'Edytuj przypomnienie' : 'Nowe przypomnienie', `
<div class="form-grid-2">
  <div class="form-group full">
    <label>Tytuł *</label>
    <div style="display:flex;align-items:center;gap:6px">
      <input type="text" id="rem-f-title" value="${UI.esc(item?.title||'')}" placeholder="np. BTW-aangifte Q3" style="flex:1">
      ${window.Translator ? Translator.widgetHTML('rem-f-title') : ''}
    </div>
  </div>
  <div class="form-group full">
    <label>Opis (opcjonalnie)</label>
    <div class="tr-field">
      <textarea id="rem-f-desc" rows="2">${UI.esc(item?.description||'')}</textarea>
      ${window.Translator ? Translator.widgetHTML('rem-f-desc') : ''}
    </div>
  </div>
  <div class="form-group">
    <label>Data *</label>
    <input type="date" id="rem-f-date" value="${item?.due_date||today}">
  </div>
  <div class="form-group">
    <label>Godzina</label>
    <input type="time" id="rem-f-time" value="${item?.due_time||'09:00'}">
  </div>
  <div class="form-group">
    <label>Typ</label>
    <select id="rem-f-type" class="filter-select" style="width:100%">
      ${Object.entries(TYPE_LABELS).map(([k,v]) => `<option value="${k}"${item?.type===k?' selected':''}>${v}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label>Powtarzaj</label>
    <select id="rem-f-recur" class="filter-select" style="width:100%">
      <option value="">Nie</option>
      <option value="monthly"${item?.recurrence_pattern==='monthly'?' selected':''}>Co miesiąc</option>
      <option value="quarterly"${item?.recurrence_pattern==='quarterly'?' selected':''}>Co kwartał</option>
      <option value="yearly"${item?.recurrence_pattern==='yearly'?' selected':''}>Co rok</option>
    </select>
  </div>
</div>`, {
      footer: `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
        <button class="btn btn-primary" onclick="PageReminders._save(${id||'null'})">💾 Zapisz</button>`
    });
  }

  async function _save(id) {
    const title = document.getElementById('rem-f-title')?.value?.trim();
    const due_date = document.getElementById('rem-f-date')?.value;
    if (!title) { UI.toast('Tytuł jest wymagany', 'error'); return; }
    if (!due_date) { UI.toast('Data jest wymagana', 'error'); return; }

    const data = {
      title,
      description: document.getElementById('rem-f-desc')?.value?.trim() || '',
      due_date,
      due_time: document.getElementById('rem-f-time')?.value || '09:00',
      type: document.getElementById('rem-f-type')?.value || 'custom',
      is_recurring: !!document.getElementById('rem-f-recur')?.value,
      recurrence_pattern: document.getElementById('rem-f-recur')?.value || ''
    };

    try {
      if (id) await window.api.reminders.update(id, data);
      else    await window.api.reminders.create(data);
      UI.closeModal();
      UI.toast(id ? 'Przypomnienie zaktualizowane' : 'Przypomnienie dodane', 'success');
      await _loadList();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function _dismiss(id) {
    await window.api.reminders.dismiss(id);
    UI.toast('Oznaczono jako wykonane', 'success');
    await _loadList();
  }

  async function _delete(id) {
    const ok = await UI.confirm('Usunąć to przypomnienie?');
    if (!ok) return;
    await window.api.reminders.delete(id);
    await _loadList();
  }

  function _edit(id) { _openForm(id); }

  function _daysUntil(dateStr) {
    if (!dateStr) return 999;
    const d = new Date(dateStr); d.setHours(0,0,0,0);
    const n = new Date(); n.setHours(0,0,0,0);
    return Math.ceil((d - n) / 86400000);
  }

  function _fmtDate(s) {
    if (!s) return '';
    const [y,m,d] = s.split('-');
    return `${d}.${m}.${y}`;
  }

  return { load, _save, _edit, _dismiss, _delete };
})();

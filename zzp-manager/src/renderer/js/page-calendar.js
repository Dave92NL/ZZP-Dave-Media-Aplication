'use strict';

window.PageCalendar = (() => {
  let _connected = false;
  let _events = [];

  async function load() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
<div class="page-header">
  <h1>📅 Kalendarz</h1>
  <div class="page-actions">
    <button class="btn btn-secondary" id="cal-refresh-btn" title="Odśwież wydarzenia">🔄 Odśwież</button>
    <button class="btn btn-primary" id="cal-new-btn">+ Nowe wydarzenie</button>
  </div>
</div>
<div id="cal-connection-wrap"></div>
<div id="cal-events-wrap" style="margin-top:16px"></div>`;

    await _refreshConnectionCard();
    _bindStatic();
  }

  function _bindStatic() {
    document.getElementById('cal-refresh-btn')?.addEventListener('click', _loadEvents);
    document.getElementById('cal-new-btn')?.addEventListener('click', () => _openForm(null));
  }

  async function _refreshConnectionCard() {
    const status = await window.api.calendar.getAuthStatus().catch(() => ({ connected: false, clientId: '' }));
    _connected = !!status.connected;

    const wrap = document.getElementById('cal-connection-wrap');
    const newBtn = document.getElementById('cal-new-btn');
    const refreshBtn = document.getElementById('cal-refresh-btn');
    if (newBtn) newBtn.disabled = !_connected;
    if (refreshBtn) refreshBtn.disabled = !_connected;

    if (_connected) {
      wrap.innerHTML = `
<div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
  <div>
    <span style="color:var(--accent-green);font-weight:600">✅ Połączono z Google Calendar</span>
  </div>
  <button class="btn btn-secondary btn-sm" id="cal-disconnect-btn">🗑 Rozłącz konto</button>
</div>`;
      document.getElementById('cal-disconnect-btn')?.addEventListener('click', _disconnect);
      await _loadEvents();
    } else {
      wrap.innerHTML = `
<div class="card">
  <h3 class="section-title">Konfiguracja Google Cloud Console</h3>
  <div style="background:rgba(88,166,255,0.07);border:1px solid var(--accent-blue);border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:var(--text-secondary);line-height:1.7">
    <strong style="color:var(--accent-blue)">ℹ️ Jak skonfigurować Google Calendar API:</strong><br>
    1. Przejdź do <a href="#" id="cal-cloud-link" style="color:var(--accent-blue)">console.cloud.google.com</a> → utwórz nowy projekt (lub użyj istniejącego z YouTube API)<br>
    2. Włącz: <strong>Google Calendar API</strong> (APIs &amp; Services → Library)<br>
    3. Utwórz <strong>OAuth 2.0 Client ID</strong> (Credentials → Desktop App) — możesz użyć osobnego klienta lub dodać ten redirect URI do istniejącego<br>
    4. Dodaj <code style="background:var(--bg-tertiary);padding:1px 5px;border-radius:3px">http://localhost:8086/oauth2callback</code> jako Authorized redirect URI<br>
    5. Skopiuj Client ID i Client Secret poniżej
  </div>
  <div class="form-grid-2">
    <div class="form-group">
      <label>Client ID</label>
      <input type="text" id="cal-client-id" value="${UI.esc(status.clientId || '')}" placeholder="123456789-abc...apps.googleusercontent.com">
    </div>
    <div class="form-group">
      <label>Client Secret</label>
      <input type="password" id="cal-client-secret" placeholder="GOCSPX-...">
    </div>
  </div>
  <button class="btn btn-primary" id="cal-connect-btn">🔗 Połącz konto Google</button>
</div>`;

      document.getElementById('cal-cloud-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.open('https://console.cloud.google.com', '_blank');
      });

      document.getElementById('cal-connect-btn')?.addEventListener('click', async () => {
        const clientId     = document.getElementById('cal-client-id').value.trim();
        const clientSecret = document.getElementById('cal-client-secret').value.trim();
        if (!clientId || !clientSecret) {
          UI.toast('Wpisz Client ID i Client Secret', 'warning');
          return;
        }
        const btn = document.getElementById('cal-connect-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Autoryzacja w przeglądarce…'; }
        try {
          await window.api.calendar.oauthConnect(clientId, clientSecret);
          UI.toast('✅ Połączono z Google Calendar!', 'success');
          await _refreshConnectionCard();
        } catch (e) {
          UI.toast('Błąd autoryzacji: ' + e.message, 'error');
          if (btn) { btn.disabled = false; btn.textContent = '🔗 Połącz konto Google'; }
        }
      });

      document.getElementById('cal-events-wrap').innerHTML = '';
    }
  }

  async function _disconnect() {
    const ok = await UI.confirm('Rozłączyć konto Google Calendar? Wydarzenia w Google pozostaną nienaruszone.');
    if (!ok) return;
    await window.api.calendar.disconnectAuth();
    UI.toast('Konto Google Calendar rozłączone', 'success');
    await _refreshConnectionCard();
  }

  async function _loadEvents() {
    const wrap = document.getElementById('cal-events-wrap');
    wrap.innerHTML = '<div class="card" style="padding:40px;text-align:center;color:var(--text-muted)">Ładowanie wydarzeń…</div>';
    try {
      const now = new Date();
      const timeMin = now.toISOString();
      const future = new Date(now.getTime() + 60 * 24 * 3600 * 1000); // next 60 days
      const timeMax = future.toISOString();
      _events = await window.api.calendar.listEvents(timeMin, timeMax);
      _renderEvents();
    } catch (e) {
      wrap.innerHTML = `<div class="alert alert-danger">Błąd wczytywania wydarzeń: ${UI.esc(e.message)}</div>`;
    }
  }

  function _renderEvents() {
    const wrap = document.getElementById('cal-events-wrap');
    if (!wrap) return;

    if (!_events.length) {
      wrap.innerHTML = '<div class="card"><p class="text-muted" style="padding:32px;text-align:center">Brak nadchodzących wydarzeń w ciągu najbliższych 60 dni</p></div>';
      return;
    }

    // Group by calendar date (YYYY-MM-DD)
    const groups = {};
    for (const ev of _events) {
      const dateKey = (ev.start || '').slice(0, 10);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(ev);
    }

    const html = Object.entries(groups).map(([dateKey, evs]) => `
      <div class="card" style="margin-bottom:12px">
        <h3 class="section-title">${_fmtGroupDate(dateKey)}</h3>
        ${evs.map(ev => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:500">${UI.esc(ev.title)}</div>
              <div style="font-size:12px;color:var(--text-muted)">
                ${ev.allDay ? 'Cały dzień' : _fmtTimeRange(ev.start, ev.end)}
                ${ev.description ? ' — ' + UI.esc(ev.description) : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm btn-secondary" onclick="PageCalendar._edit('${ev.id}')">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="PageCalendar._delete('${ev.id}')">🗑</button>
            </div>
          </div>`).join('')}
      </div>`).join('');

    wrap.innerHTML = html;
  }

  function _openForm(id) {
    const ev = id ? _events.find(e => e.id === id) : null;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const nowTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const startDate = ev?.start ? ev.start.slice(0, 10) : todayStr;
    const startTime = ev && !ev.allDay ? ev.start.slice(11, 16) : nowTime;
    const endDate   = ev?.end ? ev.end.slice(0, 10) : startDate;
    const endTime   = ev && !ev.allDay && ev.end ? ev.end.slice(11, 16) : nowTime;
    const allDay    = ev?.allDay || false;

    UI.openModal(id ? 'Edytuj wydarzenie' : 'Nowe wydarzenie', `
<div class="form-grid-2">
  <div class="form-group full">
    <label>Tytuł *</label>
    <div style="display:flex;align-items:center;gap:6px">
      <input type="text" id="cal-f-title" value="${UI.esc(ev?.title || '')}" placeholder="np. Spotkanie z klientem" style="flex:1">
      ${window.Translator ? Translator.widgetHTML('cal-f-title') : ''}
    </div>
  </div>
  <div class="form-group full">
    <label>Opis (opcjonalnie)</label>
    <div class="tr-field">
      <textarea id="cal-f-desc" rows="2">${UI.esc(ev?.description || '')}</textarea>
      ${window.Translator ? Translator.widgetHTML('cal-f-desc') : ''}
    </div>
  </div>
  <div class="form-group full">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
      <input type="checkbox" id="cal-f-allday" ${allDay ? 'checked' : ''} style="width:15px;height:15px">
      <span>Wydarzenie całodniowe</span>
    </label>
  </div>
  <div class="form-group">
    <label>Data rozpoczęcia *</label>
    <input type="date" id="cal-f-start-date" value="${startDate}">
  </div>
  <div class="form-group" id="cal-f-start-time-wrap" style="${allDay ? 'display:none' : ''}">
    <label>Godzina rozpoczęcia</label>
    <input type="time" id="cal-f-start-time" value="${startTime}">
  </div>
  <div class="form-group">
    <label>Data zakończenia *</label>
    <input type="date" id="cal-f-end-date" value="${endDate}">
  </div>
  <div class="form-group" id="cal-f-end-time-wrap" style="${allDay ? 'display:none' : ''}">
    <label>Godzina zakończenia</label>
    <input type="time" id="cal-f-end-time" value="${endTime}">
  </div>
</div>`, {
      footer: `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
        <button class="btn btn-primary" onclick="PageCalendar._save(${id ? `'${id}'` : 'null'})">💾 Zapisz</button>`
    });

    document.getElementById('cal-f-allday')?.addEventListener('change', (e) => {
      const show = !e.target.checked;
      document.getElementById('cal-f-start-time-wrap').style.display = show ? '' : 'none';
      document.getElementById('cal-f-end-time-wrap').style.display = show ? '' : 'none';
    });
  }

  async function _save(id) {
    const title = document.getElementById('cal-f-title')?.value?.trim();
    if (!title) { UI.toast('Tytuł jest wymagany', 'error'); return; }

    const allDay = document.getElementById('cal-f-allday')?.checked;
    const startDate = document.getElementById('cal-f-start-date')?.value;
    const endDate = document.getElementById('cal-f-end-date')?.value;
    if (!startDate || !endDate) { UI.toast('Daty są wymagane', 'error'); return; }

    let start, end;
    if (allDay) {
      start = startDate;
      end = endDate;
    } else {
      const startTime = document.getElementById('cal-f-start-time')?.value || '09:00';
      const endTime = document.getElementById('cal-f-end-time')?.value || '10:00';
      start = `${startDate}T${startTime}:00`;
      end = `${endDate}T${endTime}:00`;
    }

    const data = {
      title,
      description: document.getElementById('cal-f-desc')?.value?.trim() || '',
      start, end, allDay
    };

    try {
      if (id) await window.api.calendar.updateEvent(id, data);
      else    await window.api.calendar.createEvent(data);
      UI.closeModal();
      UI.toast(id ? 'Wydarzenie zaktualizowane' : 'Wydarzenie dodane', 'success');
      await _loadEvents();
    } catch (e) { UI.toast('Błąd zapisu: ' + e.message, 'error'); }
  }

  function _edit(id) { _openForm(id); }

  async function _delete(id) {
    const ok = await UI.confirm('Usunąć to wydarzenie z Google Calendar?');
    if (!ok) return;
    try {
      await window.api.calendar.deleteEvent(id);
      UI.toast('Wydarzenie usunięte', 'success');
      await _loadEvents();
    } catch (e) { UI.toast('Błąd usuwania: ' + e.message, 'error'); }
  }

  function _fmtGroupDate(dateKey) {
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-');
    const date = new Date(+y, +m - 1, +d);
    const today = new Date(); today.setHours(0,0,0,0);
    const diffDays = Math.round((date - today) / 86400000);
    const dayNames = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
    const label = diffDays === 0 ? 'Dziś' : diffDays === 1 ? 'Jutro' : dayNames[date.getDay()];
    return `${label}, ${d}.${m}.${y}`;
  }

  function _fmtTimeRange(start, end) {
    const s = start ? start.slice(11, 16) : '';
    const e = end ? end.slice(11, 16) : '';
    return s && e ? `${s} – ${e}` : (s || '');
  }

  return { load, _save, _edit, _delete };
})();

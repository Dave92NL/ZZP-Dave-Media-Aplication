'use strict';

window.PageSettings = (() => {
  let _activeTab = 'profile';
  let _profile = {};
  let _settings = {};

  const TABS = [
    { id: 'profile',   icon: '👤', label: 'Profil firmy' },
    { id: 'invoices',  icon: '📄', label: 'Faktury' },
    { id: 'time',      icon: '⏱',  label: 'Czas pracy' },
    { id: 'tax',       icon: '🧮', label: 'Podatki' },
    { id: 'backup',    icon: '💾', label: 'Backup' },
    { id: 'appearance',icon: '🎨', label: 'Wygląd' },
    { id: 'security',  icon: '🔒', label: 'Bezpieczeństwo' },
    { id: 'data',      icon: '📦', label: 'Dane' },
    { id: 'youtube',   icon: '🎬', label: 'YouTube API' },
    { id: 'sync',      icon: '📱', label: 'Synchronizacja / Telefon' }
  ];

  async function load() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
<div class="page-header"><h1>⚙️ Ustawienia</h1></div>
<div class="settings-tab-layout">
  <nav class="settings-tab-nav" id="settings-tab-nav">
    ${TABS.map(t => `
      <button class="settings-tab-btn${t.id===_activeTab?' active':''}" data-tab="${t.id}">
        <span>${t.icon}</span> ${t.label}
      </button>`).join('')}
  </nav>
  <div class="settings-tab-content" id="settings-tab-content">
    <div class="skeleton" style="height:300px;border-radius:6px"></div>
  </div>
</div>`;

    [_profile, _settings] = await Promise.all([
      window.api.profile.get(),
      window.api.settings.getAll()
    ]);

    _bindNav();
    await _renderTab(_activeTab);
  }

  function _bindNav() {
    document.getElementById('settings-tab-nav')?.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        _activeTab = btn.dataset.tab;
        document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await _renderTab(_activeTab);
      });
    });
  }

  async function _renderTab(tab) {
    const el = document.getElementById('settings-tab-content');
    switch (tab) {
      case 'profile':   el.innerHTML = _tplProfile();   break;
      case 'invoices':  el.innerHTML = _tplInvoices();  break;
      case 'time':      el.innerHTML = _tplTime();      break;
      case 'tax':       el.innerHTML = await _tplTax(); break;
      case 'backup':    el.innerHTML = await _tplBackup(); break;
      case 'appearance':el.innerHTML = _tplAppearance(); break;
      case 'security':  el.innerHTML = _tplSecurity();  break;
      case 'data':      el.innerHTML = _tplData();      break;
      case 'youtube':   el.innerHTML = await _tplYouTube(); break;
      case 'sync':      el.innerHTML = await _tplSync();    break;
    }
    _bindTabEvents(tab);
  }

  // ── Profile tab ──────────────────────────────────────────
  function _tplProfile() {
    const p = _profile;
    return `<div class="card">
      <h3 class="section-title">Dane firmy</h3>
      <div class="form-grid-2">
        <div class="form-group"><label>Imię / Nazwa *</label><input type="text" id="sp-name" value="${UI.esc(p.name||'')}"></div>
        <div class="form-group"><label>Adres</label><input type="text" id="sp-address" value="${UI.esc(p.address||'')}"></div>
        <div class="form-group"><label>Postcode</label><input type="text" id="sp-postcode" value="${UI.esc(p.postcode||'')}"></div>
        <div class="form-group"><label>Miasto</label><input type="text" id="sp-city" value="${UI.esc(p.city||'')}"></div>
        <div class="form-group"><label>Kraj</label><input type="text" id="sp-country" value="${UI.esc(p.country||'Nederland')}"></div>
        <div class="form-group"><label>KvK-nummer</label><input type="text" id="sp-kvk" value="${UI.esc(p.kvk_number||'')}"></div>
        <div class="form-group"><label>BTW-nummer</label><input type="text" id="sp-btw" value="${UI.esc(p.btw_number||'')}"></div>
        <div class="form-group"><label>IBAN</label><input type="text" id="sp-iban" value="${UI.esc(p.iban||'')}"></div>
        <div class="form-group"><label>Email</label><input type="email" id="sp-email" value="${UI.esc(p.email||'')}"></div>
        <div class="form-group"><label>Telefon</label><input type="tel" id="sp-phone" value="${UI.esc(p.phone||'')}"></div>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <button class="btn btn-secondary" id="sp-logo-btn">🖼 Zmień logo</button>
        ${p.logo_path ? '<span class="badge badge-success">Logo ustawione ✅</span>' : '<span class="badge badge-muted">Brak logo</span>'}
      </div>
      <div style="margin-top:16px">
        <button class="btn btn-primary" id="sp-save-btn">💾 Zapisz dane firmy</button>
      </div>
    </div>`;
  }

  // ── Invoices tab ─────────────────────────────────────────
  function _tplInvoices() {
    const p = _profile;
    return `<div class="card">
      <h3 class="section-title">Ustawienia faktur</h3>
      <div class="form-grid-2">
        <div class="form-group"><label>Domyślny termin płatności (dni)</label>
          <input type="number" id="si-days" value="${p.default_payment_days||14}" min="1" max="180"></div>
        <div class="form-group"><label>Domyślna waluta</label>
          <select id="si-currency" class="filter-select" style="width:100%">
            ${['EUR','USD','GBP','PLN'].map(c => `<option${(p.default_currency||'EUR')===c?' selected':''}>${c}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Domyślna stawka BTW (%)</label>
          <select id="si-btw" class="filter-select" style="width:100%">
            ${['0','9','21'].map(r => `<option value="${r}"${String(p.default_btw_rate||0)===r?' selected':''}>${r}%</option>`).join('')}
          </select></div>
        <div class="form-group full"><label>Stopka faktury</label>
          <textarea id="si-footer" rows="3">${UI.esc(p.invoice_footer||'')}</textarea></div>
      </div>
      <div style="margin-top:16px">
        <button class="btn btn-primary" id="si-save-btn">💾 Zapisz ustawienia faktur</button>
      </div>
    </div>`;
  }

  // ── Time tab ─────────────────────────────────────────────
  function _tplTime() {
    const g = k => _settings[k] || '';
    return `<div class="card">
      <h3 class="section-title">Czas pracy</h3>
      <div class="form-grid-2">
        <div class="form-group"><label>Domyślna stawka godzinowa (€/h)</label>
          <input type="number" id="st-rate" value="${_profile.default_hourly_rate||0}" min="0" step="0.5"></div>
        <div class="form-group"><label>Idle detection (min)</label>
          <input type="number" id="st-idle" value="${g('time_idle_minutes')||5}" min="1" max="60"></div>
        <div class="form-group"><label>Czas Pomodoro (min)</label>
          <input type="number" id="st-pomo" value="${g('pomodoro_work_minutes')||25}" min="5" max="120"></div>
        <div class="form-group"><label>Przerwa krótka (min)</label>
          <input type="number" id="st-break-short" value="${g('pomodoro_break_short')||5}" min="1" max="30"></div>
        <div class="form-group"><label>Przerwa długa (min)</label>
          <input type="number" id="st-break-long" value="${g('pomodoro_break_long')||15}" min="5" max="60"></div>
        <div class="form-group"><label>Dźwięk końca Pomodoro</label>
          <div class="toggle-row">
            <button class="btn btn-sm ${g('pomodoro_sound')!=='false'?'btn-primary':'btn-secondary'}" id="st-sound-on" onclick="this.classList.add('btn-primary');this.classList.remove('btn-secondary');document.getElementById('st-sound-off').classList.replace('btn-primary','btn-secondary')">🔔 Włączony</button>
            <button class="btn btn-sm ${g('pomodoro_sound')==='false'?'btn-primary':'btn-secondary'}" id="st-sound-off" onclick="this.classList.add('btn-primary');this.classList.remove('btn-secondary');document.getElementById('st-sound-on').classList.replace('btn-primary','btn-secondary')">🔕 Wyłączony</button>
          </div>
        </div>
      </div>
      <div style="margin-top:16px">
        <button class="btn btn-primary" id="st-save-btn">💾 Zapisz ustawienia czasu</button>
      </div>
    </div>`;
  }

  // ── Tax tab ──────────────────────────────────────────────
  async function _tplTax() {
    const year = new Date().getFullYear();
    let rates;
    try { rates = await window.api.tax.getRates(year); } catch { rates = {}; }
    const g = k => rates[k] ?? '';
    return `<div class="card">
      <h3 class="section-title">Stawki podatkowe ${year}</h3>
      <div class="form-grid-2">
        <div class="form-group"><label>Próg I (€)</label><input type="number" id="stax-bracket1" value="${g('bracket1_limit')||38441}" min="0"></div>
        <div class="form-group"><label>Stawka I (%)</label><input type="number" id="stax-rate1" value="${g('rate1')||36.97}" step="0.01" min="0" max="100"></div>
        <div class="form-group"><label>Stawka II (%)</label><input type="number" id="stax-rate2" value="${g('rate2')||49.50}" step="0.01" min="0" max="100"></div>
        <div class="form-group"><label>Zelfstandigenaftrek (€)</label><input type="number" id="stax-za" value="${g('zelfstandigenaftrek')||2470}" min="0"></div>
        <div class="form-group"><label>Startersaftrek (€)</label><input type="number" id="stax-sa" value="${g('startersaftrek')||2123}" min="0"></div>
        <div class="form-group"><label>MKB-winstvrijstelling (%)</label><input type="number" id="stax-mkb" value="${g('mkb_vrijstelling')||12.70}" step="0.01"></div>
        <div class="form-group"><label>Heffingskorting max (€)</label><input type="number" id="stax-hk" value="${g('heffingskorting_max')||3362}" min="0"></div>
        <div class="form-group"><label>Arbeidskorting max (€)</label><input type="number" id="stax-ak" value="${g('arbeidskorting_max')||5532}" min="0"></div>
      </div>
      <div style="margin-top:16px">
        <button class="btn btn-primary" id="stax-save-btn">💾 Zapisz stawki ${year}</button>
      </div>
    </div>`;
  }

  // ── Backup tab ───────────────────────────────────────────
  async function _tplBackup() {
    let bk = {}, hist = [];
    try { [bk, hist] = await Promise.all([window.api.backup.getSettings(), window.api.backup.getHistory()]); } catch {}
    const histHtml = hist.length ? hist.map(h => `
      <div style="display:flex;gap:12px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span>${h.status==='success'?'✅':'❌'}</span>
        <span style="flex:1">${UI.esc(h.filename||'')}</span>
        <span style="color:var(--text-muted)">${h.filesize?Math.round(h.filesize/1024/1024*10)/10+' MB':'—'}</span>
        <span style="color:var(--text-muted)">${(h.created_at||'').slice(0,16)}</span>
      </div>`).join('') : '<p class="text-muted" style="font-size:12px">Brak historii backupów</p>';

    return `<div class="card">
      <h3 class="section-title">Backup danych</h3>
      <div class="form-grid-2" style="margin-bottom:16px">
        <div class="form-group full">
          <label>Folder docelowy</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="sb-folder" value="${UI.esc(bk.folder||'')}" placeholder="Nie ustawiono" style="flex:1" readonly>
            <button class="btn btn-secondary btn-sm" id="sb-choose-btn">📂 Zmień</button>
          </div>
        </div>
        <div class="form-group">
          <label>Automatyczny backup</label>
          <div class="toggle-row">
            <button class="btn btn-sm ${bk.auto?'btn-primary':'btn-secondary'}" id="sb-auto-on" onclick="PageSettings._setAutoBackup(true)">✅ Włączony</button>
            <button class="btn btn-sm ${!bk.auto?'btn-primary':'btn-secondary'}" id="sb-auto-off" onclick="PageSettings._setAutoBackup(false)">⬜ Wyłączony</button>
          </div>
        </div>
        <div class="form-group">
          <label>Częstotliwość</label>
          <select id="sb-freq" class="filter-select" style="width:100%">
            <option value="daily"${bk.frequency==='daily'?' selected':''}>Codziennie</option>
            <option value="weekly"${bk.frequency==='weekly'?' selected':''}>Co tydzień</option>
            <option value="monthly"${bk.frequency==='monthly'?' selected':''}>Co miesiąc</option>
          </select>
        </div>
        <div class="form-group">
          <label>Godzina backupu</label>
          <input type="time" id="sb-time" value="${bk.time||'03:00'}">
        </div>
        <div class="form-group">
          <label>Liczba kopii do zachowania</label>
          <input type="number" id="sb-keep" value="${bk.keep||10}" min="1" max="100">
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:20px">
        <button class="btn btn-primary" id="sb-save-btn">💾 Zapisz ustawienia</button>
        <button class="btn btn-secondary" id="sb-run-btn">🔄 Wykonaj backup teraz</button>
        <button class="btn btn-secondary" id="sb-open-btn">📂 Otwórz folder</button>
      </div>
      <h3 class="section-title">Historia backupów</h3>
      <div>${histHtml}</div>
    </div>`;
  }

  let _autoBackupEnabled = true;
  function _setAutoBackup(val) {
    _autoBackupEnabled = val;
    document.getElementById('sb-auto-on')?.classList.toggle('btn-primary', val);
    document.getElementById('sb-auto-on')?.classList.toggle('btn-secondary', !val);
    document.getElementById('sb-auto-off')?.classList.toggle('btn-primary', !val);
    document.getElementById('sb-auto-off')?.classList.toggle('btn-secondary', val);
  }

  // ── Appearance tab ────────────────────────────────────────
  function _tplAppearance() {
    const theme = _settings.theme || 'dark';
    const lang  = _settings.language || 'pl';
    return `<div class="card">
      <h3 class="section-title">Motyw / Theme / Thema</h3>
      <div class="toggle-row" style="margin-bottom:24px">
        <button class="btn ${theme==='dark'?'btn-primary':'btn-secondary'}" id="sa-dark-btn" onclick="PageSettings._applyTheme('dark')">🌙 Ciemny</button>
        <button class="btn ${theme==='light'?'btn-primary':'btn-secondary'}" id="sa-light-btn" onclick="PageSettings._applyTheme('light')">☀️ Jasny</button>
      </div>
      <p class="text-muted" style="font-size:13px">Motyw jest zapisywany automatycznie po kliknięciu.</p>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 class="section-title">Język / Language / Taal</h3>
      <p class="text-muted" style="font-size:13px;margin-bottom:16px">
        Wybierz język interfejsu. Przy języku niderlandzkim pod etykietami wyświetlane są polskie tłumaczenia.
      </p>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="lang-btn ${lang==='pl'?'active':''}" onclick="PageSettings._applyLang('pl')">
          🇵🇱 Polski
        </button>
        <button class="lang-btn ${lang==='en'?'active':''}" onclick="PageSettings._applyLang('en')">
          🇬🇧 English
        </button>
        <button class="lang-btn ${lang==='nl'?'active':''}" onclick="PageSettings._applyLang('nl')">
          🇳🇱 Nederlands
          <span class="lang-sub" style="display:inline;margin-left:4px;font-size:10px;color:inherit;opacity:0.6">(niderlandzki)</span>
        </button>
      </div>
      ${lang === 'nl' ? `<div style="margin-top:12px;padding:10px 14px;background:rgba(88,166,255,0.08);border:1px solid var(--accent-blue);border-radius:8px;font-size:12px;color:var(--text-secondary)">
        <strong style="color:var(--accent-blue)">ℹ️ Nederlands actief</strong> — Onder Nederlandse etiketten worden Poolse vertalingen weergegeven.
        <span class="lang-sub">Pod holenderskimi etykietami widoczne są polskie tłumaczenia.</span>
      </div>` : ''}
    </div>
    <div class="card" style="margin-top:16px">
      <h3 class="section-title">Pływająca ikonka</h3>
      <p class="text-muted" style="font-size:13px;margin-bottom:16px">
        Mała ikonka aplikacji widoczna zawsze na wierzchu nad innymi programami. Przeciągnij, aby zmienić
        położenie, kliknij aby otworzyć ZZP Manager.
      </p>
      <div class="toggle-row" id="sa-floating-toggle">
        <button class="btn btn-secondary" id="sa-floating-on" disabled>⏳ Ładowanie…</button>
        <button class="btn btn-secondary" id="sa-floating-off" disabled>⏳ Ładowanie…</button>
      </div>
    </div>`;
  }

  async function _applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    await window.api.settings.set('theme', theme);
    ['dark','light'].forEach(t => {
      document.getElementById(`sa-${t}-btn`)?.classList.toggle('btn-primary', t===theme);
      document.getElementById(`sa-${t}-btn`)?.classList.toggle('btn-secondary', t!==theme);
    });
    UI.toast('Motyw zmieniony', 'success');
  }

  async function _initFloatingToggle() {
    const onBtn  = document.getElementById('sa-floating-on');
    const offBtn = document.getElementById('sa-floating-off');
    if (!onBtn || !offBtn) return;

    const enabled = await window.api.floatingWidget.getEnabled();
    _renderFloatingToggle(enabled);

    onBtn.addEventListener('click', () => _setFloatingWidget(true));
    offBtn.addEventListener('click', () => _setFloatingWidget(false));
  }

  function _renderFloatingToggle(enabled) {
    const onBtn  = document.getElementById('sa-floating-on');
    const offBtn = document.getElementById('sa-floating-off');
    if (!onBtn || !offBtn) return;
    onBtn.disabled  = false;
    offBtn.disabled = false;
    onBtn.textContent  = '🫧 Włączona';
    offBtn.textContent = '⬜ Wyłączona';
    onBtn.classList.toggle('btn-primary', enabled);
    onBtn.classList.toggle('btn-secondary', !enabled);
    offBtn.classList.toggle('btn-primary', !enabled);
    offBtn.classList.toggle('btn-secondary', enabled);
  }

  async function _setFloatingWidget(enabled) {
    await window.api.floatingWidget.setEnabled(enabled);
    _renderFloatingToggle(enabled);
    UI.toast(enabled ? 'Pływająca ikonka włączona' : 'Pływająca ikonka wyłączona', 'success');
  }

  // ── Security tab ─────────────────────────────────────────
  function _tplSecurity() {
    const pinEnabled = _settings.pin_enabled !== 'false';
    return `<div class="card">
      <h3 class="section-title">Zmiana PIN</h3>
      <div class="form-grid-2">
        <div class="form-group"><label>Obecny PIN</label><input type="password" id="ss-old-pin" placeholder="••••" inputmode="numeric" maxlength="8"></div>
        <div class="form-group"><label>Nowy PIN (4–8 cyfr)</label><input type="password" id="ss-new-pin" placeholder="••••" inputmode="numeric" maxlength="8"></div>
        <div class="form-group full"><label>Powtórz nowy PIN</label><input type="password" id="ss-new-pin2" placeholder="••••" inputmode="numeric" maxlength="8"></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-primary" id="ss-change-pin-btn">🔑 Zmień PIN</button>
        <button class="btn ${pinEnabled?'btn-danger':'btn-success'}" id="ss-toggle-pin-btn">
          ${pinEnabled?'🔓 Wyłącz ochronę PIN':'🔒 Włącz ochronę PIN'}
        </button>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 class="section-title">Auto-blokada</h3>
      <div class="form-group">
        <label>Zablokuj po bezczynności</label>
        <select id="ss-autolock" class="filter-select" style="width:240px">
          <option value="5"${_settings.auto_lock_minutes==='5'?' selected':''}>5 minut</option>
          <option value="15"${(_settings.auto_lock_minutes||'15')==='15'?' selected':''}>15 minut</option>
          <option value="30"${_settings.auto_lock_minutes==='30'?' selected':''}>30 minut</option>
          <option value="0"${_settings.auto_lock_minutes==='0'?' selected':''}>Nigdy</option>
        </select>
      </div>
      <button class="btn btn-primary" id="ss-autolock-save-btn" style="margin-top:12px">💾 Zapisz</button>
    </div>
    <div class="card" style="margin-top:16px;border:1px solid var(--accent-red)">
      <h3 class="section-title" style="color:var(--accent-red)">⚠️ Strefa niebezpieczna</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
        Przywrócenie ustawień fabrycznych <strong>nieodwracalnie usuwa</strong> wszystkie dane:
        faktury, koszty, klientów, projekty, zadania, czas pracy, notatki i pliki.
        Ustawienia aplikacji i profil firmy zostaną zresetowane do wartości domyślnych.
        Aplikacja uruchomi się ponownie.
      </p>
      <button class="btn btn-danger" id="ss-reset-btn">🔴 Przywróć ustawienia fabryczne</button>
    </div>`;
  }

  // ── Data tab ─────────────────────────────────────────────
  function _tplData() {
    return `<div class="card">
      <h3 class="section-title">📥 Import przychodów z CSV</h3>
      <p class="text-muted" style="margin-bottom:8px;font-size:13px">
        Zaimportuj przychody z innych platform (Upwork, Fiverr, PayPal, Stripe lub dowolny plik CSV).
        Dane pojawią się natychmiast w raportach i statystykach.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">
        <span class="badge badge-info">Upwork</span>
        <span class="badge badge-info">Fiverr</span>
        <span class="badge badge-info">PayPal</span>
        <span class="badge badge-info">Stripe</span>
        <span class="badge badge-info">Generic CSV</span>
      </div>
      <button class="btn btn-primary" id="sd-import-income-btn" style="margin-top:12px">📥 Importuj przychody z CSV</button>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 class="section-title">Eksport danych</h3>
      <p class="text-muted" style="margin-bottom:12px">Eksportuj wszystkie dane aplikacji do pliku JSON (pełny backup).</p>
      <button class="btn btn-primary" id="sd-export-btn">📤 Eksportuj wszystkie dane (JSON)</button>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 class="section-title">Import danych</h3>
      <p class="text-muted" style="margin-bottom:12px">Przywróć dane z poprzednio wyeksportowanego pliku JSON.</p>
      <button class="btn btn-secondary" id="sd-import-btn">📥 Importuj z pliku JSON</button>
    </div>
    <div class="card" style="margin-top:16px;border:1px solid var(--accent-red)">
      <h3 class="section-title" style="color:var(--accent-red)">⚠️ Reset do ustawień fabrycznych</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
        Usuwa <strong>wszystkie dane</strong> i przywraca aplikację do stanu z pierwszego uruchomienia.
        Operacja jest <strong>nieodwracalna</strong> — wykonaj backup przed resetem.
      </p>
      <button class="btn btn-danger" id="sd-reset-btn">🔴 Przywróć ustawienia fabryczne</button>
    </div>`;
  }

  // ── YouTube API tab ───────────────────────────────────────
  async function _tplYouTube() {
    const status = await window.api.youtube.getAuthStatus().catch(() => ({ connected: false, lastSync: null }));
    const clientId = _settings.yt_client_id || '';
    const clientSecret = _settings.yt_client_secret || '';

    const lastSyncStr = status.lastSync
      ? new Date(parseInt(status.lastSync)).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Nigdy';

    const statusBadge = status.connected
      ? `<span style="color:var(--accent-green);font-weight:600">✅ Połączono</span>`
      : `<span style="color:var(--accent-red);font-weight:600">❌ Niepołączono</span>`;

    return `
<div class="card">
  <h3 class="section-title">Konfiguracja Google Cloud Console</h3>
  <div style="background:rgba(88,166,255,0.07);border:1px solid var(--accent-blue);border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:var(--text-secondary);line-height:1.7">
    <strong style="color:var(--accent-blue)">ℹ️ Jak skonfigurować YouTube Analytics API:</strong><br>
    1. Przejdź do <a href="#" id="sy-cloud-link" style="color:var(--accent-blue)">console.cloud.google.com</a> → utwórz nowy projekt<br>
    2. Włącz: <strong>YouTube Analytics API</strong> (APIs &amp; Services → Library)<br>
    3. Utwórz <strong>OAuth 2.0 Client ID</strong> (Credentials → Desktop App)<br>
    4. Dodaj <code style="background:var(--bg-tertiary);padding:1px 5px;border-radius:3px">http://localhost:8085/oauth2callback</code> jako Authorized redirect URI<br>
    5. Skopiuj Client ID i Client Secret poniżej
  </div>
  <div class="form-grid-2">
    <div class="form-group">
      <label>Client ID</label>
      <input type="text" id="sy-client-id" value="${UI.esc(clientId)}" placeholder="123456789-abc...apps.googleusercontent.com">
    </div>
    <div class="form-group">
      <label>Client Secret</label>
      <input type="password" id="sy-client-secret" value="${UI.esc(clientSecret)}" placeholder="GOCSPX-...">
    </div>
  </div>
  <button class="btn btn-primary" id="sy-save-creds-btn">💾 Zapisz dane</button>
</div>

<div class="card" style="margin-top:16px">
  <h3 class="section-title">Połączenie z kontem YouTube</h3>
  <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px">
    <div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Status połączenia</div>
      <div style="font-size:15px">${statusBadge}</div>
    </div>
    <div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Ostatnia synchronizacja</div>
      <div style="font-size:14px;font-weight:500">${lastSyncStr}</div>
    </div>
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <button class="btn btn-primary" id="sy-connect-btn"${status.connected ? ' style="display:none"' : ''}>
      🔗 Połącz konto Google
    </button>
    <button class="btn btn-secondary" id="sy-disconnect-btn"${!status.connected ? ' style="display:none"' : ''}>
      🗑 Rozłącz konto
    </button>
  </div>
  ${status.connected ? `
  <div style="margin-top:16px;padding:10px 14px;background:rgba(63,185,80,0.07);border:1px solid var(--accent-green);border-radius:8px;font-size:12px;color:var(--text-secondary)">
    ✅ Aplikacja jest połączona z YouTube Analytics API. Statystyki będą automatycznie odświeżane przy starcie aplikacji oraz codziennie o 10:00.
  </div>` : `
  <div style="margin-top:16px;padding:10px 14px;background:rgba(248,81,73,0.07);border:1px solid var(--accent-red);border-radius:8px;font-size:12px;color:var(--text-secondary)">
    ❌ Brak połączenia. Wpisz Client ID i Client Secret powyżej, kliknij „Zapisz dane", a następnie „Połącz konto Google".
  </div>`}
</div>`;
  }

  // ── Synchronizacja / Telefon (Supabase) tab ────────────────
  async function _tplSync() {
    const status = await window.api.sync.getStatus().catch(() => ({ configured: false, email: '', lastPush: null, lastPull: null, pendingLocalCount: 0 }));
    const hist = await window.api.sync.getHistory().catch(() => []);

    const fmtTs = (ts) => ts
      ? new Date(parseInt(ts)).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Nigdy';

    const statusBadge = status.configured
      ? `<span style="color:var(--accent-green);font-weight:600">✅ Połączono${status.email ? ' (' + UI.esc(status.email) + ')' : ''}</span>`
      : `<span style="color:var(--accent-red);font-weight:600">❌ Niepołączono</span>`;

    const histHtml = hist.length ? hist.map(h => `
      <div style="display:flex;gap:12px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span>${h.status === 'success' ? '✅' : '❌'}</span>
        <span style="flex:1">${h.direction === 'push' ? '⬆️ Wysłano' : '⬇️ Pobrano'}: ${(h.pushed_count || 0) + (h.pulled_count || 0)} rekordów</span>
        <span style="color:var(--text-muted)">${(h.finished_at || h.started_at || '').slice(0, 16)}</span>
      </div>`).join('') : '<p class="text-muted" style="font-size:12px">Brak historii synchronizacji</p>';

    return `
<div class="card">
  <h3 class="section-title">Konfiguracja Supabase</h3>
  <div style="background:rgba(88,166,255,0.07);border:1px solid var(--accent-blue);border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:var(--text-secondary);line-height:1.7">
    <strong style="color:var(--accent-blue)">ℹ️ Jak podłączyć telefon:</strong><br>
    1. Załóż darmowe konto na <a href="#" id="ss-cloud-link" style="color:var(--accent-blue)">supabase.com</a> i utwórz projekt<br>
    2. Uruchom skrypt SQL ze schematem tabel (Project Settings → SQL Editor)<br>
    3. Utwórz siebie jako użytkownika w Authentication → Users (e-mail + hasło)<br>
    4. Skopiuj Project URL i klucz „anon public" (Project Settings → API) poniżej
  </div>
  <div class="form-grid-2">
    <div class="form-group full">
      <label>Project URL</label>
      <input type="text" id="ss-url" placeholder="https://xxxxx.supabase.co">
    </div>
    <div class="form-group full">
      <label>Klucz „anon public"</label>
      <input type="password" id="ss-anon-key" placeholder="eyJhbGci...">
    </div>
    <div class="form-group">
      <label>E-mail (Twoje konto Supabase Auth)</label>
      <input type="email" id="ss-email" value="${UI.esc(status.email || '')}" placeholder="ty@example.com">
    </div>
    <div class="form-group">
      <label>Hasło</label>
      <input type="password" id="ss-password" placeholder="••••••••">
    </div>
  </div>
  <button class="btn btn-primary" id="ss-save-creds-btn">💾 Zapisz i połącz</button>
</div>

<div class="card" style="margin-top:16px">
  <h3 class="section-title">Status synchronizacji</h3>
  <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-bottom:16px">
    <div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Status połączenia</div>
      <div style="font-size:15px">${statusBadge}</div>
    </div>
    <div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Ostatni push</div>
      <div style="font-size:14px;font-weight:500">${fmtTs(status.lastPush)}</div>
    </div>
    <div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Ostatni pull</div>
      <div style="font-size:14px;font-weight:500">${fmtTs(status.lastPull)}</div>
    </div>
    <div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Oczekujące zmiany</div>
      <div style="font-size:14px;font-weight:500">${status.pendingLocalCount || 0}</div>
    </div>
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <button class="btn btn-primary" id="ss-sync-now-btn"${!status.configured ? ' disabled' : ''}>🔄 Synchronizuj teraz</button>
    <button class="btn btn-secondary" id="ss-push-btn"${!status.configured ? ' disabled' : ''}>⬆️ Wyślij zmiany</button>
    <button class="btn btn-secondary" id="ss-pull-btn"${!status.configured ? ' disabled' : ''}>⬇️ Pobierz zmiany</button>
  </div>
  <div style="margin-top:12px;font-size:11px;color:var(--text-muted)">
    ℹ️ Darmowy projekt Supabase usypia po 7 dniach bez żadnych zapytań — jeśli synchronizacja zawiedzie po dłuższej przerwie,
    zaloguj się na supabase.com i kliknij „Restore" przy swoim projekcie.
  </div>
</div>

<div class="card" style="margin-top:16px">
  <h3 class="section-title">Historia synchronizacji</h3>
  <div>${histHtml}</div>
</div>`;
  }

  // ── Bind tab events ───────────────────────────────────────
  function _bindTabEvents(tab) {
    if (tab === 'profile') {
      document.getElementById('sp-save-btn')?.addEventListener('click', _saveProfile);
      document.getElementById('sp-logo-btn')?.addEventListener('click', async () => {
        const result = await window.api.profile.uploadLogo();
        if (result) { UI.toast('Logo zaktualizowane', 'success'); _profile.logo_path = result; }
      });
    }
    if (tab === 'invoices') {
      document.getElementById('si-save-btn')?.addEventListener('click', _saveInvoices);
    }
    if (tab === 'time') {
      document.getElementById('st-save-btn')?.addEventListener('click', _saveTime);
    }
    if (tab === 'tax') {
      document.getElementById('stax-save-btn')?.addEventListener('click', _saveTax);
    }
    if (tab === 'backup') {
      document.getElementById('sb-choose-btn')?.addEventListener('click', async () => {
        const folder = await window.api.backup.chooseFolder();
        if (folder) document.getElementById('sb-folder').value = folder;
      });
      document.getElementById('sb-save-btn')?.addEventListener('click', _saveBackup);
      document.getElementById('sb-run-btn')?.addEventListener('click', async () => {
        UI.setLoading(true);
        try {
          const r = await window.api.backup.run();
          UI.toast(`Backup gotowy: ${r.filename} (${Math.round(r.size/1024/1024*10)/10} MB)`, 'success');
          await _renderTab('backup');
        } catch (e) { UI.toast('Błąd backupu: ' + e.message, 'error'); }
        finally { UI.setLoading(false); }
      });
      document.getElementById('sb-open-btn')?.addEventListener('click', () => window.api.backup.openFolder());
    }
    if (tab === 'appearance') {
      _initFloatingToggle();
    }
    if (tab === 'security') {
      document.getElementById('ss-change-pin-btn')?.addEventListener('click', _changePin);
      document.getElementById('ss-toggle-pin-btn')?.addEventListener('click', _togglePin);
      document.getElementById('ss-autolock-save-btn')?.addEventListener('click', async () => {
        const val = document.getElementById('ss-autolock').value;
        await window.api.settings.set('auto_lock_minutes', val);
        UI.toast('Ustawienie auto-blokady zapisane', 'success');
      });
      document.getElementById('ss-reset-btn')?.addEventListener('click', _resetData);
    }
    if (tab === 'data') {
      document.getElementById('sd-export-btn')?.addEventListener('click', _exportData);
      document.getElementById('sd-import-btn')?.addEventListener('click', () => UI.toast('Import z JSON — funkcja w przygotowaniu', 'info'));
      document.getElementById('sd-import-income-btn')?.addEventListener('click', _openIncomeImport);
      document.getElementById('sd-reset-btn')?.addEventListener('click', _resetData);
    }
    if (tab === 'youtube') {
      // Open Google Cloud Console link in browser
      document.getElementById('sy-cloud-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.open('https://console.cloud.google.com', '_blank');
      });

      // Save Client ID + Secret
      document.getElementById('sy-save-creds-btn')?.addEventListener('click', async () => {
        const clientId     = document.getElementById('sy-client-id').value.trim();
        const clientSecret = document.getElementById('sy-client-secret').value.trim();
        if (!clientId || !clientSecret) {
          UI.toast('Wpisz Client ID i Client Secret', 'warning');
          return;
        }
        await window.api.settings.set('yt_client_id', clientId);
        await window.api.settings.set('yt_client_secret', clientSecret);
        _settings.yt_client_id = clientId;
        _settings.yt_client_secret = clientSecret;
        UI.toast('Dane API zapisane', 'success');
      });

      // Connect (OAuth flow)
      document.getElementById('sy-connect-btn')?.addEventListener('click', async () => {
        const clientId     = document.getElementById('sy-client-id').value.trim();
        const clientSecret = document.getElementById('sy-client-secret').value.trim();
        if (!clientId || !clientSecret) {
          UI.toast('Najpierw zapisz Client ID i Client Secret', 'warning');
          return;
        }
        const btn = document.getElementById('sy-connect-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Autoryzacja w przeglądarce…'; }
        try {
          const tokens = await window.api.youtube.oauthConnect(clientId, clientSecret);
          await window.api.settings.set('yt_refresh_token', tokens.refresh_token);
          _settings.yt_refresh_token = tokens.refresh_token;
          UI.toast('✅ Połączono z YouTube! Dane zostaną zsynchronizowane w tle.', 'success');
          await _renderTab('youtube');
        } catch (e) {
          UI.toast('Błąd autoryzacji: ' + e.message, 'error');
          if (btn) { btn.disabled = false; btn.textContent = '🔗 Połącz konto Google'; }
        }
      });

      // Disconnect
      document.getElementById('sy-disconnect-btn')?.addEventListener('click', async () => {
        const ok = await UI.confirm('Rozłączyć konto Google? Statystyki w bazie danych pozostaną nienaruszone.');
        if (!ok) return;
        await window.api.youtube.disconnectAuth();
        _settings.yt_refresh_token = '';
        UI.toast('Konto Google rozłączone', 'success');
        await _renderTab('youtube');
      });
    }
    if (tab === 'sync') {
      document.getElementById('ss-cloud-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.open('https://supabase.com', '_blank');
      });

      document.getElementById('ss-save-creds-btn')?.addEventListener('click', async () => {
        const url      = document.getElementById('ss-url').value.trim();
        const anonKey  = document.getElementById('ss-anon-key').value.trim();
        const email    = document.getElementById('ss-email').value.trim();
        const password = document.getElementById('ss-password').value;
        if (!url || !anonKey || !email || !password) {
          UI.toast('Wypełnij wszystkie pola (URL, klucz, e-mail, hasło)', 'warning');
          return;
        }
        const btn = document.getElementById('ss-save-creds-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Łączenie…'; }
        try {
          await window.api.sync.configureCredentials({ url, anonKey, email, password });
          UI.toast('✅ Połączono z Supabase!', 'success');
          await _renderTab('sync');
        } catch (e) {
          UI.toast('Błąd połączenia: ' + e.message, 'error');
          if (btn) { btn.disabled = false; btn.textContent = '💾 Zapisz i połącz'; }
        }
      });

      const runSyncAction = async (btnId, fn, label) => {
        const btn = document.getElementById(btnId);
        const originalText = btn?.textContent;
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Synchronizuję…'; }
        try {
          const result = await fn();
          UI.toast(`✅ ${label} zakończone`, 'success');
          await _renderTab('sync');
        } catch (e) {
          UI.toast(`Błąd synchronizacji: ${e.message}`, 'error');
          if (btn) { btn.disabled = false; btn.textContent = originalText; }
        }
      };

      document.getElementById('ss-sync-now-btn')?.addEventListener('click', () =>
        runSyncAction('ss-sync-now-btn', () => window.api.sync.runFull(), 'Synchronizowanie')
      );
      document.getElementById('ss-push-btn')?.addEventListener('click', () =>
        runSyncAction('ss-push-btn', () => window.api.sync.pushLocalChanges(), 'Wysyłanie')
      );
      document.getElementById('ss-pull-btn')?.addEventListener('click', () =>
        runSyncAction('ss-pull-btn', () => window.api.sync.pullCloudChanges(), 'Pobieranie')
      );
    }
  }

  // ── Save handlers ─────────────────────────────────────────
  async function _saveProfile() {
    try {
      await window.api.profile.save({
        name:       document.getElementById('sp-name').value.trim(),
        address:    document.getElementById('sp-address').value.trim(),
        postcode:   document.getElementById('sp-postcode').value.trim(),
        city:       document.getElementById('sp-city').value.trim(),
        country:    document.getElementById('sp-country').value.trim(),
        kvk_number: document.getElementById('sp-kvk').value.trim(),
        btw_number: document.getElementById('sp-btw').value.trim(),
        iban:       document.getElementById('sp-iban').value.trim(),
        email:      document.getElementById('sp-email').value.trim(),
        phone:      document.getElementById('sp-phone').value.trim()
      });
      UI.toast('Dane firmy zapisane', 'success');
      _profile = await window.api.profile.get();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function _saveInvoices() {
    try {
      await window.api.profile.save({
        default_payment_days: +document.getElementById('si-days').value,
        default_currency:     document.getElementById('si-currency').value,
        default_btw_rate:     +document.getElementById('si-btw').value,
        invoice_footer:       document.getElementById('si-footer').value.trim()
      });
      UI.toast('Ustawienia faktur zapisane', 'success');
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function _saveTime() {
    try {
      const sets = [
        ['time_idle_minutes',   document.getElementById('st-idle').value],
        ['pomodoro_work_minutes',document.getElementById('st-pomo').value],
        ['pomodoro_break_short', document.getElementById('st-break-short').value],
        ['pomodoro_break_long',  document.getElementById('st-break-long').value],
        ['pomodoro_sound', document.getElementById('st-sound-on').classList.contains('btn-primary') ? 'true' : 'false']
      ];
      for (const [k,v] of sets) await window.api.settings.set(k, v);
      await window.api.profile.save({ default_hourly_rate: +document.getElementById('st-rate').value });
      UI.toast('Ustawienia czasu zapisane', 'success');
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function _saveTax() {
    try {
      const year = new Date().getFullYear();
      await window.api.tax.saveRates(year, {
        bracket1_limit:       +document.getElementById('stax-bracket1').value,
        rate1:                +document.getElementById('stax-rate1').value,
        rate2:                +document.getElementById('stax-rate2').value,
        zelfstandigenaftrek:  +document.getElementById('stax-za').value,
        startersaftrek:       +document.getElementById('stax-sa').value,
        mkb_vrijstelling:     +document.getElementById('stax-mkb').value,
        heffingskorting_max:  +document.getElementById('stax-hk').value,
        arbeidskorting_max:   +document.getElementById('stax-ak').value
      });
      UI.toast('Stawki podatkowe zapisane', 'success');
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function _saveBackup() {
    try {
      await window.api.backup.saveSettings({
        folder:    document.getElementById('sb-folder').value,
        auto:      document.getElementById('sb-auto-on').classList.contains('btn-primary'),
        frequency: document.getElementById('sb-freq').value,
        time:      document.getElementById('sb-time').value,
        keep:      +document.getElementById('sb-keep').value
      });
      UI.toast('Ustawienia backupu zapisane', 'success');
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function _changePin() {
    const oldPin  = document.getElementById('ss-old-pin').value;
    const newPin  = document.getElementById('ss-new-pin').value;
    const newPin2 = document.getElementById('ss-new-pin2').value;
    if (!/^\d{4,8}$/.test(newPin)) { UI.toast('Nowy PIN musi mieć 4–8 cyfr', 'error'); return; }
    if (newPin !== newPin2) { UI.toast('Nowe PINy nie są identyczne', 'error'); return; }
    try {
      await window.api.auth.changePin(oldPin, newPin);
      UI.toast('PIN zmieniony pomyślnie', 'success');
      ['ss-old-pin','ss-new-pin','ss-new-pin2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function _togglePin() {
    const pinEnabled = _settings.pin_enabled !== 'false';
    if (pinEnabled) {
      const pin = await UI.prompt('Wprowadź aktualny PIN, aby wyłączyć ochronę:', 'Weryfikacja PIN', { password: true, numeric: true });
      if (!pin) return;
      const r = await window.api.auth.verify(pin);
      if (!r.success) { UI.toast('Nieprawidłowy PIN', 'error'); return; }
      await window.api.settings.set('pin_enabled', 'false');
      _settings.pin_enabled = 'false';
      UI.toast('Ochrona PIN wyłączona', 'success');
    } else {
      const newPin  = document.getElementById('ss-new-pin').value;
      const newPin2 = document.getElementById('ss-new-pin2').value;
      if (!/^\d{4,8}$/.test(newPin)) { UI.toast('Wpisz nowy PIN (4–8 cyfr) w polach powyżej', 'warning'); return; }
      if (newPin !== newPin2) { UI.toast('PINy nie są identyczne', 'warning'); return; }
      await window.api.auth.setup(newPin);
      await window.api.settings.set('pin_enabled', 'true');
      _settings.pin_enabled = 'true';
      UI.toast('Ochrona PIN włączona', 'success');
    }
    await _renderTab('security');
  }

  async function _resetData() {
    // Step 1: first confirmation
    const ok1 = await UI.confirm(
      '⚠️ PRZYWRÓCENIE USTAWIEŃ FABRYCZNYCH\n\n' +
      'Ta operacja nieodwracalnie usunie WSZYSTKIE dane:\n' +
      '• Faktury i pozycje faktur\n' +
      '• Koszty i paragony\n' +
      '• Klientów i projekty\n' +
      '• Zadania, notatki, czas pracy\n' +
      '• Przychody i statystyki YouTube\n' +
      '• Profil firmy i ustawienia\n\n' +
      'Aplikacja uruchomi się ponownie. Czy chcesz kontynuować?'
    );
    if (!ok1) return;

    // Step 2: type RESET to confirm
    const confirm2 = await UI.prompt('Wpisz "RESET" (wielkimi literami), aby potwierdzić:', 'Potwierdź reset');
    if (confirm2 !== 'RESET') {
      UI.toast('Reset anulowany — wpisany tekst był niepoprawny', 'info');
      return;
    }

    // Step 3: PIN verification (only if PIN is enabled)
    const pinEnabled = _settings.pin_enabled !== 'false';
    if (pinEnabled) {
      const pin = await UI.prompt('Wprowadź PIN, aby potwierdzić:', 'Weryfikacja PIN', { password: true, numeric: true });
      if (!pin) return;
      const r = await window.api.auth.verify(pin);
      if (!r.success) { UI.toast('Nieprawidłowy PIN — reset anulowany', 'error'); return; }
    }

    // Execute reset — button may live on either the Security or Data tab
    const btn = document.getElementById('ss-reset-btn') || document.getElementById('sd-reset-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Resetowanie…'; }
    try {
      await window.api.settings.factoryReset();
      // App will relaunch automatically — show interim message
      UI.toast('✅ Reset wykonany — aplikacja uruchamia się ponownie…', 'success', 10000);
    } catch (e) {
      UI.toast('Błąd resetu: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🔴 Przywróć ustawienia fabryczne'; }
    }
  }

  async function _applyLang(lang) {
    await window.api.settings.set('language', lang);
    _settings.language = lang;
    if (window.i18n) window.i18n.setLanguage(lang);
    const names = { pl: 'Polski', en: 'English', nl: 'Nederlands' };
    UI.toast(`Język zmieniony na: ${names[lang] || lang}`, 'success');
    await _renderTab('appearance');
  }

  // ── Income CSV Import wizard ──────────────────────────────
  let _csvFilePath = null;
  let _csvAnalysis = null;

  async function _openIncomeImport() {
    _csvFilePath = null;
    _csvAnalysis = null;
    UI.openModal('📥 Import przychodów z CSV', _tplImportStep1(), {
      size: 'lg',
      footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
               <button class="btn btn-primary" id="imp-pick-btn">📂 Wybierz plik CSV →</button>`
    });
    document.getElementById('imp-pick-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('imp-pick-btn');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Analizuję...'; }
      try {
        const result = await window.api.income.analyzeCSV();
        if (!result) {
          if (btn) { btn.disabled = false; btn.textContent = '📂 Wybierz plik CSV →'; }
          return;
        }
        _csvFilePath = result.filePath;
        _csvAnalysis = result;
        _renderImportStep2();
      } catch(e) {
        UI.toast('Błąd analizy pliku: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '📂 Wybierz plik CSV →'; }
      }
    });
  }

  function _tplImportStep1() {
    return `
    <div style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:16px">📂</div>
      <h3 style="margin-bottom:8px">Wybierz plik CSV</h3>
      <p style="color:var(--text-secondary);font-size:13px;max-width:400px;margin:0 auto 20px">
        Program automatycznie rozpozna format pliku z platform takich jak
        <strong>Upwork, Fiverr, PayPal, Stripe</strong> lub dowolny CSV.
      </p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:16px">
        ${['Upwork','Fiverr','PayPal','Stripe','Generic CSV'].map(p => `<span class="badge badge-info">${p}</span>`).join('')}
      </div>
      <p style="font-size:11px;color:var(--text-muted)">
        Po wybraniu pliku zostaniesz poproszony o potwierdzenie mapowania kolumn.
      </p>
    </div>`;
  }

  function _renderImportStep2() {
    if (!_csvAnalysis) return;
    const a = _csvAnalysis;
    const platformIcons = { upwork:'🟢', fiverr:'🟢', paypal:'🔵', stripe:'🟣', generic:'⚪' };
    const platformNames = { upwork:'Upwork', fiverr:'Fiverr', paypal:'PayPal', stripe:'Stripe', generic:'Ogólny CSV' };
    const icon = platformIcons[a.platform] || '⚪';
    const name = platformNames[a.platform] || a.platform;

    // Build column select options
    const colOptions = (selected) => {
      let opts = '<option value="-1">— nie mapuj —</option>';
      a.headers.forEach((h, i) => {
        opts += `<option value="${i}"${selected===i?' selected':''}>${UI.esc(h)} (kol. ${i+1})</option>`;
      });
      return opts;
    };

    // Preview table
    const previewHtml = `<table class="import-preview-table">
      <thead><tr>${a.headers.map(h => `<th>${UI.esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${(a.sampleRows||[]).slice(0,3).map(row =>
        `<tr>${a.headers.map((_,i) => `<td>${UI.esc(row[i]||'')}</td>`).join('')}</tr>`
      ).join('')}</tbody>
    </table>`;

    const bodyHtml = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <span class="platform-badge">${icon} Wykryto: ${UI.esc(name)}</span>
      <span style="font-size:12px;color:var(--text-muted)">${a.totalRows} wierszy danych</span>
    </div>

    <div class="form-grid-2" style="margin-bottom:16px">
      <div class="form-group">
        <label>Kolumna daty *</label>
        <select id="imp-date-col" class="filter-select" style="width:100%">${colOptions(a.dateCol)}</select>
      </div>
      <div class="form-group">
        <label>Kolumna kwoty *</label>
        <select id="imp-amount-col" class="filter-select" style="width:100%">${colOptions(a.amountCol)}</select>
      </div>
      <div class="form-group">
        <label>Kolumna opisu</label>
        <select id="imp-desc-col" class="filter-select" style="width:100%">${colOptions(a.descCol)}</select>
      </div>
      <div class="form-group">
        <label>Kolumna waluty</label>
        <select id="imp-currency-col" class="filter-select" style="width:100%">${colOptions(a.currencyCol)}</select>
      </div>
      <div class="form-group">
        <label>Domyślna waluta (gdy brak kolumny)</label>
        <select id="imp-def-currency" class="filter-select" style="width:100%">
          ${['EUR','USD','GBP','PLN'].map(c=>`<option${c==='EUR'?' selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Źródło (nazwa w raportach)</label>
        <input type="text" id="imp-source" value="${UI.esc(name)}" placeholder="np. Upwork">
      </div>
    </div>

    <details style="margin-bottom:8px">
      <summary style="cursor:pointer;font-size:12px;color:var(--text-secondary);margin-bottom:6px">
        👁 Podgląd pierwszych wierszy
      </summary>
      <div style="overflow-x:auto;max-height:160px;overflow-y:auto">${previewHtml}</div>
    </details>`;

    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
      <button class="btn btn-primary" id="imp-confirm-btn">✅ Importuj</button>`;
    document.getElementById('modal-footer').classList.remove('hidden');

    document.getElementById('imp-confirm-btn')?.addEventListener('click', _doImport);
  }

  async function _doImport() {
    if (!_csvAnalysis) return;

    const dateCol    = parseInt(document.getElementById('imp-date-col').value);
    const amountCol  = parseInt(document.getElementById('imp-amount-col').value);
    const descCol    = parseInt(document.getElementById('imp-desc-col').value);
    const currencyCol= parseInt(document.getElementById('imp-currency-col').value);
    const defCurrency= document.getElementById('imp-def-currency').value;
    const source     = document.getElementById('imp-source').value.trim() || _csvAnalysis.platform;

    if (dateCol < 0)   { UI.toast('Wybierz kolumnę daty', 'error'); return; }
    if (amountCol < 0) { UI.toast('Wybierz kolumnę kwoty', 'error'); return; }

    const btn = document.getElementById('imp-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Importuję...'; }

    try {
      const result = await window.api.income.importCSV(_csvFilePath, {
        dateCol, amountCol, descCol, currencyCol,
        defaultCurrency: defCurrency,
        source,
        skipNegative: true
      });
      UI.closeModal();
      UI.toast(`✅ Zaimportowano ${result.imported} wpisów (pominięto: ${result.skipped})`, 'success', 6000);
    } catch(e) {
      UI.toast('Błąd importu: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Importuj'; }
    }
  }

  async function _exportData() {
    try {
      const [profile, allSettings] = await Promise.all([
        window.api.profile.get(),
        window.api.settings.getAll()
      ]);
      const blob = new Blob([JSON.stringify({ profile, settings: allSettings, exportDate: new Date().toISOString() }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zzp-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('Dane wyeksportowane', 'success');
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  // expose for onclick
  window.PageSettings = window.PageSettings || {};
  Object.assign(window.PageSettings, { _applyTheme, _setAutoBackup, _applyLang });

  return { load, _applyTheme, _setAutoBackup, _applyLang };
})();

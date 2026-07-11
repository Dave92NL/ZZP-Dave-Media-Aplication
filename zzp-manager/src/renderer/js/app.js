/* ZZP Manager — SPA Router & App Controller */
'use strict';

const App = (() => {
  // ── State ───────────────────────────────────────────────
  let currentPage = 'dashboard';
  let lockTimer = null;
  let globalTimerInterval = null;
  let globalTimerStart = null;
  let globalTimerLabel = '';
  let failedPinAttempts = 0;
  let pinCooldownEnd = 0;
  let pinProtectionEnabled = true; // cached during init

  const AUTO_LOCK_MINUTES = 15;
  const PIN_COOLDOWN_SECONDS = 30;
  const MAX_PIN_ATTEMPTS = 3;

  // ── Bootstrap ───────────────────────────────────────────
  async function init() {
    // Apply saved theme
    const allSettings = await window.api.settings.getAll();
    const theme = allSettings.theme || 'dark';
    document.documentElement.dataset.theme = theme;

    // Apply language
    if (window.i18n) {
      const lang = allSettings.language || 'pl';
      window.i18n.setLanguage(lang);
    }

    const onboardingDone = allSettings.onboarding_complete === 'true';
    pinProtectionEnabled = allSettings.pin_enabled !== 'false'; // default: true, cache globally
    const isSetup = await window.api.auth.isSetup();

    if (!onboardingDone) {
      // First run: show wizard
      showOnboarding();
    } else if (isSetup && pinProtectionEnabled) {
      // PIN configured: require unlock
      showLockScreen();
    } else {
      // Onboarding done, PIN intentionally skipped
      enterApp();
    }

    // Register tray push events
    window.api.on('tray:toggle-timer', () => toggleGlobalTimer());
    window.api.on('tray:quick-expense', () => { navigate('expenses'); UI.openModal('Szybki koszt', quickExpenseHTML()); });
    window.api.on('tray:quick-task', () => { navigate('tasks'); UI.openModal('Szybkie zadanie', quickTaskHTML()); });

    // Auto-synchronizacja: gdy pull przyniósł zmiany z drugiego urządzenia
    // (np. usunięcie faktury/kosztu na telefonie), odśwież bieżący widok listy.
    // Nie odświeżamy, gdy otwarty jest modal (nie przerywamy edycji).
    const AUTO_REFRESH_PAGES = new Set(['dashboard', 'invoices', 'expenses', 'projects', 'contacts', 'time', 'mileage', 'reports']);
    window.api.on('sync:autoSynced', (info) => {
      if (!info || !info.changed) return;
      const overlay = document.getElementById('modal-overlay');
      if (overlay && !overlay.classList.contains('hidden')) return;
      if (AUTO_REFRESH_PAGES.has(currentPage)) navigate(currentPage);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);

    // Reset idle timer on user activity
    ['mousemove', 'keydown', 'click', 'scroll'].forEach(e =>
      document.addEventListener(e, resetLockTimer, { passive: true })
    );
  }

  // ── Lock / PIN ───────────────────────────────────────────
  function showLockScreen() {
    document.getElementById('lock-screen').classList.remove('hidden');
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');
    resetPinDots();
    document.getElementById('lock-error').classList.add('hidden');
    document.getElementById('lock-cooldown').classList.add('hidden');
  }

  function hideLockScreen() {
    document.getElementById('lock-screen').classList.add('hidden');
    enterApp();
  }

  function enterApp() {
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    startLockTimer();
    navigate(currentPage);
  }

  function lock() {
    if (!pinProtectionEnabled) return; // PIN disabled — nothing to lock

    clearLockTimer();
    currentPinInput = '';
    resetPinDots();
    showLockScreen();
    document.getElementById('app').classList.add('hidden');
  }

  let currentPinInput = '';

  function resetPinDots() {
    currentPinInput = '';
    updatePinDots();
  }

  function updatePinDots() {
    const dotsEl = document.getElementById('pin-dots');
    const len = currentPinInput.length;
    const maxDots = Math.max(4, len);
    let html = '';
    for (let i = 0; i < maxDots; i++) {
      html += `<span class="${i < len ? 'filled' : ''}"></span>`;
    }
    dotsEl.innerHTML = html;
  }

  // Pin pad click handler (bound in HTML via data attributes)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pin-btn');
    if (!btn) return;

    if (Date.now() < pinCooldownEnd) return;

    const digit = btn.dataset.digit;
    const action = btn.dataset.action;

    if (digit !== undefined) {
      if (currentPinInput.length < 8) {
        currentPinInput += digit;
        updatePinDots();
        if (currentPinInput.length >= 4) {
          // Auto-submit at 4 digits if no more input after brief delay
        }
      }
    } else if (action === 'clear') {
      currentPinInput = currentPinInput.slice(0, -1);
      updatePinDots();
    } else if (action === 'submit') {
      submitPin();
    }
  });

  document.addEventListener('keydown', (e) => {
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen.classList.contains('hidden')) return;

    if (Date.now() < pinCooldownEnd) return;

    if (e.key >= '0' && e.key <= '9') {
      if (currentPinInput.length < 8) {
        currentPinInput += e.key;
        updatePinDots();
      }
    } else if (e.key === 'Backspace') {
      currentPinInput = currentPinInput.slice(0, -1);
      updatePinDots();
    } else if (e.key === 'Enter') {
      submitPin();
    }
  });

  async function submitPin() {
    if (currentPinInput.length < 4) {
      showLockError('PIN musi mieć minimum 4 cyfry.');
      return;
    }

    const result = await window.api.auth.verify(currentPinInput);
    if (result.success) {
      failedPinAttempts = 0;
      hideLockScreen();
      navigate(currentPage);
    } else {
      failedPinAttempts++;
      currentPinInput = '';
      updatePinDots();

      if (failedPinAttempts >= MAX_PIN_ATTEMPTS) {
        failedPinAttempts = 0;
        pinCooldownEnd = Date.now() + PIN_COOLDOWN_SECONDS * 1000;
        startPinCooldown();
      } else {
        showLockError(`Nieprawidłowy PIN. Pozostało prób: ${MAX_PIN_ATTEMPTS - failedPinAttempts}`);
      }
    }
  }

  function showLockError(msg) {
    const el = document.getElementById('lock-error');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }

  function startPinCooldown() {
    const el = document.getElementById('lock-cooldown');
    el.classList.remove('hidden');
    document.getElementById('lock-error').classList.add('hidden');

    const interval = setInterval(() => {
      const remaining = Math.ceil((pinCooldownEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(interval);
        el.classList.add('hidden');
      } else {
        el.textContent = `Zbyt wiele błędnych prób. Odczekaj ${remaining}s.`;
      }
    }, 200);
  }

  function showForgotPin() {
    UI.openModal('Zapomniałem PIN', `
      <p style="margin-bottom:16px">Jeśli zapomniałeś PIN, możesz go zresetować kluczem odzyskiwania.</p>
      <p style="margin-bottom:16px">Klucz odzyskiwania został zapisany w pliku <code>recovery.key</code> w folderze danych aplikacji podczas konfiguracji.</p>
      <div class="form-group">
        <label>Klucz odzyskiwania</label>
        <input type="text" id="recovery-key-input" placeholder="Wklej klucz odzyskiwania...">
      </div>
      <div id="recovery-error" class="error-msg hidden"></div>
    `, {
      footer: `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
        <button class="btn btn-danger" onclick="App.doResetPin()">Zresetuj PIN</button>
      `
    });
  }

  async function doResetPin() {
    const key = document.getElementById('recovery-key-input')?.value?.trim();
    if (!key) return;
    try {
      await window.api.auth.resetPin(key);
      UI.closeModal();
      UI.toast('PIN zresetowany. Skonfiguruj nowy PIN.', 'success');
      showOnboarding(3);
    } catch (err) {
      const el = document.getElementById('recovery-error');
      if (el) { el.textContent = err.message; el.classList.remove('hidden'); }
    }
  }

  // ── Auto-lock timer ──────────────────────────────────────
  function startLockTimer() {
    clearLockTimer();
    lockTimer = setTimeout(lock, AUTO_LOCK_MINUTES * 60 * 1000);
  }

  function clearLockTimer() {
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
  }

  function resetLockTimer() {
    if (!document.getElementById('app').classList.contains('hidden')) {
      startLockTimer();
    }
  }

  // ── Onboarding wizard ────────────────────────────────────
  let obCurrentStep = 1;

  function showOnboarding(startStep = 1) {
    obCurrentStep = startStep;
    document.getElementById('onboarding').classList.remove('hidden');
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');
    renderObStep();
  }

  function renderObStep() {
    for (let i = 1; i <= 3; i++) {
      document.getElementById(`ob-step-${i}`).classList.toggle('hidden', i !== obCurrentStep);
    }
    document.getElementById('ob-step-num').textContent = obCurrentStep;
    document.getElementById('ob-progress-bar').style.width = `${(obCurrentStep / 3) * 100}%`;
    document.getElementById('ob-back-btn').disabled = obCurrentStep === 1;
    document.getElementById('ob-next-btn').textContent = obCurrentStep === 3 ? 'Ustaw PIN i zakończ ✓' : 'Dalej →';

    // Show/hide "skip PIN" button only on step 3
    const skipBtn = document.getElementById('ob-skip-pin-btn');
    if (skipBtn) skipBtn.classList.toggle('hidden', obCurrentStep !== 3);
  }

  async function obNext() {
    if (obCurrentStep === 1) {
      const name = document.getElementById('ob-name').value.trim();
      if (!name) { UI.toast('Imię i nazwisko jest wymagane.', 'warning'); return; }
    }

    if (obCurrentStep === 2) {
      // Save profile + invoice settings
      await window.api.profile.save({
        name: document.getElementById('ob-name').value.trim(),
        address: document.getElementById('ob-address').value.trim(),
        postcode: document.getElementById('ob-postcode').value.trim(),
        city: document.getElementById('ob-city').value.trim(),
        kvk_number: document.getElementById('ob-kvk').value.trim(),
        btw_number: document.getElementById('ob-btw').value.trim(),
        iban: document.getElementById('ob-iban').value.trim(),
        email: document.getElementById('ob-email').value.trim(),
        phone: document.getElementById('ob-phone').value.trim(),
        invoice_prefix: document.getElementById('ob-prefix').value.trim() || 'FV',
        invoice_next_number: parseInt(document.getElementById('ob-start-num').value) || 1,
        default_payment_days: parseInt(document.getElementById('ob-payment-days').value) || 30,
        default_hourly_rate: parseFloat(document.getElementById('ob-hourly-rate').value) || 0,
        invoice_footer: document.getElementById('ob-footer').value.trim()
      });
    }

    if (obCurrentStep === 3) {
      const pin = document.getElementById('ob-pin').value;
      const confirm = document.getElementById('ob-pin-confirm').value;
      const errEl = document.getElementById('ob-pin-error');

      if (!/^\d{4,8}$/.test(pin)) {
        errEl.textContent = 'PIN musi mieć 4–8 cyfr.'; errEl.classList.remove('hidden'); return;
      }
      if (pin !== confirm) {
        errEl.textContent = 'PINy nie są identyczne.'; errEl.classList.remove('hidden'); return;
      }

      try {
        await window.api.auth.setup(pin);
        await window.api.settings.set('onboarding_complete', 'true');
        await window.api.settings.set('pin_enabled', 'true');
        pinProtectionEnabled = true;
        UI.toast('Konfiguracja zakończona! Witaj w ZZP Manager.', 'success');
        enterApp();
      } catch (err) {
        errEl.textContent = err.message; errEl.classList.remove('hidden');
      }
      return;
    }

    obCurrentStep++;
    renderObStep();
  }

  async function obSkipPin() {
    // Mark onboarding complete with PIN disabled
    await window.api.settings.set('onboarding_complete', 'true');
    await window.api.settings.set('pin_enabled', 'false');
    pinProtectionEnabled = false;
    document.getElementById('onboarding').classList.add('hidden');
    UI.toast('Konfiguracja zakończona! PIN wyłączony.', 'success');
    enterApp();
  }

  function obBack() {
    if (obCurrentStep > 1) { obCurrentStep--; renderObStep(); }
  }

  // ── SPA Router ───────────────────────────────────────────
  const pageLoaders = {
    dashboard: loadDashboard,
    time: loadTimePage,
    invoices: loadInvoicesPage,
    expenses: loadExpensesPage,
    mileage: loadMileagePage,
    reports: loadReportsPage,
    projects: loadProjectsPage,
    contacts: loadContactsPage,
    tasks: loadTasksPage,
    notes: loadNotesPage,
    youtube: loadYoutubePage,
    reminders: loadRemindersPage,
    calendar: loadCalendarPage,
    settings: loadSettingsPage,
  };

  function navigate(page) {
    if (!pageLoaders[page]) page = 'dashboard';

    // Unload pages that hold active resources when navigating away
    if (currentPage === 'time' && page !== 'time' && window.PageTime?.unload) {
      PageTime.unload();
    }
    if (currentPage === 'reports' && page !== 'reports' && window.PageReports?.unload) {
      PageReports.unload();
    }
    if (currentPage === 'notes' && page !== 'notes' && window.PageNotes?.unload) {
      PageNotes.unload();
    }

    currentPage = page;

    // Update sidebar active state
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // Load page content
    pageLoaders[page]();
  }

  // Handle sidebar clicks
  document.addEventListener('click', (e) => {
    const navItem = e.target.closest('.nav-item[data-page]');
    if (!navItem) return;
    e.preventDefault();
    navigate(navItem.dataset.page);
  });

  // Handle hash changes
  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '');
    if (hash && pageLoaders[hash]) navigate(hash);
  });

  // Sidebar toggle
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  // ── Global timer ─────────────────────────────────────────
  function toggleGlobalTimer() {
    if (globalTimerInterval) stopGlobalTimer();
    else startGlobalTimer('Praca ogólna');
  }

  function startGlobalTimer(label = 'Praca') {
    if (globalTimerInterval) return;
    globalTimerStart = Date.now();
    globalTimerLabel = label;
    document.getElementById('timer-bar').classList.remove('hidden');
    document.getElementById('timer-bar-label').textContent = label;

    globalTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - globalTimerStart) / 1000);
      const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      document.getElementById('timer-bar-time').textContent = `${h}:${m}:${s}`;
    }, 1000);
  }

  async function stopGlobalTimer() {
    if (!globalTimerInterval) return;
    clearInterval(globalTimerInterval);
    globalTimerInterval = null;
    document.getElementById('timer-bar').classList.add('hidden');

    const durationMinutes = Math.round((Date.now() - globalTimerStart) / 60000);
    const today = new Date().toISOString().split('T')[0];

    if (durationMinutes > 0) {
      try {
        await window.api.time.create({
          category: 'Inne',
          description: globalTimerLabel,
          date: today,
          duration_minutes: durationMinutes,
          is_billable: 1
        });
        UI.toast(`Czas zapisany: ${durationMinutes} min`, 'success');
      } catch (err) {
        UI.toast('Błąd zapisu czasu: ' + err.message, 'error');
      }
    }
  }

  // ── Global keyboard shortcuts ────────────────────────────
  function handleGlobalKeydown(e) {
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); lock(); }
    if (e.ctrlKey && e.key === 'd') { e.preventDefault(); navigate('dashboard'); }
    if (e.ctrlKey && e.key === 'i') { e.preventDefault(); navigate('invoices'); }
    if (e.key === 'Escape') { UI.closeModal(); }
  }

  // ── Page loaders (stub views for Phase 1) ────────────────
  function setPageContent(html) {
    document.getElementById('page-content').innerHTML = html;
  }

  function loadDashboard() {
    PageDashboard.load();
  }

  function loadTimePage() {
    PageTime.load();
  }

  function loadInvoicesPage() {
    PageInvoices.load();
  }

  function loadExpensesPage() {
    PageExpenses.load();
  }

  function loadMileagePage() {
    PageMileage.load();
  }

  function loadReportsPage() {
    PageReports.load();
  }

  function loadProjectsPage() {
    PageProjects.load();
  }

  function loadContactsPage() {
    PageContacts.load();
  }

  function loadTasksPage() {
    PageTasks.load();
  }

  function loadNotesPage() {
    PageNotes.load();
  }

  function loadYoutubePage() {
    if (currentPage === 'youtube' && window.PageYoutube?.unload) PageYoutube.unload();
    PageYoutube.load();
  }

  function loadRemindersPage() {
    PageReminders.load();
  }

  function loadCalendarPage() {
    PageCalendar.load();
  }

  function loadSettingsPage() {
    PageSettings.load();
  }

  async function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    await window.api.settings.set('theme', theme);
    loadSettingsPage();
  }

  async function saveProfileSettings() {
    try {
      await window.api.profile.save({
        name: document.getElementById('s-name').value.trim(),
        kvk_number: document.getElementById('s-kvk').value.trim(),
        btw_number: document.getElementById('s-btw').value.trim(),
        iban: document.getElementById('s-iban').value.trim(),
        email: document.getElementById('s-email').value.trim(),
        phone: document.getElementById('s-phone').value.trim(),
        address: document.getElementById('s-address').value.trim(),
        postcode: document.getElementById('s-postcode').value.trim(),
        city: document.getElementById('s-city').value.trim(),
      });
      UI.toast('Dane firmy zapisane.', 'success');
    } catch (err) {
      UI.toast('Błąd zapisu: ' + err.message, 'error');
    }
  }

  async function togglePinProtection() {
    // Disable PIN protection (requires confirming current PIN first)
    const pin = await UI.prompt('Wprowadź aktualny PIN, aby wyłączyć ochronę:', 'Weryfikacja PIN', { password: true, numeric: true });
    if (pin === null) return;
    const result = await window.api.auth.verify(pin);
    if (!result.success) { UI.toast('Nieprawidłowy PIN.', 'error'); return; }

    await window.api.settings.set('pin_enabled', 'false');
    pinProtectionEnabled = false;
    UI.toast('Ochrona PIN wyłączona.', 'success');
    loadSettingsPage();
  }

  async function enablePin() {
    const newPin = document.getElementById('s-new-pin')?.value;
    const newPin2 = document.getElementById('s-new-pin2')?.value;
    if (!/^\d{4,8}$/.test(newPin)) { UI.toast('PIN musi mieć 4–8 cyfr.', 'warning'); return; }
    if (newPin !== newPin2) { UI.toast('PINy nie są identyczne.', 'warning'); return; }
    try {
      await window.api.auth.setup(newPin);
      await window.api.settings.set('pin_enabled', 'true');
      pinProtectionEnabled = true;
      UI.toast('Ochrona PIN włączona.', 'success');
      loadSettingsPage();
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  async function changePin() {
    const oldPin = document.getElementById('s-old-pin').value;
    const newPin = document.getElementById('s-new-pin').value;
    const newPin2 = document.getElementById('s-new-pin2').value;

    if (newPin !== newPin2) { UI.toast('Nowe PINy nie są identyczne.', 'warning'); return; }
    if (!/^\d{4,8}$/.test(newPin)) { UI.toast('PIN musi mieć 4–8 cyfr.', 'warning'); return; }

    try {
      await window.api.auth.changePin(oldPin, newPin);
      UI.toast('PIN zmieniony pomyślnie.', 'success');
      document.getElementById('s-old-pin').value = '';
      document.getElementById('s-new-pin').value = '';
      document.getElementById('s-new-pin2').value = '';
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  async function runBackup() {
    try {
      const result = await window.api.backup.run();
      if (result?.success) UI.toast('Backup wykonany: ' + result.filename, 'success');
      else UI.toast('Błąd backupu.', 'error');
    } catch (err) {
      UI.toast('Błąd backupu: ' + err.message, 'error');
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  function fmtEur(amount) {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount || 0);
  }

  function escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function quickExpenseHTML() {
    return `<div class="form-group"><label>Opis</label><input type="text" id="qe-desc" placeholder="Zakup sprzętu..."></div>
      <div class="form-grid-2"><div class="form-group"><label>Kwota (€)</label><input type="number" id="qe-amount" step="0.01" placeholder="0.00"></div>
      <div class="form-group"><label>Data</label><input type="date" id="qe-date" value="${new Date().toISOString().split('T')[0]}"></div></div>`;
  }

  function quickTaskHTML() {
    return `<div class="form-group"><label>Tytuł zadania</label><input type="text" id="qt-title" placeholder="Zadanie..."></div>
      <div class="form-group"><label>Termin</label><input type="date" id="qt-date" value="${new Date().toISOString().split('T')[0]}"></div>`;
  }

  // ── Public API ───────────────────────────────────────────
  return {
    init,
    lock,
    navigate,
    showForgotPin,
    doResetPin,
    obNext,
    obBack,
    obSkipPin,
    togglePinProtection,
    enablePin,
    setTheme,
    saveProfileSettings,
    changePin,
    runBackup,
    startGlobalTimer,
    stopGlobalTimer,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());

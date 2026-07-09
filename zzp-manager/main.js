'use strict';

const { app, BrowserWindow, ipcMain, session, Tray, Menu, Notification, dialog, shell, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;
let floatingWindow = null;
let isQuitting = false;

const FLOATING_WIDGET_SIZE = 64;

// Import modules (loaded after app ready)
let db, auth, invoices, timeTracking, expenses, taxCalc, reports, projects, contacts, tasks, notes, youtube, youtubeApi, notifications, backup, exportModule, settings, incomeImport, efakturaImport, googleCalendar, cloudSync, products, mileage, hoursImport;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: true,
    show: false,
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // sandbox:true breaks better-sqlite3 in some configs; we rely on contextIsolation
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Block navigation away from local files
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  // Block new windows / popups
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com data:; " +
          "img-src 'self' data: blob:; " +
          "connect-src 'none'"
        ]
      }
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (process.platform !== 'darwin') {
        showTrayBalloon();
      }
    }
  });
}

function showTrayBalloon() {
  if (tray && process.platform === 'win32') {
    tray.displayBalloon({
      iconType: 'info',
      title: 'ZZP Manager',
      content: 'Aplikacja działa w tle. Kliknij ikonę na pasku zadań, aby ją otworzyć.'
    });
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'src', 'assets', 'tray-icon.png');
  const fallbackIconPath = path.join(__dirname, 'src', 'assets', 'icon.png');
  const usedPath = fs.existsSync(iconPath) ? iconPath : fallbackIconPath;

  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(usedPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('ZZP Manager');
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ─────────────────────────────────────────────
// Floating always-on-top widget (mini launcher bubble)
// ─────────────────────────────────────────────
function createFloatingWidget() {
  if (floatingWindow) return;

  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const SIZE = FLOATING_WIDGET_SIZE;

  const savedX = parseInt(settings.get('floating_widget_x'), 10);
  const savedY = parseInt(settings.get('floating_widget_y'), 10);
  const x = Number.isFinite(savedX) ? savedX : sw - SIZE - 24;
  const y = Number.isFinite(savedY) ? savedY : sh - SIZE - 24;

  floatingWindow = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    x, y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false, // repositioned manually via IPC — see floating:move handler
    hasShadow: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload-floating.js')
    }
  });

  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatingWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'floating.html'));

  floatingWindow.once('ready-to-show', () => floatingWindow?.show());

  floatingWindow.on('closed', () => { floatingWindow = null; });
}

function destroyFloatingWidget() {
  if (floatingWindow) {
    floatingWindow.close();
    floatingWindow = null;
  }
}

function updateTrayMenu(stats = {}) {
  const { todayHours = '0h 0min', monthlyIncome = '€0', timerActive = false, timerLabel = '' } = stats;

  const contextMenu = Menu.buildFromTemplate([
    { label: 'ZZP Manager', enabled: false },
    { type: 'separator' },
    { label: `⏱ Dziś: ${todayHours} | Ten miesiąc: ${monthlyIncome}`, enabled: false },
    { type: 'separator' },
    {
      label: timerActive ? '⏸ Pauza / Stop Timer' : '▶ Start Timer',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        mainWindow?.webContents.send('tray:toggle-timer');
      }
    },
    { type: 'separator' },
    {
      label: '+ Szybki wpis kosztu',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        mainWindow?.webContents.send('tray:quick-expense');
      }
    },
    {
      label: '+ Szybkie zadanie',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        mainWindow?.webContents.send('tray:quick-task');
      }
    },
    { type: 'separator' },
    {
      label: floatingWindow ? '🫧 Ukryj pływającą ikonkę' : '🫧 Pokaż pływającą ikonkę',
      click: () => {
        if (floatingWindow) {
          destroyFloatingWidget();
          settings.set('floating_widget_enabled', 'false');
        } else {
          createFloatingWidget();
          settings.set('floating_widget_enabled', 'true');
        }
        updateTrayMenu(stats);
      }
    },
    { type: 'separator' },
    {
      label: '📋 Otwórz ZZP Manager',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      }
    },
    {
      label: '❌ Zamknij aplikację',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// ─────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────
app.whenReady().then(() => {
  // Initialize modules
  db = require('./src/database/db');
  auth = require('./src/modules/auth');
  invoices = require('./src/modules/invoices');
  timeTracking = require('./src/modules/time-tracking');
  expenses = require('./src/modules/expenses');
  taxCalc = require('./src/modules/tax-calculator');
  reports = require('./src/modules/reports');
  projects = require('./src/modules/projects');
  contacts = require('./src/modules/contacts');
  tasks = require('./src/modules/tasks');
  notes = require('./src/modules/notes');
  youtube = require('./src/modules/youtube');
  youtubeApi = require('./src/modules/youtube-api');
  notifications = require('./src/modules/notifications');
  backup = require('./src/modules/backup');
  exportModule = require('./src/modules/export');
  settings = require('./src/modules/settings');
  incomeImport = require('./src/modules/income-import');
  efakturaImport = require('./src/modules/efaktura-import');
  googleCalendar = require('./src/modules/google-calendar');
  cloudSync = require('./src/modules/cloud-sync');
  products = require('./src/modules/products');
  mileage = require('./src/modules/mileage');
  hoursImport = require('./src/modules/hours-import');

  // Init database
  db.init();

  // Start notifications scheduler
  notifications.startScheduler(mainWindow);

  createWindow();
  createTray();
  registerIpcHandlers();

  // Floating always-on-top launcher bubble — enabled by default
  if (settings.get('floating_widget_enabled') !== 'false') {
    createFloatingWidget();
  }

  // ── YouTube API: auto-sync on startup ──────────────────────
  setTimeout(async () => {
    const rt  = settings.get('yt_refresh_token');
    const cid = settings.get('yt_client_id');
    const cs  = settings.get('yt_client_secret');
    if (!rt || !cid || !cs) return;
    const lastSync = parseInt(settings.get('yt_last_sync') || '0');
    if (Date.now() - lastSync < 22 * 3600 * 1000) return; // synced < 22h ago
    try {
      const r = await youtubeApi.syncStats(new Date().getFullYear(), cid, cs, rt);
      settings.set('yt_last_sync', String(Date.now()));
      mainWindow?.webContents.send('youtube:autoSynced', r);
    } catch (_) { /* silent — user hasn't revoked access or is offline */ }
  }, 8000); // 8s delay to let the window fully load

  // ── YouTube API: daily cron at 10:00 Amsterdam ─────────────
  const cron = require('node-cron');
  cron.schedule('0 10 * * *', async () => {
    const rt  = settings.get('yt_refresh_token');
    const cid = settings.get('yt_client_id');
    const cs  = settings.get('yt_client_secret');
    if (!rt || !cid || !cs) return;
    try {
      const r = await youtubeApi.syncStats(new Date().getFullYear(), cid, cs, rt);
      settings.set('yt_last_sync', String(Date.now()));
      mainWindow?.webContents.send('youtube:autoSynced', r);
    } catch (_) {}
  }, { timezone: 'Europe/Amsterdam' });
});

app.on('before-quit', () => { isQuitting = true; });

app.on('activate', () => {
  if (mainWindow === null) createWindow();
  else { mainWindow.show(); mainWindow.focus(); }
});

app.on('window-all-closed', () => {
  // On Windows keep running in tray
});

// ─────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────
function registerIpcHandlers() {

  // ── Auth ──────────────────────────────────
  ipcMain.handle('auth:isSetup', () => auth.isSetup());
  ipcMain.handle('auth:setup', (_, pin) => auth.setup(pin));
  ipcMain.handle('auth:verify', (_, pin) => auth.verify(pin));
  ipcMain.handle('auth:changePin', (_, oldPin, newPin) => auth.changePin(oldPin, newPin));
  ipcMain.handle('auth:resetPin', (_, recoveryKey) => auth.resetPin(recoveryKey));

  // ── Company Profile ───────────────────────
  ipcMain.handle('profile:get', () => settings.getProfile());
  ipcMain.handle('profile:save', (_, data) => settings.saveProfile(data));
  ipcMain.handle('profile:uploadLogo', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz logo firmy',
      filters: [{ name: 'Obrazy', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg'] }],
      properties: ['openFile']
    });
    if (result.canceled) return null;
    return settings.saveLogo(result.filePaths[0]);
  });

  // ── Settings ──────────────────────────────
  ipcMain.handle('settings:get', (_, key) => settings.get(key));
  ipcMain.handle('settings:set', (_, key, value) => settings.set(key, value));
  ipcMain.handle('settings:getAll', () => settings.getAll());

  // ── Floating widget ───────────────────────
  ipcMain.handle('floating:getEnabled', () => settings.get('floating_widget_enabled') !== 'false');
  ipcMain.handle('floating:setEnabled', (_, enabled) => {
    settings.set('floating_widget_enabled', enabled ? 'true' : 'false');
    if (enabled) createFloatingWidget();
    else destroyFloatingWidget();
    return { success: true };
  });

  // Push-style channels used only by the floating widget's own preload
  ipcMain.on('floating:move', (_, { dx, dy }) => {
    if (!floatingWindow) return;
    const [x, y] = floatingWindow.getPosition();
    floatingWindow.setPosition(x + dx, y + dy);
  });
  ipcMain.on('floating:dragEnd', () => {
    if (!floatingWindow) return;
    const [x, y] = floatingWindow.getPosition();
    settings.set('floating_widget_x', String(x));
    settings.set('floating_widget_y', String(y));
  });
  ipcMain.on('floating:click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  ipcMain.handle('settings:factoryReset', async () => {
    try {
      // 1. Wipe all user data in DB (re-seeds defaults inside)
      db.factoryReset();

      // 2. Remove user-uploaded files (receipts, logo)
      const userDataPath = app.getPath('userData');
      for (const dir of ['receipts', 'assets']) {
        const dirPath = path.join(userDataPath, dir);
        if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
      }

      // 3. Relaunch after a short delay so the IPC reply reaches the renderer
      setTimeout(() => { app.relaunch(); app.exit(0); }, 600);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Invoices ──────────────────────────────
  ipcMain.handle('invoices:getAll', (_, filters) => invoices.getAll(filters));
  ipcMain.handle('invoices:getById', (_, id) => invoices.getById(id));
  ipcMain.handle('invoices:create', (_, data) => invoices.create(data));
  ipcMain.handle('invoices:update', (_, id, data) => invoices.update(id, data));
  ipcMain.handle('invoices:delete', (_, id) => invoices.delete(id));
  ipcMain.handle('invoices:markPaid', (_, id, date) => invoices.markPaid(id, date));
  ipcMain.handle('invoices:duplicate', (_, id) => invoices.duplicate(id));
  ipcMain.handle('invoices:exportPDF', async (_, id) => {
    const result = await invoices.exportPDF(id, mainWindow);
    return result;
  });
  ipcMain.handle('invoices:getNextNumber', () => invoices.getNextNumber());
  ipcMain.handle('invoices:exportUBL', async (_, id) => {
    return invoices.exportUBL(id, mainWindow);
  });

  // ── Invoice Items ─────────────────────────
  ipcMain.handle('invoiceItems:getByInvoice', (_, invoiceId) => invoices.getItems(invoiceId));

  // ── Products (katalog produktów/usług) ────
  ipcMain.handle('products:getAll', (_, filters) => products.getAll(filters));
  ipcMain.handle('products:create', (_, data) => products.create(data));
  ipcMain.handle('products:update', (_, id, data) => products.update(id, data));
  ipcMain.handle('products:delete', (_, id) => products.delete(id));

  // ── Mileage (kilometrówka) ────────────────
  ipcMain.handle('mileage:getAll', (_, filters) => mileage.getAll(filters));
  ipcMain.handle('mileage:create', (_, data) => mileage.create(data));
  ipcMain.handle('mileage:update', (_, id, data) => mileage.update(id, data));
  ipcMain.handle('mileage:delete', (_, id) => mileage.delete(id));
  ipcMain.handle('mileage:getSummary', (_, year) => mileage.getSummary(year));

  // ── Time Tracking ─────────────────────────
  ipcMain.handle('time:getAll', (_, filters) => timeTracking.getAll(filters));
  ipcMain.handle('time:create', (_, data) => timeTracking.create(data));
  ipcMain.handle('time:update', (_, id, data) => timeTracking.update(id, data));
  ipcMain.handle('time:delete', (_, id) => timeTracking.delete(id));
  ipcMain.handle('time:getSummary', (_, filters) => timeTracking.getSummary(filters));
  ipcMain.handle('time:getYearTotal', (_, year) => timeTracking.getYearTotal(year));
  ipcMain.handle('time:exportPDF', async (_, filters) => {
    return timeTracking.exportPDF(filters, mainWindow);
  });

  // ── Expenses ──────────────────────────────
  ipcMain.handle('expenses:getAll', (_, filters) => expenses.getAll(filters));
  ipcMain.handle('expenses:create', (_, data) => expenses.create(data));
  ipcMain.handle('expenses:update', (_, id, data) => expenses.update(id, data));
  ipcMain.handle('expenses:delete', (_, id) => expenses.delete(id));
  ipcMain.handle('expenses:uploadReceipt', async (_, expenseId) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz paragon',
      filters: [{ name: 'Obrazy i PDF', extensions: ['jpg', 'jpeg', 'png', 'pdf'] }],
      properties: ['openFile']
    });
    if (result.canceled) return null;
    return expenses.saveReceipt(expenseId, result.filePaths[0]);
  });
  ipcMain.handle('expenses:getSummary', (_, filters) => expenses.getSummary(filters));

  // ── Tax Calculator ────────────────────────
  ipcMain.handle('tax:getRates', (_, year) => taxCalc.getRates(year));
  ipcMain.handle('tax:saveRates', (_, year, rates) => taxCalc.saveRates(year, rates));

  // ── Reports ───────────────────────────────
  ipcMain.handle('reports:monthly', (_, year, month) => reports.monthly(year, month));
  ipcMain.handle('reports:quarterly', (_, year, quarter) => reports.quarterly(year, quarter));
  ipcMain.handle('reports:annual', (_, year) => reports.annual(year));
  ipcMain.handle('reports:yearOverYear', (_, year1, year2) => reports.yearOverYear(year1, year2));
  ipcMain.handle('reports:export', async (_, type, format, params) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Zapisz raport',
      defaultPath: `Raport-${type}-${Date.now()}.${format}`,
      filters: [
        { name: format.toUpperCase(), extensions: [format] }
      ]
    });
    if (result.canceled) return null;
    return exportModule.exportReport(type, format, params, result.filePath);
  });

  ipcMain.handle('reports:generateWV', async (_, year) => {
    return await exportModule.generateWVPDF(year, mainWindow);
  });

  // ── Projects ──────────────────────────────
  ipcMain.handle('projects:getAll', (_, filters) => projects.getAll(filters));
  ipcMain.handle('projects:getById', (_, id) => projects.getById(id));
  ipcMain.handle('projects:create', (_, data) => projects.create(data));
  ipcMain.handle('projects:update', (_, id, data) => projects.update(id, data));
  ipcMain.handle('projects:delete', (_, id) => projects.delete(id));

  // ── Contacts / CRM ────────────────────────
  ipcMain.handle('contacts:getAll', (_, filters) => contacts.getAll(filters));
  ipcMain.handle('contacts:getById', (_, id) => contacts.getById(id));
  ipcMain.handle('contacts:create', (_, data) => contacts.create(data));
  ipcMain.handle('contacts:update', (_, id, data) => contacts.update(id, data));
  ipcMain.handle('contacts:delete', (_, id) => contacts.delete(id));
  ipcMain.handle('contacts:getInteractions', (_, clientId) => contacts.getInteractions(clientId));
  ipcMain.handle('contacts:addInteraction', (_, data) => contacts.addInteraction(data));
  ipcMain.handle('contacts:deleteInteraction', (_, id) => contacts.deleteInteraction(id));
  ipcMain.handle('contacts:uploadFile', async (_, clientId) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz plik',
      properties: ['openFile']
    });
    if (result.canceled) return null;
    return contacts.saveFile(clientId, result.filePaths[0]);
  });
  ipcMain.handle('contacts:getFiles', (_, clientId) => contacts.getFiles(clientId));
  ipcMain.handle('contacts:deleteFile', (_, id) => contacts.deleteFile(id));

  // ── Tasks ─────────────────────────────────
  ipcMain.handle('tasks:getAll', (_, filters) => tasks.getAll(filters));
  ipcMain.handle('tasks:create', (_, data) => tasks.create(data));
  ipcMain.handle('tasks:update', (_, id, data) => tasks.update(id, data));
  ipcMain.handle('tasks:delete', (_, id) => tasks.delete(id));
  ipcMain.handle('tasks:getCalendar', (_, year, month) => tasks.getCalendar(year, month));

  // ── Notes ─────────────────────────────────
  ipcMain.handle('notes:getAll', (_, filters) => notes.getAll(filters));
  ipcMain.handle('notes:getById', (_, id) => notes.getById(id));
  ipcMain.handle('notes:create', (_, data) => notes.create(data));
  ipcMain.handle('notes:update', (_, id, data) => notes.update(id, data));
  ipcMain.handle('notes:delete', (_, id) => notes.delete(id));

  // ── YouTube / AdSense ─────────────────────
  ipcMain.handle('youtube:getStats', (_, filters) => youtube.getStats(filters));
  ipcMain.handle('youtube:addStats', (_, data) => youtube.addStats(data));
  ipcMain.handle('youtube:importAdSenseCSV', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importuj CSV AdSense',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile']
    });
    if (result.canceled) return null;
    return youtube.importAdSenseCSV(result.filePaths[0]);
  });
  ipcMain.handle('youtube:importAnalyticsCSV', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importuj CSV YouTube Analytics',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile']
    });
    if (result.canceled) return null;
    return youtube.importAnalyticsCSV(result.filePaths[0]);
  });
  ipcMain.handle('youtube:getImportHistory', () => youtube.getImportHistory());
  ipcMain.handle('youtube:getDashboard', (_, year) => youtube.getDashboard(year));
  ipcMain.handle('youtube:resetData', () => youtube.resetData());

  // ── YouTube API (OAuth + auto-sync) ───────
  ipcMain.handle('youtube:oauthConnect', async (_, clientId, clientSecret) => {
    return youtubeApi.startOAuthFlow(clientId, clientSecret, mainWindow);
  });

  ipcMain.handle('youtube:syncStats', async (_, year) => {
    const rt  = settings.get('yt_refresh_token');
    const cid = settings.get('yt_client_id');
    const cs  = settings.get('yt_client_secret');
    if (!rt) throw new Error('Brak połączenia z YouTube API. Skonfiguruj OAuth w Ustawieniach → YouTube API.');
    const r = await youtubeApi.syncStats(year || new Date().getFullYear(), cid, cs, rt);
    settings.set('yt_last_sync', String(Date.now()));
    return r;
  });

  ipcMain.handle('youtube:getAuthStatus', () => ({
    connected: !!(settings.get('yt_refresh_token')),
    lastSync:  settings.get('yt_last_sync') || null,
    clientId:  settings.get('yt_client_id') || ''
  }));

  ipcMain.handle('youtube:disconnectAuth', () => {
    settings.set('yt_refresh_token', '');
    settings.set('yt_last_sync', '');
    settings.set('yt_first_sync_done', '');
    return { success: true };
  });

  // ── Google Calendar ───────────────────────
  ipcMain.handle('calendar:oauthConnect', async (_, clientId, clientSecret) => {
    const tokens = await googleCalendar.startOAuthFlow(clientId, clientSecret);
    settings.set('gcal_client_id', clientId);
    settings.set('gcal_client_secret', clientSecret);
    settings.set('gcal_refresh_token', tokens.refresh_token);
    return { success: true };
  });

  ipcMain.handle('calendar:getAuthStatus', () => ({
    connected: !!(settings.get('gcal_refresh_token')),
    clientId:  settings.get('gcal_client_id') || ''
  }));

  ipcMain.handle('calendar:disconnectAuth', () => {
    settings.set('gcal_refresh_token', '');
    return { success: true };
  });

  async function _gcalAccessToken() {
    const cid = settings.get('gcal_client_id');
    const cs  = settings.get('gcal_client_secret');
    const rt  = settings.get('gcal_refresh_token');
    if (!rt || !cid || !cs) {
      throw new Error('Brak połączenia z Google Calendar. Skonfiguruj OAuth w zakładce Kalendarz.');
    }
    const { access_token } = await googleCalendar.refreshAccessToken(cid, cs, rt);
    return access_token;
  }

  ipcMain.handle('calendar:listEvents', async (_, timeMin, timeMax) => {
    const token = await _gcalAccessToken();
    return googleCalendar.listEvents(token, timeMin, timeMax);
  });

  ipcMain.handle('calendar:createEvent', async (_, eventData) => {
    const token = await _gcalAccessToken();
    return googleCalendar.createEvent(token, eventData);
  });

  ipcMain.handle('calendar:updateEvent', async (_, eventId, eventData) => {
    const token = await _gcalAccessToken();
    return googleCalendar.updateEvent(token, eventId, eventData);
  });

  ipcMain.handle('calendar:deleteEvent', async (_, eventId) => {
    const token = await _gcalAccessToken();
    return googleCalendar.deleteEvent(token, eventId);
  });

  // ── Reminders ─────────────────────────────
  ipcMain.handle('reminders:getAll', () => notifications.getAll());
  ipcMain.handle('reminders:create', (_, data) => notifications.create(data));
  ipcMain.handle('reminders:update', (_, id, data) => notifications.update(id, data));
  ipcMain.handle('reminders:dismiss', (_, id) => notifications.dismiss(id));
  ipcMain.handle('reminders:delete', (_, id) => notifications.delete(id));
  ipcMain.handle('reminders:getUpcoming', () => {
    const days = parseInt(settings.get('reminders_dashboard_days') || '30');
    return notifications.getUpcoming(days);
  });

  // ── Cloud sync (mobile companion) ─────────
  ipcMain.handle('sync:getStatus', () => cloudSync.getStatus());
  ipcMain.handle('sync:getHistory', () => cloudSync.getHistory());
  ipcMain.handle('sync:configureCredentials', (_, creds) => cloudSync.configureCredentials(creds));
  ipcMain.handle('sync:testConnection', () => cloudSync.testConnection());
  ipcMain.handle('sync:pushLocalChanges', () => cloudSync.pushLocalChanges());
  ipcMain.handle('sync:pullCloudChanges', () => cloudSync.pullCloudChanges());
  ipcMain.handle('sync:runFull', async () => {
    const pushResult = await cloudSync.pushLocalChanges();
    const pullResult = await cloudSync.pullCloudChanges();
    return { pushResult, pullResult };
  });

  // ── Backup ────────────────────────────────
  ipcMain.handle('backup:run', () => backup.run());
  ipcMain.handle('backup:getHistory', () => backup.getHistory());
  ipcMain.handle('backup:getSettings', () => backup.getSettings());
  ipcMain.handle('backup:saveSettings', (_, data) => backup.saveSettings(data));
  ipcMain.handle('backup:chooseFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz folder backupu',
      properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('backup:openFolder', async () => {
    const folder = backup.getSettings().folder;
    if (folder && fs.existsSync(folder)) {
      await shell.openPath(folder);
    }
  });

  // ── Income entries ────────────────────────
  ipcMain.handle('income:getAll', (_, filters) => reports.getIncomeEntries(filters));
  ipcMain.handle('income:create', (_, data) => reports.createIncomeEntry(data));
  ipcMain.handle('income:delete', (_, id) => reports.deleteIncomeEntry(id));

  // ── Income CSV Import ─────────────────────
  ipcMain.handle('income:analyzeCSV', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz plik CSV',
      filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }],
      properties: ['openFile']
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const analysis = incomeImport.analyzeCSV(filePath);
    // Include filePath so renderer can pass it to importCSV
    return { ...analysis, filePath };
  });
  ipcMain.handle('income:importCSV', (_, filePath, mapping) => {
    return incomeImport.importCSV(filePath, mapping);
  });

  // ── eFaktura.nl Import ────────────────────
  ipcMain.handle('efaktura:pickFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz pliki XML lub PDF z efaktura.nl',
      filters: [{ name: 'XML / PDF', extensions: ['xml', 'pdf'] }],
      properties: ['openFile', 'multiSelections']
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('efaktura:analyze', (_, filePaths, type) =>
    efakturaImport.parseFiles(filePaths, type));
  ipcMain.handle('efaktura:importInvoices', (_, parsedItems) =>
    efakturaImport.importInvoices(parsedItems));
  ipcMain.handle('efaktura:importExpenses', (_, parsedItems) =>
    efakturaImport.importExpenses(parsedItems));

  // ── Hours import (godzinówka z efaktura) ──
  ipcMain.handle('hours:pickFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz plik godzin (PDF lub XML) z efaktura.nl',
      filters: [{ name: 'PDF / XML', extensions: ['pdf', 'xml'] }],
      properties: ['openFile', 'multiSelections']
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('hours:analyze', (_, filePaths) => hoursImport.parseFiles(filePaths));
  ipcMain.handle('hours:import', (_, items, options) => hoursImport.importHours(items, options));

  // ── Dashboard ─────────────────────────────
  ipcMain.handle('dashboard:getData', () => getDashboardData());
  ipcMain.handle('dashboard:getKPIs', () => getDashboardKPIs());
  ipcMain.handle('dashboard:getAlerts', () => getDashboardAlerts());
  ipcMain.handle('dashboard:getChartData', (_, type, period) => getDashboardChartData(type, period));

  // ── System ────────────────────────────────
  ipcMain.handle('system:getIdleTime', () => {
    try { return powerMonitor.getSystemIdleTime(); } catch { return 0; }
  });

  // ── Utility ───────────────────────────────
  ipcMain.handle('util:openFile', async (_, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      await shell.openPath(filePath);
      return true;
    }
    return false;
  });
  ipcMain.handle('util:showInFolder', async (_, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });
  ipcMain.handle('util:openExternal', async (_, url) => {
    // Tylko bezpieczne schematy — mailto (wezwania) i http(s) (np. VIES)
    if (typeof url === 'string' && /^(mailto:|https?:)/i.test(url)) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // ── VIES — weryfikacja numeru VAT klienta (API UE) ──
  ipcMain.handle('vies:check', async (_, vat) => {
    const clean = String(vat || '').replace(/[\s.\-]/g, '').toUpperCase();
    const m = clean.match(/^([A-Z]{2})(.+)$/);
    if (!m) return { valid: false, error: 'Numer VAT musi zaczynać się od kodu kraju (np. NL, IE).' };
    const [, cc, num] = m;
    try {
      const res = await fetch(
        `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${cc}/vat/${num}`,
        { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return { valid: false, error: `VIES odpowiedział błędem ${res.status}` };
      const data = await res.json();
      return {
        valid: !!data.isValid,
        name: (data.name && data.name !== '---') ? data.name : '',
        address: (data.address && data.address !== '---') ? data.address : '',
        countryCode: cc, vatNumber: num
      };
    } catch (e) {
      return { valid: false, error: 'Połączenie z VIES nieudane: ' + e.message };
    }
  });
  ipcMain.handle('tray:updateStats', (_, stats) => {
    updateTrayMenu(stats);
  });
}

function getDashboardData() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    const monthlyReport = reports.monthly(year, month);
    const yearTotal = timeTracking.getYearTotal(year);
    const upcoming = notifications.getUpcoming();
    const overdueInvoices = invoices.getAll({ status: 'overdue' });
    const activeTasks = tasks.getAll({ status: 'todo', limit: 5 });

    // Revenue last 12 months for chart
    const revenueChart = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const r = reports.monthly(y, m);
      revenueChart.push({
        label: `${String(m).padStart(2,'0')}/${y}`,
        income: r.totalIncome || 0,
        expenses: r.totalExpenses || 0
      });
    }

    return {
      monthly: monthlyReport,
      yearHours: yearTotal,
      upcoming,
      overdueInvoices,
      activeTasks,
      revenueChart
    };
  } catch (err) {
    console.error('Dashboard data error:', err);
    return {};
  }
}

function getDashboardKPIs() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  try {
    const cur = reports.monthly(year, month);
    const prev = reports.monthly(prevYear, prevMonth);
    const yearTotal = timeTracking.getYearTotal(year);
    const annualData = reports.annual(year);

    // Income change %
    const incomeChange = prev.totalIncome > 0
      ? ((cur.totalIncome - prev.totalIncome) / prev.totalIncome) * 100 : null;
    const expensesChange = prev.totalExpenses > 0
      ? ((cur.totalExpenses - prev.totalExpenses) / prev.totalExpenses) * 100 : null;

    // Estimated IB tax (simplified NL 2025)
    const ytdIncome = annualData.totalIncome;
    const ytdExpenses = annualData.totalExpenses;
    const taxableProfit = Math.max(0, ytdIncome - ytdExpenses - 2470); // minus zelfstandigenaftrek
    const afterMKB = taxableProfit * (1 - 0.127); // MKB vrijstelling
    let ibTax = 0;
    if (afterMKB > 38441) {
      ibTax = 38441 * 0.3697 + (afterMKB - 38441) * 0.495;
    } else {
      ibTax = afterMKB * 0.3697;
    }
    ibTax = Math.max(0, ibTax - 3362); // heffingskorting
    const monthsElapsed = month;
    const monthlyReserve = monthsElapsed > 0 ? ibTax / monthsElapsed : 0;

    // Next deadline
    const upcoming = notifications.getUpcoming(1);
    const nextDeadline = upcoming?.[0] || null;

    // Hours this month
    const monthSummary = timeTracking.getSummary({ year, month });
    const monthHours = (monthSummary.total_minutes || 0) / 60;

    return {
      monthIncome: cur.totalIncome,
      monthExpenses: cur.totalExpenses,
      monthHours,
      incomeChange,
      expensesChange,
      ytdIncome,
      ytdExpenses,
      yearHours: yearTotal.total_hours,
      urencriterium: yearTotal,
      estimatedIBTax: ibTax,
      monthlyReserve,
      nextDeadline
    };
  } catch (err) {
    console.error('KPI error:', err);
    return {};
  }
}

function getDashboardAlerts() {
  const alerts = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  try {
    // Overdue invoices
    const overdue = invoices.getAll({ status: 'overdue' });
    for (const inv of overdue) {
      const daysPast = Math.floor((today - new Date(inv.due_date)) / 86400000);
      alerts.push({
        type: 'danger',
        icon: '🔴',
        message: `Faktura ${inv.invoice_number} (${inv.client_name || 'klient'}) przeterminowana o ${daysPast} dni`,
        action: { label: 'Otwórz faktury', page: 'invoices' }
      });
    }

    // Upcoming tax deadlines (≤14 days)
    const upcoming = notifications.getAll();
    for (const r of upcoming) {
      if (r.is_dismissed) continue;
      const daysLeft = Math.floor((new Date(r.due_date) - today) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 14) {
        alerts.push({
          type: 'warning',
          icon: '⚠️',
          message: `${r.title} — za ${daysLeft} dni (${r.due_date})`,
          action: { label: 'Pokaż przypomnienia', page: 'reminders' }
        });
      }
    }

    // Urencriterium warning
    const year = today.getFullYear();
    const monthsElapsed = today.getMonth() + 1;
    if (monthsElapsed >= 6) {
      const yearTotal = timeTracking.getYearTotal(year);
      const pct = yearTotal.urencriterium_progress;
      if (pct < 60) {
        alerts.push({
          type: 'warning',
          icon: '⚠️',
          message: `Ryzyko urencriterium: ${yearTotal.total_hours.toFixed(1)}h / 1225h (${pct.toFixed(1)}%) — zagrożone prawo do aftrekken`,
          action: { label: 'Śledzenie czasu', page: 'time' }
        });
      }
    }
  } catch (err) {
    console.error('Alerts error:', err);
  }

  return alerts;
}

function getDashboardChartData(type, period) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    if (type === 'revenue_costs') {
      const labels = [], income = [], costs = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const r = reports.monthly(y, m);
        labels.push(`${String(m).padStart(2,'0')}/${String(y).slice(2)}`);
        income.push(r.totalIncome || 0);
        costs.push(r.totalExpenses || 0);
      }
      return { labels, income, costs };
    }

    if (type === 'hours') {
      const labels = [], hours = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const s = timeTracking.getSummary({ year: y, month: m });
        labels.push(`${String(m).padStart(2,'0')}/${String(y).slice(2)}`);
        hours.push(((s.total_minutes || 0) / 60).toFixed(1));
      }
      return { labels, hours };
    }

    if (type === 'expenses_by_category') {
      const db = require('./src/database/db').getDb();
      const rows = db.prepare(`
        SELECT category, SUM(amount_eur) as total
        FROM expenses
        WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?
        GROUP BY category ORDER BY total DESC
      `).all(String(year), String(month).padStart(2,'0'));
      return {
        labels: rows.map(r => r.category),
        values: rows.map(r => r.total)
      };
    }
  } catch (err) {
    console.error('Chart data error:', err);
  }
  return {};
}

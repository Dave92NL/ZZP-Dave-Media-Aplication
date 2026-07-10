'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Whitelist of valid IPC channels
const VALID_CHANNELS = new Set([
  'auth:isSetup', 'auth:setup', 'auth:verify', 'auth:changePin', 'auth:resetPin',
  'profile:get', 'profile:save', 'profile:uploadLogo',
  'settings:get', 'settings:set', 'settings:getAll', 'settings:factoryReset',
  'floating:getEnabled', 'floating:setEnabled',
  'invoices:getAll', 'invoices:getById', 'invoices:create', 'invoices:update',
  'invoices:delete', 'invoices:markPaid', 'invoices:duplicate', 'invoices:exportPDF',
  'invoices:exportUBL', 'invoices:getNextNumber', 'invoiceItems:getByInvoice',
  'products:getAll', 'products:create', 'products:update', 'products:delete',
  'mileage:getAll', 'mileage:create', 'mileage:update', 'mileage:delete', 'mileage:getSummary',
  'time:getAll', 'time:create', 'time:update', 'time:delete',
  'time:getSummary', 'time:getYearTotal', 'time:exportPDF',
  'expenses:getAll', 'expenses:create', 'expenses:update', 'expenses:delete',
  'expenses:getAttachments', 'expenses:addAttachment', 'expenses:deleteAttachment',
  'expenses:uploadReceipt', 'expenses:getSummary',
  'tax:getRates', 'tax:saveRates',
  'reports:monthly', 'reports:quarterly', 'reports:annual',
  'reports:yearOverYear', 'reports:export', 'reports:generateWV',
  'projects:getAll', 'projects:getById', 'projects:create',
  'projects:update', 'projects:delete',
  'contacts:getAll', 'contacts:getById', 'contacts:create', 'contacts:update',
  'contacts:delete', 'contacts:getInteractions', 'contacts:addInteraction',
  'contacts:deleteInteraction', 'contacts:uploadFile', 'contacts:getFiles',
  'contacts:deleteFile',
  'tasks:getAll', 'tasks:create', 'tasks:update', 'tasks:delete', 'tasks:getCalendar',
  'notes:getAll', 'notes:getById', 'notes:create', 'notes:update', 'notes:delete',
  'youtube:getStats', 'youtube:addStats', 'youtube:importAdSenseCSV',
  'youtube:importAnalyticsCSV', 'youtube:getImportHistory', 'youtube:getDashboard', 'youtube:resetData',
  'youtube:oauthConnect', 'youtube:syncStats', 'youtube:getAuthStatus', 'youtube:disconnectAuth',
  'reminders:getAll', 'reminders:create', 'reminders:update',
  'reminders:dismiss', 'reminders:delete', 'reminders:getUpcoming',
  'backup:run', 'backup:getHistory', 'backup:getSettings', 'backup:saveSettings',
  'backup:chooseFolder', 'backup:openFolder',
  'income:getAll', 'income:create', 'income:delete',
  'income:analyzeCSV', 'income:importCSV',
  'dashboard:getData', 'dashboard:getKPIs', 'dashboard:getAlerts', 'dashboard:getChartData',
  'system:getIdleTime',
  'util:openFile', 'util:showInFolder', 'util:openExternal', 'util:readFileAsDataUrl', 'vies:check', 'tray:updateStats',
  'efaktura:pickFiles', 'efaktura:analyze', 'efaktura:importInvoices', 'efaktura:importExpenses',
  'hours:pickFiles', 'hours:analyze', 'hours:import',
  'calendar:oauthConnect', 'calendar:getAuthStatus', 'calendar:disconnectAuth',
  'calendar:listEvents', 'calendar:createEvent', 'calendar:updateEvent', 'calendar:deleteEvent',
  'sync:getStatus', 'sync:getHistory', 'sync:configureCredentials', 'sync:testConnection',
  'sync:pushLocalChanges', 'sync:pullCloudChanges', 'sync:runFull'
]);

function invoke(channel, ...args) {
  if (!VALID_CHANNELS.has(channel)) {
    throw new Error(`IPC channel not allowed: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

// Renderer → Main push events (one-way)
const VALID_PUSH_CHANNELS = new Set([
  'tray:toggle-timer', 'tray:quick-expense', 'tray:quick-task',
  'notification:reminder',
  'youtube:autoSynced'
]);

function on(channel, callback) {
  if (!VALID_PUSH_CHANNELS.has(channel)) return;
  const wrapper = (_, ...args) => callback(...args);
  ipcRenderer.on(channel, wrapper);
  return () => ipcRenderer.removeListener(channel, wrapper);
}

contextBridge.exposeInMainWorld('api', {
  // ── Auth ──────────────────────────────────
  auth: {
    isSetup: () => invoke('auth:isSetup'),
    setup: (pin) => invoke('auth:setup', pin),
    verify: (pin) => invoke('auth:verify', pin),
    changePin: (oldPin, newPin) => invoke('auth:changePin', oldPin, newPin),
    resetPin: (key) => invoke('auth:resetPin', key)
  },

  // ── Profile ───────────────────────────────
  profile: {
    get: () => invoke('profile:get'),
    save: (data) => invoke('profile:save', data),
    uploadLogo: () => invoke('profile:uploadLogo')
  },

  // ── Settings ──────────────────────────────
  settings: {
    get: (key) => invoke('settings:get', key),
    set: (key, value) => invoke('settings:set', key, value),
    getAll: () => invoke('settings:getAll'),
    factoryReset: () => invoke('settings:factoryReset')
  },

  // ── Floating widget ────────────────────────
  floatingWidget: {
    getEnabled: () => invoke('floating:getEnabled'),
    setEnabled: (enabled) => invoke('floating:setEnabled', enabled)
  },

  // ── Invoices ──────────────────────────────
  invoices: {
    getAll: (filters) => invoke('invoices:getAll', filters),
    getById: (id) => invoke('invoices:getById', id),
    create: (data) => invoke('invoices:create', data),
    update: (id, data) => invoke('invoices:update', id, data),
    delete: (id) => invoke('invoices:delete', id),
    markPaid: (id, date) => invoke('invoices:markPaid', id, date),
    duplicate: (id) => invoke('invoices:duplicate', id),
    exportPDF: (id) => invoke('invoices:exportPDF', id),
    exportUBL: (id) => invoke('invoices:exportUBL', id),
    getNextNumber: () => invoke('invoices:getNextNumber'),
    getItems: (invoiceId) => invoke('invoiceItems:getByInvoice', invoiceId)
  },

  // ── Products (katalog produktów/usług) ────
  products: {
    getAll: (filters) => invoke('products:getAll', filters),
    create: (data) => invoke('products:create', data),
    update: (id, data) => invoke('products:update', id, data),
    delete: (id) => invoke('products:delete', id)
  },

  // ── Mileage (kilometrówka) ────────────────
  mileage: {
    getAll: (filters) => invoke('mileage:getAll', filters),
    create: (data) => invoke('mileage:create', data),
    update: (id, data) => invoke('mileage:update', id, data),
    delete: (id) => invoke('mileage:delete', id),
    getSummary: (year) => invoke('mileage:getSummary', year)
  },

  // ── Time Tracking ─────────────────────────
  time: {
    getAll: (filters) => invoke('time:getAll', filters),
    create: (data) => invoke('time:create', data),
    update: (id, data) => invoke('time:update', id, data),
    delete: (id) => invoke('time:delete', id),
    getSummary: (filters) => invoke('time:getSummary', filters),
    getYearTotal: (year) => invoke('time:getYearTotal', year),
    exportPDF: (filters) => invoke('time:exportPDF', filters)
  },

  // ── Expenses ──────────────────────────────
  expenses: {
    getAll: (filters) => invoke('expenses:getAll', filters),
    create: (data) => invoke('expenses:create', data),
    update: (id, data) => invoke('expenses:update', id, data),
    delete: (id) => invoke('expenses:delete', id),
    getAttachments: (expenseId) => invoke('expenses:getAttachments', expenseId),
    addAttachment: (expenseId) => invoke('expenses:addAttachment', expenseId),
    deleteAttachment: (attachmentId) => invoke('expenses:deleteAttachment', attachmentId),
    uploadReceipt: (expenseId) => invoke('expenses:uploadReceipt', expenseId),
    getSummary: (filters) => invoke('expenses:getSummary', filters)
  },

  // ── Tax ───────────────────────────────────
  tax: {
    getRates: (year) => invoke('tax:getRates', year),
    saveRates: (year, rates) => invoke('tax:saveRates', year, rates)
  },

  // ── Reports ───────────────────────────────
  reports: {
    monthly: (year, month) => invoke('reports:monthly', year, month),
    quarterly: (year, quarter) => invoke('reports:quarterly', year, quarter),
    annual: (year) => invoke('reports:annual', year),
    yearOverYear: (y1, y2) => invoke('reports:yearOverYear', y1, y2),
    export: (type, format, params) => invoke('reports:export', type, format, params),
    generateWV: (year) => invoke('reports:generateWV', year)
  },

  // ── Projects ──────────────────────────────
  projects: {
    getAll: (filters) => invoke('projects:getAll', filters),
    getById: (id) => invoke('projects:getById', id),
    create: (data) => invoke('projects:create', data),
    update: (id, data) => invoke('projects:update', id, data),
    delete: (id) => invoke('projects:delete', id)
  },

  // ── Contacts ──────────────────────────────
  contacts: {
    getAll: (filters) => invoke('contacts:getAll', filters),
    getById: (id) => invoke('contacts:getById', id),
    create: (data) => invoke('contacts:create', data),
    update: (id, data) => invoke('contacts:update', id, data),
    delete: (id) => invoke('contacts:delete', id),
    getInteractions: (clientId) => invoke('contacts:getInteractions', clientId),
    addInteraction: (data) => invoke('contacts:addInteraction', data),
    deleteInteraction: (id) => invoke('contacts:deleteInteraction', id),
    uploadFile: (clientId) => invoke('contacts:uploadFile', clientId),
    getFiles: (clientId) => invoke('contacts:getFiles', clientId),
    deleteFile: (id) => invoke('contacts:deleteFile', id)
  },

  // ── Tasks ─────────────────────────────────
  tasks: {
    getAll: (filters) => invoke('tasks:getAll', filters),
    create: (data) => invoke('tasks:create', data),
    update: (id, data) => invoke('tasks:update', id, data),
    delete: (id) => invoke('tasks:delete', id),
    getCalendar: (year, month) => invoke('tasks:getCalendar', year, month)
  },

  // ── Notes ─────────────────────────────────
  notes: {
    getAll: (filters) => invoke('notes:getAll', filters),
    getById: (id) => invoke('notes:getById', id),
    create: (data) => invoke('notes:create', data),
    update: (id, data) => invoke('notes:update', id, data),
    delete: (id) => invoke('notes:delete', id)
  },

  // ── YouTube ───────────────────────────────
  youtube: {
    getStats: (filters) => invoke('youtube:getStats', filters),
    addStats: (data) => invoke('youtube:addStats', data),
    importAdSenseCSV: () => invoke('youtube:importAdSenseCSV'),
    importAnalyticsCSV: () => invoke('youtube:importAnalyticsCSV'),
    getImportHistory: () => invoke('youtube:getImportHistory'),
    getDashboard: (year) => invoke('youtube:getDashboard', year),
    resetData: () => invoke('youtube:resetData'),
    oauthConnect:   (clientId, clientSecret) => invoke('youtube:oauthConnect', clientId, clientSecret),
    syncStats:      (year)                   => invoke('youtube:syncStats', year),
    getAuthStatus:  ()                       => invoke('youtube:getAuthStatus'),
    disconnectAuth: ()                       => invoke('youtube:disconnectAuth')
  },

  // ── Reminders ─────────────────────────────
  reminders: {
    getAll: () => invoke('reminders:getAll'),
    create: (data) => invoke('reminders:create', data),
    update: (id, data) => invoke('reminders:update', id, data),
    dismiss: (id) => invoke('reminders:dismiss', id),
    delete: (id) => invoke('reminders:delete', id),
    getUpcoming: () => invoke('reminders:getUpcoming')
  },

  // ── Backup ────────────────────────────────
  backup: {
    run: () => invoke('backup:run'),
    getHistory: () => invoke('backup:getHistory'),
    getSettings: () => invoke('backup:getSettings'),
    saveSettings: (data) => invoke('backup:saveSettings', data),
    chooseFolder: () => invoke('backup:chooseFolder'),
    openFolder: () => invoke('backup:openFolder')
  },

  // ── Income ────────────────────────────────
  income: {
    getAll: (filters) => invoke('income:getAll', filters),
    create: (data) => invoke('income:create', data),
    delete: (id) => invoke('income:delete', id),
    analyzeCSV: () => invoke('income:analyzeCSV'),
    importCSV: (filePath, mapping) => invoke('income:importCSV', filePath, mapping)
  },

  // ── Dashboard ─────────────────────────────
  dashboard: {
    getData: () => invoke('dashboard:getData'),
    getKPIs: () => invoke('dashboard:getKPIs'),
    getAlerts: () => invoke('dashboard:getAlerts'),
    getChartData: (type, period) => invoke('dashboard:getChartData', type, period)
  },

  // ── System ────────────────────────────────
  system: {
    getIdleTime: () => invoke('system:getIdleTime')
  },

  // ── Utility ───────────────────────────────
  util: {
    openFile: (path) => invoke('util:openFile', path),
    showInFolder: (path) => invoke('util:showInFolder', path),
    openExternal: (url) => invoke('util:openExternal', url),
    readFileAsDataUrl: (p) => invoke('util:readFileAsDataUrl', p)
  },

  // ── VIES (weryfikacja VAT) ─────────────────
  vies: {
    check: (vat) => invoke('vies:check', vat)
  },

  // ── Tray ──────────────────────────────────
  tray: {
    updateStats: (stats) => invoke('tray:updateStats', stats)
  },

  // ── eFaktura.nl Import ────────────────────
  efaktura: {
    pickFiles:      ()               => invoke('efaktura:pickFiles'),
    analyze:        (paths, type)    => invoke('efaktura:analyze', paths, type),
    importInvoices: (items)          => invoke('efaktura:importInvoices', items),
    importExpenses: (items)          => invoke('efaktura:importExpenses', items)
  },

  // ── Hours import (godzinówka) ──────────────
  hours: {
    pickFiles: ()               => invoke('hours:pickFiles'),
    analyze:   (paths)          => invoke('hours:analyze', paths),
    import:    (items, options) => invoke('hours:import', items, options)
  },

  // ── Google Calendar ────────────────────────
  calendar: {
    oauthConnect:   (clientId, clientSecret) => invoke('calendar:oauthConnect', clientId, clientSecret),
    getAuthStatus:  ()                       => invoke('calendar:getAuthStatus'),
    disconnectAuth: ()                       => invoke('calendar:disconnectAuth'),
    listEvents:     (timeMin, timeMax)       => invoke('calendar:listEvents', timeMin, timeMax),
    createEvent:    (data)                   => invoke('calendar:createEvent', data),
    updateEvent:    (eventId, data)          => invoke('calendar:updateEvent', eventId, data),
    deleteEvent:    (eventId)                => invoke('calendar:deleteEvent', eventId)
  },

  // ── Cloud sync (mobile companion) ──────────
  sync: {
    getStatus:            ()      => invoke('sync:getStatus'),
    getHistory:            ()      => invoke('sync:getHistory'),
    configureCredentials: (creds) => invoke('sync:configureCredentials', creds),
    testConnection:       ()      => invoke('sync:testConnection'),
    pushLocalChanges:     ()      => invoke('sync:pushLocalChanges'),
    pullCloudChanges:     ()      => invoke('sync:pullCloudChanges'),
    runFull:              ()      => invoke('sync:runFull')
  },

  // ── Event listeners (main → renderer push) ─
  on
});

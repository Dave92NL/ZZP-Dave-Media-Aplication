'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { app } = require('electron');
const cron = require('node-cron');
const { getDb } = require('../database/db');

let backupJob = null;

function getSettings() {
  const db = getDb();
  const keys = ['backup_auto', 'backup_folder', 'backup_frequency', 'backup_time', 'backup_keep'];
  const result = {};
  for (const key of keys) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    result[key.replace('backup_', '')] = row?.value || '';
  }
  return {
    auto: result.auto === 'true',
    folder: result.folder || '',
    frequency: result.frequency || 'daily',
    time: result.time || '03:00',
    keep: parseInt(result.keep) || 10
  };
}

function saveSettings(data) {
  const db = getDb();
  const mapping = {
    auto: 'backup_auto',
    folder: 'backup_folder',
    frequency: 'backup_frequency',
    time: 'backup_time',
    keep: 'backup_keep'
  };

  for (const [key, dbKey] of Object.entries(mapping)) {
    if (key in data) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(dbKey, String(data[key]));
    }
  }

  // Reschedule if settings changed
  scheduleBackup();
  return true;
}

function scheduleBackup() {
  if (backupJob) { backupJob.stop(); backupJob = null; }

  const settings = getSettings();
  if (!settings.auto || !settings.folder) return;

  const [hour, minute] = (settings.time || '03:00').split(':');

  let cronExpr;
  switch (settings.frequency) {
    case 'weekly': cronExpr = `${minute} ${hour} * * 0`; break;
    case 'monthly': cronExpr = `${minute} ${hour} 1 * *`; break;
    default: cronExpr = `${minute} ${hour} * * *`; // daily
  }

  try {
    backupJob = cron.schedule(cronExpr, () => run(), { timezone: 'Europe/Amsterdam' });
  } catch (err) {
    console.error('Backup schedule error:', err);
  }
}

async function run() {
  const settings = getSettings();
  const folder = settings.folder;

  if (!folder) throw new Error('Folder backupu nie jest ustawiony.');
  if (!fs.existsSync(folder)) throw new Error(`Folder docelowy nie istnieje: ${folder}`);

  const userDataPath = app.getPath('userData');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `ZZP-Backup-${timestamp}.zip`;
  const outputPath = path.join(folder, filename);

  try {
    // Create a manifest of what to backup
    const dbPath = path.join(userDataPath, 'zzp-manager.db');
    const receiptsPath = path.join(userDataPath, 'receipts');
    const invoicesPDFPath = path.join(userDataPath, 'invoices-pdf');
    const clientFilesPath = path.join(userDataPath, 'client-files');
    const assetsPath = path.join(userDataPath, 'assets');

    // Use PowerShell Compress-Archive on Windows
    const items = [dbPath];
    if (fs.existsSync(receiptsPath)) items.push(receiptsPath);
    if (fs.existsSync(invoicesPDFPath)) items.push(invoicesPDFPath);
    if (fs.existsSync(clientFilesPath)) items.push(clientFilesPath);
    if (fs.existsSync(assetsPath)) items.push(assetsPath);

    const itemsJson = items.map(p => `"${p}"`).join(',');
    const cmd = `powershell -Command "Compress-Archive -Path ${itemsJson} -DestinationPath '${outputPath}' -Force"`;
    execSync(cmd, { timeout: 60000 });

    const stats = fs.statSync(outputPath);

    // Log backup
    const db = getDb();
    db.prepare(`
      INSERT INTO backup_history (filename, filepath, filesize, status)
      VALUES (?, ?, ?, 'success')
    `).run(filename, outputPath, stats.size);

    // Cleanup old backups
    pruneOldBackups(folder, settings.keep);

    return { success: true, filename, size: stats.size, path: outputPath };
  } catch (err) {
    const db = getDb();
    db.prepare(`
      INSERT INTO backup_history (filename, filepath, status, error_message)
      VALUES (?, ?, 'error', ?)
    `).run(filename, outputPath, err.message);

    throw err;
  }
}

function pruneOldBackups(folder, keep) {
  try {
    const files = fs.readdirSync(folder)
      .filter(f => f.startsWith('ZZP-Backup-') && f.endsWith('.zip'))
      .map(f => ({ name: f, time: fs.statSync(path.join(folder, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    for (let i = keep; i < files.length; i++) {
      fs.unlinkSync(path.join(folder, files[i].name));
    }
  } catch {}
}

function getHistory() {
  const db = getDb();
  return db.prepare('SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 20').all();
}

module.exports = { run, getSettings, saveSettings, getHistory, scheduleBackup };

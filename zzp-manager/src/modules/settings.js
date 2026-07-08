'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/db');

function get(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function set(key, value) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
    .run(key, String(value));
  return true;
}

function getAll() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) {
    if (row.key !== 'pin_hash' && row.key !== 'recovery_hash') {
      result[row.key] = row.value;
    }
  }
  return result;
}

function getProfile() {
  const db = getDb();
  return db.prepare('SELECT * FROM company_profile WHERE id = 1').get() || {};
}

function saveProfile(data) {
  const db = getDb();
  const allowed = [
    'name', 'address', 'postcode', 'city', 'country',
    'kvk_number', 'btw_number', 'iban', 'email', 'phone',
    'invoice_prefix', 'invoice_next_number', 'default_payment_days',
    'default_hourly_rate', 'default_currency', 'invoice_footer', 'logo_path'
  ];

  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  if (!fields.length) return false;

  db.prepare(`UPDATE company_profile SET ${fields.join(', ')} WHERE id = 1`).run(...values);
  return true;
}

function saveLogo(sourcePath) {
  const userDataPath = app.getPath('userData');
  const logoDir = path.join(userDataPath, 'assets');
  fs.mkdirSync(logoDir, { recursive: true });

  const ext = path.extname(sourcePath);
  const destPath = path.join(logoDir, `logo${ext}`);
  fs.copyFileSync(sourcePath, destPath);

  saveProfile({ logo_path: destPath });
  return destPath;
}

module.exports = { get, set, getAll, getProfile, saveProfile, saveLogo };

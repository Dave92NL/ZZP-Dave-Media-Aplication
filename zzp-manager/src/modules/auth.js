'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/db');

const SALT_ROUNDS = 12;
const RECOVERY_FILE = 'recovery.key';

function isSetup() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'pin_hash'").get();
    return !!row;
  } catch {
    return false;
  }
}

function setup(pin) {
  if (!validatePinFormat(pin)) {
    throw new Error('PIN musi mieć od 4 do 8 cyfr.');
  }

  const db = getDb();
  const hash = bcrypt.hashSync(String(pin), SALT_ROUNDS);

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('pin_hash', ?)").run(hash);

  // Generate recovery key
  const recoveryKey = crypto.randomBytes(32).toString('hex');
  const recoveryHash = bcrypt.hashSync(recoveryKey, 10);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('recovery_hash', ?)").run(recoveryHash);

  // Save recovery key to file in userData
  const recoveryPath = path.join(app.getPath('userData'), RECOVERY_FILE);
  fs.writeFileSync(recoveryPath, recoveryKey, 'utf8');

  return { success: true, recoveryKeyPath: recoveryPath };
}

function verify(pin) {
  if (!pin || typeof pin !== 'string') return { success: false };

  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'pin_hash'").get();
  if (!row) return { success: false };

  const match = bcrypt.compareSync(String(pin), row.value);
  return { success: match };
}

function changePin(oldPin, newPin) {
  const verifyResult = verify(oldPin);
  if (!verifyResult.success) {
    throw new Error('Stary PIN jest niepoprawny.');
  }

  if (!validatePinFormat(newPin)) {
    throw new Error('Nowy PIN musi mieć od 4 do 8 cyfr.');
  }

  const db = getDb();
  const hash = bcrypt.hashSync(String(newPin), SALT_ROUNDS);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('pin_hash', ?)").run(hash);

  return { success: true };
}

function resetPin(recoveryKey) {
  if (!recoveryKey || typeof recoveryKey !== 'string') {
    throw new Error('Nieprawidłowy klucz odzyskiwania.');
  }

  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'recovery_hash'").get();
  if (!row) throw new Error('Brak klucza odzyskiwania w bazie.');

  const match = bcrypt.compareSync(recoveryKey.trim(), row.value);
  if (!match) throw new Error('Klucz odzyskiwania jest nieprawidłowy.');

  // Remove PIN — force re-setup on next launch
  db.prepare("DELETE FROM settings WHERE key = 'pin_hash'").run();
  return { success: true };
}

function validatePinFormat(pin) {
  return /^\d{4,8}$/.test(String(pin));
}

module.exports = { isSetup, setup, verify, changePin, resetPin };

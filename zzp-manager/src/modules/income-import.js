'use strict';

const fs = require('fs');
const { getDb } = require('../database/db');

// ── CSV helpers ────────────────────────────────────────────────
function prepareCSV(filePath) {
  let raw = fs.readFileSync(filePath, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip BOM
  const sample = raw.slice(0, 3000);
  const tabCount  = (sample.match(/\t/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  const commaCount= (sample.match(/,/g) || []).length;
  const sep = tabCount > commaCount ? '\t' : semiCount > commaCount * 0.8 ? ';' : ',';
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  return { lines, sep };
}

function parseRow(line, sep) {
  const cells = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === sep && !inQ) {
      cells.push(cur.trim()); cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function nh(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Platform detection ──────────────────────────────────────────
function detectPlatform(headers) {
  const hs = headers.map(nh);
  const raw = headers.join(' ').toLowerCase();

  // Upwork: "Ref ID", "Team/Contract", "Amount" columns
  if (hs.some(h => h === 'refid') || raw.includes('upwork') ||
      hs.some(h => h.includes('teamcontract') || h.includes('agencycontract'))) return 'upwork';

  // Fiverr: "Cleared", "Order ID", "Activity"
  if (raw.includes('fiverr') ||
      hs.some(h => h === 'cleared') ||
      (hs.some(h => h.includes('orderid')) && hs.some(h => h.includes('activity')))) return 'fiverr';

  // PayPal: "TimeZone", "Name", "Type", "Status", "Currency"
  if (hs.includes('timezone') || hs.includes('timezonetype') ||
      (hs.includes('name') && hs.includes('type') && hs.includes('status') && hs.includes('currency'))) return 'paypal';

  // Stripe: "id", "customer_description", "amount", "fee"
  if ((hs.includes('id') && hs.some(h => h.includes('customerdesc') || h === 'fee')) ||
      hs.some(h => h === 'statementdescriptor') || raw.includes('stripe')) return 'stripe';

  return 'generic';
}

// ── Amount / date parsing ───────────────────────────────────────
function parseAmount(s) {
  if (s === undefined || s === null) return 0;
  let str = String(s).trim();
  // Remove currency symbols and spaces
  str = str.replace(/[€$£¥\s]/g, '').replace(/[^\d.,'+-]/g, '');
  if (!str) return 0;
  // European: 1.234,56
  if (/\d{1,3}(\.\d{3})+,\d{1,2}$/.test(str)) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // US: 1,234.56
  if (/\d{1,3}(,\d{3})+\.\d{1,2}$/.test(str)) {
    return parseFloat(str.replace(/,/g, '')) || 0;
  }
  // Plain decimal with comma
  if (/^\d+,\d{1,2}$/.test(str)) return parseFloat(str.replace(',', '.')) || 0;
  return parseFloat(str) || 0;
}

function parseDate(s) {
  if (!s) return null;
  s = s.trim().replace(/^"|"$/g, '');
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  m = s.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

  // Month DD, YYYY  e.g. "Jan 15, 2024" or "January 15 2024"
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,
                     sep:9,oct:10,nov:11,dec:12 };
    const mo = months[m[1].toLowerCase().slice(0,3)];
    if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }

  return null;
}

// ── Auto-detect column mapping ──────────────────────────────────
function autoDetectColumns(headers) {
  const hs = headers.map(nh);
  let dateCol=-1, amountCol=-1, descCol=-1, currencyCol=-1;

  const DATE_KEYS    = ['date','datum','dat','created','createdutc','settlementdate','clearingdate','transactiondate'];
  const AMOUNT_KEYS  = ['amount','earnings','revenue','netto','bedrag','income','netearning','total','cleared','grossearning'];
  const DESC_KEYS    = ['description','desc','service','activity','type','omschrijving','details','memo','subject','productservice'];
  const CUR_KEYS     = ['currency','valuta','cur'];

  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    if (dateCol < 0    && DATE_KEYS.some(k => h === k || h.startsWith(k)))   dateCol   = i;
    if (amountCol < 0  && AMOUNT_KEYS.some(k => h === k || h.includes(k)))   amountCol = i;
    if (descCol < 0    && DESC_KEYS.some(k => h === k || h.includes(k)))     descCol   = i;
    if (currencyCol < 0 && CUR_KEYS.some(k => h === k || h.includes(k)))    currencyCol = i;
  }

  return { dateCol, amountCol, descCol, currencyCol };
}

// ── Public: analyze CSV (called first to get mapping preview) ──
function analyzeCSV(filePath) {
  const { lines, sep } = prepareCSV(filePath);
  if (!lines.length) throw new Error('Plik jest pusty.');

  const headers = parseRow(lines[0], sep);
  const platform = detectPlatform(headers);
  const auto = autoDetectColumns(headers);

  // Sample rows (up to 5 non-empty)
  const sampleRows = [];
  for (let i = 1; i < Math.min(lines.length, 8); i++) {
    const row = parseRow(lines[i], sep);
    if (row.some(c => c)) sampleRows.push(row);
    if (sampleRows.length >= 5) break;
  }

  const totalDataRows = lines.length - 1;

  return {
    headers,
    platform,
    sampleRows,
    sep,
    totalRows: totalDataRows,
    ...auto
  };
}

// ── Public: import CSV into income_entries ──────────────────────
function importCSV(filePath, mapping) {
  /*
   * mapping: {
   *   dateCol: number,
   *   amountCol: number,
   *   descCol: number,          // -1 = not mapped
   *   currencyCol: number,      // -1 = not mapped
   *   defaultCurrency: string,  // used when currencyCol = -1
   *   source: string,           // e.g. "Upwork", "Fiverr", "Custom"
   *   skipNegative: boolean,    // skip rows with negative amounts
   *   skipHeader: boolean       // skip first line (default true)
   * }
   */
  const { lines, sep } = prepareCSV(filePath);
  const db = getDb();

  let imported = 0, skipped = 0;

  db.transaction(() => {
    const startLine = mapping.skipHeader !== false ? 1 : 1; // always skip header
    for (let i = startLine; i < lines.length; i++) {
      const row = parseRow(lines[i], sep);
      if (!row.length || row.every(c => !c)) continue;

      // Date
      const rawDate = row[mapping.dateCol] ?? '';
      const dateStr = parseDate(rawDate);
      if (!dateStr) { skipped++; continue; }

      // Amount
      const rawAmt = row[mapping.amountCol] ?? '0';
      const amount = parseAmount(rawAmt);
      if (!isFinite(amount)) { skipped++; continue; }
      if (mapping.skipNegative !== false && amount < 0) { skipped++; continue; }
      if (amount === 0) { skipped++; continue; }

      // Description
      const description = (mapping.descCol >= 0 && row[mapping.descCol])
        ? row[mapping.descCol]
        : (mapping.source || 'Import');

      // Currency
      const currency = (mapping.currencyCol >= 0 && row[mapping.currencyCol]?.trim())
        ? row[mapping.currencyCol].trim().toUpperCase()
        : (mapping.defaultCurrency || 'EUR');

      // Exchange rate: leave as 1:1 — user can adjust in reports
      const exchangeRate = 1;
      const amountEur = amount * exchangeRate;

      db.prepare(`
        INSERT INTO income_entries
          (source, description, amount, currency, exchange_rate, amount_eur, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        mapping.source || 'Import',
        description,
        amount,
        currency,
        exchangeRate,
        amountEur,
        dateStr
      );
      imported++;
    }
  })();

  return { imported, skipped };
}

module.exports = { analyzeCSV, importCSV };

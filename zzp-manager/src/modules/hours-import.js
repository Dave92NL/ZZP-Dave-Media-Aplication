'use strict';

/**
 * hours-import.js
 *
 * Import godzinówki (rejestru czasu) z eksportów efaktura.nl:
 *   - PDF: eksport "POBIERZ GODZINY" (priorytet — to oddaje efaktura)
 *   - XML: best-effort, jeśli w pliku są rozpoznawalne wpisy
 *
 * Każdy wpis mapowany na time_entries:
 *   { date, description, duration_minutes, start_time, end_time,
 *     _clientName, _break_minutes, source }
 *
 * Parser PDF jest tolerancyjny: dzieli tekst na bloki po datach i z każdego
 * bloku wyciąga czas netto, przerwę i opis. Cokolwiek nierozpoznane trafia do
 * podglądu jako wpis "do uzupełnienia" (duration = 0), a nie twardy błąd.
 */

const fs = require('fs');
const path = require('path');
const { getDb } = require('../database/db');

// ── Nazwy miesięcy (PL dopełniacz + NL) → numer ─────────────────────────────
const MONTHS = {
  // polski (formy z daty: "29 czerwca")
  stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
  lipca: 7, sierpnia: 8, września: 9, wrzesnia: 9, października: 10, pazdziernika: 10,
  listopada: 11, grudnia: 12,
  // polski mianownik (nagłówki)
  styczeń: 1, styczen: 1, luty: 2, marzec: 3, kwiecień: 4, kwiecien: 4, maj: 5,
  czerwiec: 6, lipiec: 7, sierpień: 8, sierpien: 8, wrzesień: 9, wrzesien: 9,
  październik: 10, pazdziernik: 10, listopad: 11, grudzień: 12, grudzien: 12,
  // niderlandzki
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7,
  augustus: 8, september: 9, oktober: 10, november: 11, december: 12
};

// ── Public: analiza plików ──────────────────────────────────────────────────
async function parseFiles(filePaths) {
  const results = [];
  for (const fp of filePaths) {
    try {
      const ext = path.extname(fp).toLowerCase();
      let entries;
      if (ext === '.pdf') entries = await _parsePDF(fp);
      else if (ext === '.xml') entries = _parseXML(fp);
      else {
        results.push({ file: fp, basename: path.basename(fp), status: 'error', data: [], error: 'Nieobsługiwany format (tylko .pdf i .xml)' });
        continue;
      }

      if (!entries.length) {
        results.push({ file: fp, basename: path.basename(fp), status: 'error', data: [], error: 'Nie znaleziono wpisów godzin w pliku' });
        continue;
      }

      // Ostrzeżenia zbiorczo dla pliku
      const needsFix = entries.filter(e => !e.duration_minutes).length;
      results.push({
        file: fp,
        basename: path.basename(fp),
        status: needsFix ? 'warn' : 'ok',
        data: entries,
        warnings: needsFix ? [`${needsFix} wpis(ów) bez rozpoznanego czasu — uzupełnij po imporcie`] : [],
        error: null
      });
    } catch (err) {
      results.push({ file: fp, basename: path.basename(fp), status: 'error', data: [], error: err.message });
    }
  }
  return results;
}

// ── PDF ─────────────────────────────────────────────────────────────────────
async function _parsePDF(filePath) {
  const pdfParse = require('pdf-parse');
  let text = '';
  try {
    const buffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buffer, { version: 'v1.10.100' });
    text = pdfData.text || '';
  } catch (_) { /* skan / brak warstwy tekstu */ }

  if (!text.trim()) return []; // brak tekstu — nic nie zwracamy (plik → error)
  return parseHoursText(text);
}

function _matchToDate(m, fallbackYear) {
  if (m[1]) return m[1]; // yyyy-mm-dd
  if (m[2]) {            // dd-mm-yyyy
    const [d, mo, y] = m[2].split(/[-/.]/);
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (m[3] && m[4]) {    // "29 czerwca [2026]"
    const mon = MONTHS[m[4].toLowerCase()];
    if (!mon) return null;
    const year = m[5] ? Number(m[5]) : fallbackYear;
    return `${year}-${String(mon).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  return null;
}

function _parseBlock(block, date) {
  // Zakres czasu: "08:00 - 14:15" / "08:00 tot 14:15" / "08:00 do 14:15" / "13:00–18:00"
  const range = block.match(/(\d{1,2}):(\d{2})\s*(?:-|–|to|tot|do|t\/m)\s*(\d{1,2}):(\d{2})/i);
  // Przerwa: "(00:45 przerwy)" / "(00:45 pauze)" / "(00:45h)"
  const breakM = block.match(/\(\s*(\d{1,2}):(\d{2})(?:h|m)?(?:\s*(?:przerw\w*|pauze?))?\s*\)/i);
  // Czas netto — kolejność priorytetu:
  //  1. z jednostką: "05:30 uur" / "05:30 godzin" / "5,5 uur" / "5 hrs"
  //  2. "HH:MM h" (efaktura, np. "02:15h") — bierzemy OSTATNie takie w bloku (netto po zakresie)
  //  3. "Nh Nm"
  // (?<!\() pomija wartości w nawiasach, np. przerwę "(00:45h)".
  const netByUnit = block.match(/(?<!\()\b(\d{1,2}(?::\d{2}|[.,]\d{1,2})?)\s*(?:godzin\w*|uur|u\.|hours?|hrs?)\b/i);
  const colonHmatches = [...block.matchAll(/(?<!\()\b(\d{1,2}):(\d{2})\s*h\b/gi)];
  const netByHM = block.match(/(?:^|[\s\n])(\d+)\s*h(?:ours?)?(?:\s*(\d+)\s*m(?:in(?:utes?)?)?)?/i);

  const breakMin = breakM ? (Number(breakM[1]) * 60 + Number(breakM[2])) : 0;

  let durationMin = 0;
  let startTime = null, endTime = null;
  let netValue = null;
  if (netByUnit) netValue = netByUnit[1];
  else if (colonHmatches.length) {
    const last = colonHmatches[colonHmatches.length - 1];
    netValue = `${last[1]}:${last[2]}`;
  } else if (netByHM) {
    netValue = `${netByHM[1]}h${netByHM[2] ? `${netByHM[2]}m` : ''}`;
  }

  if (netValue !== null) {
    durationMin = _parseDurationValue(netValue);
  } else if (range) {
    const startMin = Number(range[1]) * 60 + Number(range[2]);
    const endMin = Number(range[3]) * 60 + Number(range[4]);
    durationMin = Math.max(0, endMin - startMin - breakMin);
  }
  if (range) {
    startTime = `${date}T${String(range[1]).padStart(2,'0')}:${range[2]}:00`;
    endTime = `${date}T${String(range[3]).padStart(2,'0')}:${range[4]}:00`;
  }

  // Opis + klient: linie tekstowe (bez samych liczb/godzin/dni tygodnia)
  const WEEKDAYS = /^(poniedzia\w+|wtorek|środa|sroda|czwartek|piątek|piatek|sobota|niedziela|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/i;
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => !/^\d/.test(l) && !WEEKDAYS.test(l) && !/godzin|uur|przerw|pauze|^\d{1,2}:\d{2}h$/i.test(l));

  const SUMMARY_LINE = /^(?:aantal uren|total(?:e|a)? uren|liczba godzin|suma|razem|sum|total hours|hours total)\b/i;
  const cleanedLines = lines
    .map(l => l.replace(/[|•\-–—]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(l => l.length > 2 && !SUMMARY_LINE.test(l) && !/^(op(?:\s|$)|tot(?:\s|$)|van(?:\s|$)|do(?:\s|$)|t\/m(?:\s|$))/i.test(l));

  const description = cleanedLines.join(' ').slice(0, 300) || 'Import godzin';
  const clientName = cleanedLines[0] || '';

  return {
    date,
    description,
    duration_minutes: durationMin,
    break_minutes: breakMin,
    start_time: startTime,
    end_time: endTime,
    _clientName: clientName,
    source: 'pdf'
  };
}

// ── XML (best-effort) ───────────────────────────────────────────────────────
function _parseXML(filePath) {
  const xml = fs.readFileSync(filePath, 'utf-8');
  const { XMLParser } = require('fast-xml-parser');
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: true });
  const root = parser.parse(xml);

  // Zbierz wszystkie obiekty mające pole daty i czegoś godzinowego
  const found = [];
  _walk(root, (obj) => {
    const date = _pickDate(obj);
    const dur = _pickDuration(obj);
    if (date && dur != null) {
      found.push({
        date,
        description: String(obj.description || obj.omschrijving || obj.opis || obj.note || '').trim() || 'Import godzin',
        duration_minutes: dur,
        break_minutes: 0,
        start_time: null, end_time: null,
        _clientName: String(obj.client || obj.klant || obj.customer || '').trim(),
        source: 'xml'
      });
    }
  });
  return found;
}

function _walk(node, fn, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  fn(node);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach(x => _walk(x, fn, depth + 1));
    else if (v && typeof v === 'object') _walk(v, fn, depth + 1);
  }
}

function _pickDate(obj) {
  for (const k of ['date', 'datum', 'data', 'Date', 'IssueDate']) {
    if (obj[k]) {
      const s = String(obj[k]).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
      if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
  }
  return null;
}

function _pickDuration(obj) {
  for (const k of ['minutes', 'duration_minutes', 'minuten']) {
    if (obj[k] != null && !isNaN(obj[k])) return Math.round(Number(obj[k]));
  }
  for (const k of ['hours', 'uren', 'godziny', 'duration', 'uur']) {
    if (obj[k] != null) {
      const s = String(obj[k]).trim();
      const hm = s.match(/^(\d{1,2}):(\d{2})$/);
      if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
      if (!isNaN(s)) return Math.round(Number(s) * 60);
    }
  }
  return null;
}

// ── Public: import do time_entries ──────────────────────────────────────────
async function importHours(items, options = {}) {
  const db = getDb();
  const timeTracking = require('./time-tracking');
  const category = options.category || 'Inne';
  const isBillable = options.is_billable !== false;

  // dopasowanie projektu po nazwie klienta (opcjonalne)
  const projects = db.prepare('SELECT id, name FROM projects').all();
  const findProject = (clientName) => {
    if (!clientName) return null;
    const n = clientName.trim().toLowerCase();
    const p = projects.find(x => String(x.name || '').toLowerCase().includes(n) || n.includes(String(x.name || '').toLowerCase()));
    return p ? p.id : null;
  };

  let imported = 0, skipped = 0;
  const errors = [];

  for (const it of items) {
    if (!it || it.status === 'error' || !Array.isArray(it.data)) { skipped++; continue; }
    for (const e of it.data) {
      try {
        if (!e.date) { skipped++; continue; }
        timeTracking.create({
          project_id: options.project_id || findProject(e._clientName) || null,
          category,
          description: e.description || '',
          start_time: e.start_time || null,
          end_time: e.end_time || null,
          duration_minutes: e.duration_minutes || 0,
          is_billable: isBillable,
          date: e.date
        });
        imported++;
      } catch (err) {
        errors.push({ file: it.basename, error: err.message });
        skipped++;
      }
    }
  }
  return { imported, skipped, errors };
}

/**
 * Dzieli tekst na bloki wg wykrytych dat i z każdego wyciąga jeden wpis.
 * Wspiera daty: 29-06-2026 / 2026-06-29 oraz "29 czerwca 2026" / "29 juni".
 * Rok bez jawnej daty bierze z parametru albo z nagłówka typu "Lipiec 2026".
 */
function parseHoursText(text, fallbackYear = null) {
  const yearHeader = text.match(/\b(20\d{2})\b/);
  const year = fallbackYear || (yearHeader ? Number(yearHeader[1]) : new Date().getFullYear());
  const dateRx = /(\d{4}-\d{2}-\d{2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})|(\d{1,2})\s+([a-ząćęłńóśźżäöü]+)(?:\s+(20\d{2}))?/gi;
  const anchors = [];
  let m;
  while ((m = dateRx.exec(text)) !== null) {
    const iso = _matchToDate(m, year);
    if (iso) anchors.push({ index: m.index, date: iso });
  }
  if (!anchors.length) return [];

  const entries = [];
  for (let i = 0; i < anchors.length; i++) {
    const block = text.slice(anchors[i].index, anchors[i + 1] ? anchors[i + 1].index : undefined);
    const entry = _parseBlock(block, anchors[i].date);
    if (entry) entries.push(entry);
  }
  return entries;
}

function _parseDurationValue(value) {
  const raw = String(value || '').trim().replace(/\s+/g, '');
  if (!raw) return 0;
  const normalized = raw.replace(',', '.');
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Math.round(Number(normalized) * 60);
  }
  const hm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const hmText = raw.match(/^(\d+)h(?:ours?)?(?:(\d+)m(?:in(?:utes?)?)?)?$/i);
  if (hmText) {
    return Number(hmText[1]) * 60 + Number(hmText[2] || 0);
  }
  return 0;
}

module.exports = { parseFiles, parseHoursText, importHours };

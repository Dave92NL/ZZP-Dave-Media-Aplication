import { navigate } from '../router.js';
import { escHtml, todayStr } from '../lib/format.js';
import { icon } from '../lib/icons.js';
import * as repo from '../data/repo.js';
import { buildCloudBackup } from '../data/backup.js';

const LABELS = {
  clients: 'Klienci',
  projects: 'Projekty',
  invoices: 'Faktury',
  invoice_items: 'Pozycje faktur',
  expenses: 'Koszty',
  time_entries: 'Czas pracy',
  mileage_entries: 'Kilometrówka'
};

// Średnik + BOM: Excel (PL/NL) otwiera plik od razu w kolumnach i z polskimi znakami.
const cell = (v) => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function toCsv(rows) {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return '﻿' + [cols.join(';'), ...rows.map(r => cols.map(c => cell(r[c])).join(';'))].join('\r\n');
}

// Pliki trzymamy w scope modułu — share() musi iść synchronicznie w geście (iOS).
let _files = [];

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <button class="btn btn-secondary btn-sm back-btn" id="ex-back">${icon('arrowLeft', { size: 16 })} Wróć</button>
      <h1 class="page-title">Eksport danych</h1>
      <div class="info-box">Tworzy osobny plik <strong>CSV</strong> (Excel) dla każdej tabeli:
        klienci, projekty, faktury, koszty, czas pracy i kilometrówka. Dla pełnej kopii do
        przywrócenia użyj „Kopia zapasowa".</div>
      <div id="ex-offline" class="error-msg hidden">⚠️ Eksport wymaga połączenia z internetem.</div>
      <button class="btn btn-primary btn-block" id="ex-create">📄 Przygotuj pliki CSV</button>
      <button class="btn btn-accent-blue btn-block hidden" id="ex-share" style="margin-top:10px">📤 Udostępnij / zapisz pliki</button>
      <div id="ex-status" class="info-box hidden" style="margin-top:14px"></div>
    </div>`;

  document.getElementById('ex-back').addEventListener('click', () => navigate('more'));
  const createBtn = document.getElementById('ex-create');
  const shareBtn = document.getElementById('ex-share');
  const statusEl = document.getElementById('ex-status');
  const setStatus = (html) => { statusEl.innerHTML = html; statusEl.classList.remove('hidden'); };

  if (!repo.isOnline()) {
    document.getElementById('ex-offline').classList.remove('hidden');
    createBtn.disabled = true;
  }

  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    createBtn.textContent = '⏳ Przygotowanie…';
    try {
      const b = await buildCloudBackup();
      _files = Object.keys(LABELS)
        .filter(t => b.tables[t]?.length)
        .map(t => new File([toCsv(b.tables[t])], `zzp-${t}-${todayStr()}.csv`, { type: 'text/csv' }));
      if (!_files.length) throw new Error('Brak danych do wyeksportowania.');
      setStatus(`✅ Gotowe pliki (${_files.length}):<br>${_files.map(f => escHtml(f.name)).join('<br>')}`);
      shareBtn.classList.remove('hidden');
      createBtn.classList.add('hidden');
    } catch (err) {
      setStatus(`⚠️ ${escHtml(err.message)}`);
      createBtn.disabled = false;
      createBtn.textContent = '📄 Przygotuj pliki CSV';
    }
  });

  shareBtn.addEventListener('click', async () => {
    if (!_files.length) return;
    if (navigator.canShare && navigator.canShare({ files: _files })) {
      try {
        await navigator.share({ files: _files, title: 'Eksport danych ZZP' });
        setStatus('✅ Udostępniono.');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') { setStatus('Anulowano udostępnianie.'); return; }
      }
    }
    // Fallback: pobierz pliki po kolei.
    _files.forEach((f, i) => setTimeout(() => {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url; a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, i * 400));
    setStatus('⬇️ Pliki pobrane na telefon.');
  });
}

import { navigate } from '../router.js';
import { escHtml, todayStr } from '../lib/format.js';
import { icon } from '../lib/icons.js';
import * as repo from '../data/repo.js';
import { buildCloudBackup } from '../data/backup.js';

const TABLE_LABELS = {
  clients: 'Klienci',
  projects: 'Projekty',
  invoices: 'Faktury',
  invoice_items: 'Pozycje faktur',
  expenses: 'Koszty',
  time_entries: 'Wpisy czasu pracy',
  mileage_entries: 'Przejazdy (kilometrówka)'
};

// Przygotowany plik trzymamy w scope modułu, by „Udostępnij" wołało share()
// synchronicznie w geście użytkownika (wymóg iOS — bez await tuż przed share).
let _file = null;
let _filename = '';

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <button class="btn btn-secondary btn-sm back-btn" id="bk-back">${icon('arrowLeft', { size: 16 })} Wróć</button>
      <h1 class="page-title">Kopia zapasowa</h1>

      <div class="info-box">
        Tworzy plik <strong>JSON</strong> ze wszystkimi danymi z chmury: klienci, projekty,
        faktury (z pozycjami), koszty, czas pracy i kilometrówka. Plik zapiszesz na telefonie
        i wyślesz na <strong>Google Drive</strong>. Zdjęcia/PDF paragonów zostają bezpiecznie
        w chmurze (w kopii jest do nich odnośnik).
      </div>

      <div id="bk-offline" class="error-msg hidden">⚠️ Kopia zapasowa wymaga połączenia z internetem.</div>

      <button class="btn btn-primary btn-block" id="bk-create">💾 Utwórz kopię zapasową</button>
      <button class="btn btn-accent-blue btn-block hidden" id="bk-share" style="margin-top:10px">📤 Udostępnij / zapisz plik</button>

      <div id="bk-status" class="info-box hidden" style="margin-top:14px"></div>
      <div id="bk-summary"></div>
    </div>
  `;

  document.getElementById('bk-back').addEventListener('click', () => navigate('more'));

  const createBtn = document.getElementById('bk-create');
  const shareBtn = document.getElementById('bk-share');
  const statusEl = document.getElementById('bk-status');
  const summaryEl = document.getElementById('bk-summary');

  if (!repo.isOnline()) {
    document.getElementById('bk-offline').classList.remove('hidden');
    createBtn.disabled = true;
  }

  const setStatus = (html) => { statusEl.innerHTML = html; statusEl.classList.remove('hidden'); };

  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    createBtn.textContent = '⏳ Tworzenie kopii…';
    statusEl.classList.add('hidden');
    summaryEl.innerHTML = '';
    try {
      const backup = await buildCloudBackup();
      const json = JSON.stringify(backup, null, 2);
      _filename = `zzp-kopia-${todayStr()}.json`;
      _file = new File([json], _filename, { type: 'application/json' });

      // Podsumowanie liczby rekordów
      const rows = Object.keys(TABLE_LABELS).map(t =>
        `<div class="totals-row"><span>${TABLE_LABELS[t]}</span><span>${backup.counts[t] ?? 0}</span></div>`
      ).join('');
      summaryEl.innerHTML = `
        <h3 class="section-title">Zawartość kopii</h3>
        <div class="detail-block">
          ${rows}
          <div class="totals-row totals-row-total"><span>Razem rekordów</span><span>${backup.total}</span></div>
        </div>`;

      const errNote = backup.errors
        ? ` <span class="text-danger">(część tabel z błędem: ${escHtml(Object.keys(backup.errors).join(', '))})</span>`
        : '';
      setStatus(`✅ Kopia gotowa: <strong>${escHtml(_filename)}</strong> — ${backup.total} rekordów.${errNote}<br>Kliknij „Udostępnij / zapisz plik", aby wysłać na Google Drive.`);
      shareBtn.classList.remove('hidden');
      createBtn.classList.add('hidden');
    } catch (err) {
      setStatus(`⚠️ Nie udało się utworzyć kopii: ${escHtml(err.message)}`);
      createBtn.disabled = false;
      createBtn.textContent = '💾 Utwórz kopię zapasową';
    }
  });

  shareBtn.addEventListener('click', async () => {
    if (!_file) return;
    // Web Share z plikiem (arkusz udostępniania telefonu → Google Drive)
    if (navigator.canShare && navigator.canShare({ files: [_file] })) {
      try {
        await navigator.share({ files: [_file], title: 'Kopia zapasowa ZZP' });
        setStatus('✅ Udostępniono — wybierz Google Drive na liście aplikacji.');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') { setStatus('Anulowano udostępnianie.'); return; }
        // inny błąd — spróbuj pobrać plik
      }
    }
    // Fallback: pobranie pliku (potem ręcznie wgrać na Google Drive)
    const url = URL.createObjectURL(_file);
    const a = document.createElement('a');
    a.href = url;
    a.download = _filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus('⬇️ Plik pobrany na telefon — otwórz go i wyślij na Google Drive (Udostępnij → Dysk).');
  });
}

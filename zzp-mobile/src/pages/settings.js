import { navigate } from '../router.js';
import { escHtml } from '../lib/format.js';
import { icon } from '../lib/icons.js';
import { getSettings, saveSettings, getCompany, refreshCompany } from '../data/settings.js';

const field = (id, label, value, type = 'text', ph = '') =>
  `<div class="form-group"><label>${label}</label><input type="${type}" id="${id}" value="${escHtml(value || '')}" placeholder="${escHtml(ph)}"></div>`;

// Wiersz „tylko do odczytu" — pokazuje wartość z komputera; puste pola pomijamy.
const row = (label, value) =>
  value
    ? `<div class="totals-row"><span>${escHtml(label)}</span><strong>${escHtml(value)}</strong></div>`
    : '';

function companyBlock(co) {
  const c = co || {};
  const addr = [c.postcode, c.city].filter(Boolean).join(' ');
  const rows = [
    row('Nazwa firmy', c.name),
    row('Adres', c.address),
    row('Kod / miasto', addr),
    row('Kraj', c.country),
    row('KvK', c.kvk_number),
    row('BTW', c.btw_number),
    row('IBAN', c.iban),
    row('E-mail', c.email),
    row('Telefon', c.phone)
  ].join('');

  if (!rows) {
    return `<div class="info-box">Brak danych firmy. Uruchom synchronizację w aplikacji na
      komputerze (Ustawienia → Synchronizacja), aby przesłać dane sprzedawcy na telefon.</div>`;
  }
  return `<div class="detail-block">${rows}</div>`;
}

export async function load() {
  const el = document.getElementById('page-content');
  const s = await getSettings();
  const co = await getCompany();

  el.innerHTML = `
    <div class="page">
      <button class="btn btn-secondary btn-sm back-btn" id="set-back">${icon('arrowLeft', { size: 16 })} Wróć</button>
      <h1 class="page-title">Ustawienia</h1>

      <div class="card-form">
        <div class="edit-form-title">👤 Profil</div>
        ${field('set-name', 'Nazwa użytkownika (powitanie)', s.displayName, 'text', 'np. Dawid')}
        <div class="info-box" style="margin-top:8px">Nazwa użytkownika jest zapisywana
        <strong>lokalnie na tym urządzeniu</strong> i pojawia się w powitaniu na pulpicie.</div>
      </div>

      <div class="card-form">
        <div class="edit-form-title">🏢 Dane firmy (podgląd faktury)</div>
        <div class="info-box">Dane firmy są <strong>pobierane z aplikacji na komputerze</strong>.
        Edytuj je tam (Ustawienia → Dane firmy) i uruchom synchronizację — telefon je odczyta.</div>
        <div id="set-company">${companyBlock(co)}</div>
        <button class="btn btn-secondary btn-block" id="set-refresh" style="margin-top:12px">🔄 Odśwież z komputera</button>
      </div>

      <button class="btn btn-primary btn-block" id="set-save">💾 Zapisz</button>
      <div id="set-status" class="info-box hidden" style="margin-top:12px"></div>
    </div>
  `;

  document.getElementById('set-back').addEventListener('click', () => navigate('more'));

  document.getElementById('set-refresh').addEventListener('click', async () => {
    const btn = document.getElementById('set-refresh');
    btn.disabled = true; btn.textContent = '⏳ Pobieranie…';
    try {
      const fresh = await refreshCompany();
      document.getElementById('set-company').innerHTML = companyBlock(fresh);
    } catch { /* offline / błąd → zostaje poprzedni widok */ }
    finally { btn.disabled = false; btn.textContent = '🔄 Odśwież z komputera'; }
  });

  document.getElementById('set-save').addEventListener('click', async () => {
    const btn = document.getElementById('set-save');
    const status = document.getElementById('set-status');
    btn.disabled = true; btn.textContent = '⏳ Zapisywanie…';
    try {
      await saveSettings({ displayName: document.getElementById('set-name').value.trim() });
      status.textContent = '✅ Zapisano. Nazwa widoczna w powitaniu na pulpicie.';
      status.classList.remove('hidden');
    } catch (err) {
      status.textContent = '⚠️ Nie udało się zapisać: ' + err.message;
      status.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = '💾 Zapisz';
    }
  });
}

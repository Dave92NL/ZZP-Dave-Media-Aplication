import { navigate } from '../router.js';
import { escHtml } from '../lib/format.js';
import { icon } from '../lib/icons.js';
import { getSettings, saveSettings } from '../data/settings.js';

const field = (id, label, value, type = 'text', ph = '') =>
  `<div class="form-group"><label>${label}</label><input type="${type}" id="${id}" value="${escHtml(value || '')}" placeholder="${escHtml(ph)}"></div>`;

export async function load() {
  const el = document.getElementById('page-content');
  const s = await getSettings();
  const c = s.company || {};

  el.innerHTML = `
    <div class="page">
      <button class="btn btn-secondary btn-sm back-btn" id="set-back">${icon('arrowLeft', { size: 16 })} Wróć</button>
      <h1 class="page-title">Ustawienia</h1>

      <div class="info-box">Ustawienia są zapisywane <strong>lokalnie na tym urządzeniu</strong> (nie w chmurze).
      Nazwa użytkownika pojawia się w powitaniu na pulpicie, a dane firmy — w podglądzie dokumentu faktury.</div>

      <div class="card-form">
        <div class="edit-form-title">👤 Profil</div>
        ${field('set-name', 'Nazwa użytkownika (powitanie)', s.displayName, 'text', 'np. Dawid')}
      </div>

      <div class="card-form">
        <div class="edit-form-title">🏢 Dane firmy (podgląd faktury)</div>
        ${field('set-co-name', 'Nazwa firmy', c.name, 'text', 'np. Dave Media YT')}
        ${field('set-co-address', 'Adres', c.address, 'text', 'np. Voorbeeldstraat 1')}
        <div class="form-grid-2">
          ${field('set-co-postcode', 'Kod pocztowy', c.postcode, 'text', '1234 AB')}
          ${field('set-co-city', 'Miasto', c.city, 'text', 'Amsterdam')}
        </div>
        ${field('set-co-country', 'Kraj', c.country, 'text', 'Nederland')}
        <div class="form-grid-2">
          ${field('set-co-kvk', 'KvK', c.kvk_number, 'text', 'numer KvK')}
          ${field('set-co-btw', 'BTW', c.btw_number, 'text', 'NL…B..')}
        </div>
        ${field('set-co-iban', 'IBAN', c.iban, 'text', 'NL00 BANK 0000 0000 00')}
        <div class="form-grid-2">
          ${field('set-co-email', 'E-mail', c.email, 'email', 'firma@example.com')}
          ${field('set-co-phone', 'Telefon', c.phone, 'tel', '+31 6 …')}
        </div>
      </div>

      <button class="btn btn-primary btn-block" id="set-save">💾 Zapisz ustawienia</button>
      <div id="set-status" class="info-box hidden" style="margin-top:12px"></div>
    </div>
  `;

  document.getElementById('set-back').addEventListener('click', () => navigate('more'));

  document.getElementById('set-save').addEventListener('click', async () => {
    const btn = document.getElementById('set-save');
    const status = document.getElementById('set-status');
    const v = (id) => document.getElementById(id).value.trim();
    btn.disabled = true; btn.textContent = '⏳ Zapisywanie…';
    try {
      await saveSettings({
        displayName: v('set-name'),
        company: {
          name: v('set-co-name'),
          address: v('set-co-address'),
          postcode: v('set-co-postcode'),
          city: v('set-co-city'),
          country: v('set-co-country'),
          kvk_number: v('set-co-kvk'),
          btw_number: v('set-co-btw'),
          iban: v('set-co-iban'),
          email: v('set-co-email'),
          phone: v('set-co-phone')
        }
      });
      status.textContent = '✅ Zapisano. Zmiany widoczne na pulpicie i w podglądzie faktury.';
      status.classList.remove('hidden');
    } catch (err) {
      status.textContent = '⚠️ Nie udało się zapisać: ' + err.message;
      status.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = '💾 Zapisz ustawienia';
    }
  });
}

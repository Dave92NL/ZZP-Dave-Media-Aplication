import { escHtml } from '../lib/format.js';
import { navigate } from '../router.js';
import * as repo from '../data/repo.js';

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <div class="page-head">
        <h1 class="page-title">👤 Klienci</h1>
        <button class="btn btn-primary btn-sm" id="cl-add-btn">+ Nowy</button>
      </div>

      <div id="cl-form" class="card-form hidden">
        <div class="form-group"><label>Nazwa *</label><input type="text" id="cl-name" placeholder="Imię i nazwisko lub firma"></div>
        <div class="form-group"><label>Firma (opcjonalnie)</label><input type="text" id="cl-company"></div>
        <div class="form-grid-2">
          <div class="form-group"><label>Miasto</label><input type="text" id="cl-city"></div>
          <div class="form-group"><label>Kraj</label><input type="text" id="cl-country" value="Nederland"></div>
        </div>
        <div class="form-group"><label>E-mail</label><input type="email" id="cl-email"></div>
        <div class="form-group"><label>Numer VAT / BTW</label><input type="text" id="cl-vat" placeholder="np. NL..."></div>
        <div id="cl-error" class="error-msg hidden"></div>
        <button class="btn btn-primary btn-block" id="cl-save-btn">💾 Zapisz klienta</button>
      </div>

      <div id="cl-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;

  const form = document.getElementById('cl-form');
  document.getElementById('cl-add-btn').addEventListener('click', () => form.classList.toggle('hidden'));
  document.getElementById('cl-save-btn').addEventListener('click', _save);

  await _renderList();
}

async function _renderList() {
  const wrap = document.getElementById('cl-list-wrap');
  try {
    const data = await repo.listAllClients();
    if (!data.length) { wrap.innerHTML = '<p class="text-muted">Brak klientów.</p>'; return; }

    wrap.innerHTML = data.map(c => `
      <div class="list-card">
        <div class="list-card-header">
          <span>${escHtml(c.company_name || c.name)}</span>
          ${c._pending ? '<span class="badge badge-pending">⏳ oczekuje</span>'
            : `<span class="badge ${c.status === 'active' ? 'badge-success' : 'badge-muted'}">${c.status === 'active' ? 'aktywny' : 'nieaktywny'}</span>`}
        </div>
        <div class="list-card-body text-muted">
          ${escHtml([c.city, c.country].filter(Boolean).join(', ') || '—')}
          ${c.vat_number ? ' · BTW: ' + escHtml(c.vat_number) : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania klientów: ${escHtml(err.message)}</p>`;
  }
}

async function _save() {
  const name = document.getElementById('cl-name').value.trim();
  const errorEl = document.getElementById('cl-error');
  errorEl.classList.add('hidden');
  if (!name) { errorEl.textContent = 'Nazwa jest wymagana.'; errorEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('cl-save-btn');
  btn.disabled = true; btn.textContent = '⏳ Zapisywanie…';
  try {
    await repo.createClient({
      name,
      company_name: document.getElementById('cl-company').value.trim(),
      city: document.getElementById('cl-city').value.trim(),
      country: document.getElementById('cl-country').value.trim(),
      email: document.getElementById('cl-email').value.trim(),
      vat_number: document.getElementById('cl-vat').value.trim(),
      btw_rate: 0, btw_reverse_charge: false, currency: 'EUR', status: 'active', notes: ''
    });
    navigate('clients'); // przeładuj widok
  } catch (err) {
    errorEl.textContent = err.message; errorEl.classList.remove('hidden');
    btn.disabled = false; btn.textContent = '💾 Zapisz klienta';
  }
}

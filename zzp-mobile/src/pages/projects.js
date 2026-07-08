import { fmtEur, escHtml } from '../lib/format.js';
import { navigate } from '../router.js';
import * as repo from '../data/repo.js';

const STATUS = {
  active: { label: 'aktywny', cls: 'badge-success' },
  on_hold: { label: 'wstrzymany', cls: 'badge-muted' },
  done: { label: 'zakończony', cls: 'badge-info' }
};

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <div class="page-head">
        <h1 class="page-title">📁 Projekty</h1>
        <button class="btn btn-primary btn-sm" id="pr-add-btn">+ Nowy</button>
      </div>

      <div id="pr-form" class="card-form hidden">
        <div class="form-group"><label>Nazwa *</label><input type="text" id="pr-name" placeholder="np. Montaż — odcinek 12"></div>
        <div class="form-group">
          <label>Klient</label>
          <select id="pr-client"><option value="">— brak —</option></select>
        </div>
        <div class="form-group"><label>Opis</label><input type="text" id="pr-desc"></div>
        <div class="form-grid-2">
          <div class="form-group"><label>Stawka godz. (€)</label><input type="number" id="pr-rate" step="0.01" min="0" value="0" inputmode="decimal"></div>
          <div class="form-group">
            <label>Status</label>
            <select id="pr-status">
              <option value="active">aktywny</option>
              <option value="on_hold">wstrzymany</option>
              <option value="done">zakończony</option>
            </select>
          </div>
        </div>
        <div id="pr-error" class="error-msg hidden"></div>
        <button class="btn btn-primary btn-block" id="pr-save-btn">💾 Zapisz projekt</button>
      </div>

      <div id="pr-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;

  const form = document.getElementById('pr-form');
  document.getElementById('pr-add-btn').addEventListener('click', async () => {
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) await _loadClientOptions();
  });
  document.getElementById('pr-save-btn').addEventListener('click', _save);

  await _renderList();
}

async function _loadClientOptions() {
  const select = document.getElementById('pr-client');
  const clients = await repo.listActiveClients();
  select.innerHTML = '<option value="">— brak —</option>' +
    clients.map(c => `<option value="${c.id}">${escHtml(c.company_name || c.name)}</option>`).join('');
}

async function _renderList() {
  const wrap = document.getElementById('pr-list-wrap');
  try {
    const [projects, clients] = await Promise.all([repo.listProjects(), repo.listAllClients()]);
    const clientById = {};
    for (const c of clients) clientById[c.id] = c;

    if (!projects.length) { wrap.innerHTML = '<p class="text-muted">Brak projektów.</p>'; return; }

    wrap.innerHTML = projects.map(p => {
      const st = STATUS[p.status] || STATUS.active;
      const client = clientById[p.client_id];
      const clientName = client ? (client.company_name || client.name) : '—';
      return `
        <div class="list-card">
          <div class="list-card-header">
            <span>${escHtml(p.name)}</span>
            ${p._pending ? '<span class="badge badge-pending">⏳ oczekuje</span>' : `<span class="badge ${st.cls}">${st.label}</span>`}
          </div>
          <div class="list-card-body text-muted">
            ${escHtml(clientName)}${Number(p.hourly_rate) ? ' · ' + fmtEur(p.hourly_rate) + '/h' : ''}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania projektów: ${escHtml(err.message)}</p>`;
  }
}

async function _save() {
  const name = document.getElementById('pr-name').value.trim();
  const errorEl = document.getElementById('pr-error');
  errorEl.classList.add('hidden');
  if (!name) { errorEl.textContent = 'Nazwa jest wymagana.'; errorEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('pr-save-btn');
  btn.disabled = true; btn.textContent = '⏳ Zapisywanie…';
  try {
    await repo.createProject({
      name,
      client_id: document.getElementById('pr-client').value || null,
      description: document.getElementById('pr-desc').value.trim(),
      status: document.getElementById('pr-status').value,
      hourly_rate: parseFloat(document.getElementById('pr-rate').value) || 0,
      budget_hours: 0, budget_amount: 0, currency: 'EUR', youtube_episode: ''
    });
    navigate('projects');
  } catch (err) {
    errorEl.textContent = err.message; errorEl.classList.remove('hidden');
    btn.disabled = false; btn.textContent = '💾 Zapisz projekt';
  }
}

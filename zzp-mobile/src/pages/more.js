import { navigate } from '../router.js';
import { signOut } from '../auth.js';
import { enablePush, pushSupported } from '../push.js';

const ITEMS = [
  { page: 'projects', icon: '📁', label: 'Projekty' },
  { page: 'clients', icon: '👤', label: 'Klienci' },
  { page: 'add-expense', icon: '📷', label: 'Dodaj koszt' },
  { page: 'new-invoice', icon: '🧾', label: 'Nowa faktura' }
];

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <h1 class="page-title">☰ Więcej</h1>
      <div class="menu-list">
        ${ITEMS.map(i => `
          <button class="menu-item" data-page="${i.page}">
            <span class="menu-icon">${i.icon}</span>
            <span>${i.label}</span>
            <span class="menu-chevron">›</span>
          </button>`).join('')}
        <button class="menu-item" id="more-notify">
          <span class="menu-icon">🔔</span>
          <span>Włącz powiadomienia</span>
          <span class="menu-chevron">›</span>
        </button>
        <button class="menu-item menu-item-danger" id="more-logout">
          <span class="menu-icon">🚪</span>
          <span>Wyloguj</span>
          <span class="menu-chevron">›</span>
        </button>
      </div>
      <div id="more-notify-msg" class="info-box hidden" style="margin-top:12px"></div>
    </div>
  `;

  el.querySelectorAll('.menu-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  document.getElementById('more-notify').addEventListener('click', async () => {
    const msg = document.getElementById('more-notify-msg');
    msg.classList.remove('hidden');
    if (!pushSupported()) {
      msg.textContent = '⚠️ Ta przeglądarka nie obsługuje powiadomień push.';
      return;
    }
    msg.textContent = '⏳ Włączanie…';
    const res = await enablePush();
    msg.textContent = res.ok
      ? '✅ Powiadomienia włączone — dostaniesz alert o fakturach po terminie.'
      : '⚠️ ' + res.reason;
  });

  document.getElementById('more-logout').addEventListener('click', async () => {
    await signOut();
    navigate('login');
  });
}

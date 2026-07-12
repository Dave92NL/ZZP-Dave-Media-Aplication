import { navigate } from '../router.js';
import { signOut, getSession } from '../auth.js';
import { enablePush, pushSupported } from '../push.js';
import { icon } from '../lib/icons.js';

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// Grupy menu. `page` → nawigacja; `soon: true` → sekcja do zbudowania w przyszłości.
const GROUPS = [
  [
    { icon: 'user', label: 'Klienci', page: 'clients' },
    { icon: 'folder', label: 'Projekty', page: 'projects' },
    { icon: 'car', label: 'Kilometrówka', page: 'mileage' }
  ],
  [
    { icon: 'wallet', label: 'Koszty', page: 'expenses' },
    { icon: 'file', label: 'Faktury', page: 'invoices' },
    { icon: 'clock', label: 'Czas pracy', page: 'time' },
    { icon: 'chart', label: 'Finanse', page: 'finance' },
    { icon: 'activity', label: 'Raporty', soon: true },
    { icon: 'download', label: 'Eksport danych', soon: true },
    { icon: 'settings', label: 'Ustawienia', soon: true },
    { icon: 'cloud', label: 'Kopia zapasowa', soon: true }
  ]
];

export async function load() {
  const el = document.getElementById('page-content');

  let name = 'Pulpit', email = '';
  try {
    const session = await getSession();
    email = session?.user?.email || '';
    if (email) name = cap(email.split('@')[0].replace(/[._]/g, ' ').split(' ')[0]);
  } catch { /* offline */ }

  const rowsHtml = (items) => items.map(i => `
    <button class="menu-item" data-page="${i.page || ''}" data-soon="${i.soon ? '1' : ''}">
      <span class="menu-icon">${icon(i.icon, { size: 20 })}</span>
      <span>${i.label}</span>
      ${i.soon ? '<span class="menu-badge badge badge-info">Wkrótce</span>' : `<span class="menu-chevron">${icon('chevronRight', { size: 18 })}</span>`}
    </button>`).join('');

  el.innerHTML = `
    <div class="page">
      <div class="sheet-head">
        <div class="sheet-profile">
          <div class="sheet-avatar">${icon('user', { size: 26 })}</div>
          <div>
            <div class="sheet-name">${name}</div>
            ${email ? `<div class="sheet-sub">${email}</div>` : ''}
          </div>
        </div>
        <button class="sheet-close" id="sheet-close" aria-label="Zamknij">${icon('x', { size: 20 })}</button>
      </div>

      <div id="more-soon-msg" class="info-box hidden"></div>

      ${GROUPS.map(g => `<div class="menu-group"><div class="menu-list">${rowsHtml(g)}</div></div>`).join('')}

      <div class="menu-group"><div class="menu-list">
        <button class="menu-item" id="more-notify">
          <span class="menu-icon">${icon('bell', { size: 20 })}</span>
          <span>Włącz powiadomienia</span>
          <span class="menu-chevron">${icon('chevronRight', { size: 18 })}</span>
        </button>
      </div></div>

      <div class="menu-group"><div class="menu-list">
        <button class="menu-item menu-item-danger" id="more-logout">
          <span class="menu-icon">${icon('logout', { size: 20 })}</span>
          <span>Wyloguj się</span>
          <span class="menu-chevron">${icon('chevronRight', { size: 18 })}</span>
        </button>
      </div></div>

      <div id="more-notify-msg" class="info-box hidden" style="margin-top:12px"></div>
    </div>
  `;

  document.getElementById('sheet-close').addEventListener('click', () => navigate('dashboard'));

  el.querySelectorAll('.menu-item[data-page]').forEach(btn => {
    const page = btn.dataset.page;
    const soon = btn.dataset.soon === '1';
    if (soon) {
      btn.addEventListener('click', () => {
        const msg = document.getElementById('more-soon-msg');
        msg.textContent = '🔒 Ta sekcja pojawi się w kolejnej aktualizacji.';
        msg.classList.remove('hidden');
        el.scrollTop = 0;
      });
    } else if (page) {
      btn.addEventListener('click', () => navigate(page));
    }
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

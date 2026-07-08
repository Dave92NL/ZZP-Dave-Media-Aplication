import { signOut } from '../auth.js';
import { navigate } from '../router.js';

const TABS = [
  { page: 'expenses', icon: '💸', label: 'Koszty' },
  { page: 'invoices', icon: '📄', label: 'Faktury' },
  { page: 'add-expense', icon: '📷', label: '+ Koszt' },
  { page: 'new-invoice', icon: '🧾', label: '+ Faktura' }
];

export function renderNav(currentPage, hidden) {
  const el = document.getElementById('bottom-nav');
  if (!el) return;

  if (hidden) {
    el.innerHTML = '';
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');

  el.innerHTML = `
    ${TABS.map(t => `
      <button class="nav-tab${t.page === currentPage ? ' active' : ''}" data-page="${t.page}">
        <span class="nav-icon">${t.icon}</span>
        <span class="nav-label">${t.label}</span>
      </button>`).join('')}
    <button class="nav-tab nav-logout" id="nav-logout-btn">
      <span class="nav-icon">🚪</span>
      <span class="nav-label">Wyloguj</span>
    </button>
  `;

  el.querySelectorAll('.nav-tab[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
  document.getElementById('nav-logout-btn')?.addEventListener('click', async () => {
    await signOut();
    navigate('login');
  });
}

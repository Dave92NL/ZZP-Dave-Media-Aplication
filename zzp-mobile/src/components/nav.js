import { navigate } from '../router.js';

const TABS = [
  { page: 'dashboard', icon: '📊', label: 'Pulpit' },
  { page: 'expenses', icon: '💸', label: 'Koszty' },
  { page: 'invoices', icon: '📄', label: 'Faktury' },
  { page: 'time', icon: '⏱️', label: 'Czas' },
  { page: 'more', icon: '☰', label: 'Więcej' }
];

// Podstrony docierane z menu „Więcej" — podświetlają zakładkę „Więcej".
const MORE_PAGES = new Set(['projects', 'clients', 'add-expense', 'new-invoice', 'more']);

export function renderNav(currentPage, hidden) {
  const el = document.getElementById('bottom-nav');
  if (!el) return;

  if (hidden) {
    el.innerHTML = '';
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');

  el.innerHTML = TABS.map(t => {
    const active = t.page === currentPage || (t.page === 'more' && MORE_PAGES.has(currentPage));
    return `
      <button class="nav-tab${active ? ' active' : ''}" data-page="${t.page}">
        <span class="nav-icon">${t.icon}</span>
        <span class="nav-label">${t.label}</span>
      </button>`;
  }).join('');

  el.querySelectorAll('.nav-tab[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
}

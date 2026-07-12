import { navigate } from '../router.js';
import { icon } from '../lib/icons.js';

const TABS = [
  { page: 'dashboard', icon: 'home', label: 'Pulpit' },
  { page: 'invoices', icon: 'file', label: 'Faktury' },
  { page: 'time', icon: 'clock', label: 'Czas' },
  { page: 'finance', icon: 'chart', label: 'Finanse' },
  { page: 'more', icon: 'menu', label: 'Menu' }
];

// Podstrony docierane z „Menu" — podświetlają zakładkę „Menu".
const MORE_PAGES = new Set([
  'projects', 'clients', 'mileage', 'add-expense', 'new-invoice', 'more', 'expenses'
]);

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
        <span class="nav-icon">${icon(t.icon, { size: 23 })}</span>
        <span class="nav-label">${t.label}</span>
      </button>`;
  }).join('');

  el.querySelectorAll('.nav-tab[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
}

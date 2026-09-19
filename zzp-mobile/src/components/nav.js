import { navigate } from '../router.js';
import { icon } from '../lib/icons.js';
import { isModern } from '../lib/theme.js';

const TABS = [
  { page: 'dashboard', icon: 'home', label: 'Pulpit' },
  { page: 'invoices', icon: 'file', label: 'Faktury' },
  { page: 'time', icon: 'clock', label: 'Czas' },
  { page: 'finance', icon: 'chart', label: 'Finanse' },
  { page: 'more', icon: 'menu', label: 'Menu' }
];

// Motyw Nowoczesny: zakładki jak w referencji; „Czas pracy" jest wtedy w menu „Więcej".
const TABS_MODERN = [
  { page: 'dashboard', icon: 'home', label: 'Pulpit' },
  { page: 'invoices', icon: 'file', label: 'Faktury' },
  { page: 'expenses', icon: 'wallet', label: 'Koszty' },
  { page: 'finance', icon: 'chart', label: 'Finanse' },
  { page: 'more', icon: 'menu', label: 'Więcej' }
];

// Podstrony docierane z „Menu" — podświetlają zakładkę „Menu".
const MORE_PAGES = new Set([
  'projects', 'clients', 'mileage', 'add-expense', 'new-invoice', 'more', 'expenses'
]);
// W Nowoczesnym „Koszty" ma własną zakładkę, a „Czas" trafia pod „Więcej".
const MORE_PAGES_MODERN = new Set([
  'projects', 'clients', 'mileage', 'add-expense', 'new-invoice', 'more', 'time', 'reports', 'backup', 'settings'
]);

let _last = { page: null, hidden: false };
// Zmiana motywu przełącza zestaw zakładek bez przeładowania ekranu.
window.addEventListener('zzp-theme', () => { if (_last.page) renderNav(_last.page, _last.hidden); });

export function renderNav(currentPage, hidden) {
  const el = document.getElementById('bottom-nav');
  if (!el) return;
  _last = { page: currentPage, hidden };
  const modern = isModern();
  const tabs = modern ? TABS_MODERN : TABS;
  const morePages = modern ? MORE_PAGES_MODERN : MORE_PAGES;

  if (hidden) {
    el.innerHTML = '';
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');

  el.innerHTML = tabs.map(t => {
    const active = t.page === currentPage || (t.page === 'more' && morePages.has(currentPage));
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

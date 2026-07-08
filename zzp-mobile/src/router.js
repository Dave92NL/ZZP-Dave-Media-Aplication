import { getSession } from './auth.js';
import { renderNav } from './components/nav.js';

let _routes = {};
let _currentPage = 'login';
let _currentParam = null;

const PUBLIC_PAGES = new Set(['login']);
const DEFAULT_AUTHENTICATED_PAGE = 'expenses';
// Detail pages are reached via a card tap, not the bottom nav — hide the nav bar there.
const HIDDEN_NAV_PAGES = new Set(['invoice-detail', 'expense-detail']);

export function registerRoutes(routes) {
  _routes = routes;
}

export function currentParam() {
  return _currentParam;
}

// pageWithParam can be "expenses" or "expense-detail/<uuid>"
export async function navigate(pageWithParam) {
  const [rawPage, param] = String(pageWithParam).split('/');
  let page = rawPage;

  if (!_routes[page]) page = DEFAULT_AUTHENTICATED_PAGE;

  if (!PUBLIC_PAGES.has(page)) {
    const session = await getSession();
    if (!session) page = 'login';
  }

  _currentPage = page;
  _currentParam = param || null;
  location.hash = param ? `${page}/${param}` : page;

  const contentEl = document.getElementById('page-content');
  if (contentEl) contentEl.innerHTML = '';

  renderNav(_currentPage, PUBLIC_PAGES.has(page) || HIDDEN_NAV_PAGES.has(page));

  await _routes[page]();
}

export function currentPage() {
  return _currentPage;
}

export function initRouter() {
  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '');
    navigate(hash || DEFAULT_AUTHENTICATED_PAGE);
  });
}

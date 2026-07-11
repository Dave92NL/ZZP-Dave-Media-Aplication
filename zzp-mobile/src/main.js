import './styles/main.css';
import { registerRoutes, navigate, initRouter, currentPage, currentParam } from './router.js';
import { onAuthStateChange } from './auth.js';
import { initSync } from './data/sync.js';
import { ensurePushSubscription } from './push.js';

import * as loginPage from './pages/login.js';
import * as dashboardPage from './pages/dashboard.js';
import * as addExpensePage from './pages/addExpense.js';
import * as newInvoicePage from './pages/newInvoice.js';
import * as invoiceListPage from './pages/invoiceList.js';
import * as expenseListPage from './pages/expenseList.js';
import * as invoiceDetailPage from './pages/invoiceDetail.js';
import * as expenseDetailPage from './pages/expenseDetail.js';
import * as projectsPage from './pages/projects.js';
import * as clientsPage from './pages/clients.js';
import * as timeTrackingPage from './pages/timeTracking.js';
import * as mileagePage from './pages/mileage.js';
import * as morePage from './pages/more.js';

registerRoutes({
  login: loginPage.load,
  dashboard: dashboardPage.load,
  'add-expense': addExpensePage.load,
  'new-invoice': newInvoicePage.load,
  invoices: invoiceListPage.load,
  expenses: expenseListPage.load,
  'invoice-detail': invoiceDetailPage.load,
  'expense-detail': expenseDetailPage.load,
  projects: projectsPage.load,
  clients: clientsPage.load,
  time: timeTrackingPage.load,
  mileage: mileagePage.load,
  more: morePage.load
});

initRouter();

onAuthStateChange((session) => {
  if (!session) navigate('login');
  else ensurePushSubscription();
});

// Synchronizacja offline↔chmura: opróżnianie kolejki, odświeżanie cache.
initSync();

// Po udanej synchronizacji odśwież bieżący widok, by pokazać zaktualizowane dane.
// Nie przeładowujemy ekranów-formularzy, żeby nie skasować wpisywanych danych.
const FORM_PAGES = new Set(['login', 'add-expense', 'new-invoice']);
window.addEventListener('zzp-synced', () => {
  const page = currentPage();
  if (FORM_PAGES.has(page)) return;
  const param = currentParam();
  navigate(param ? `${page}/${param}` : page);
});

// Auto-odświeżanie widoków list co 15 s — pokazuje zmiany z drugiego urządzenia
// (np. fakturę/koszt usunięty na desktopie). Strony szczegółów i formularze pomijamy,
// żeby nie przerywać czytania/edycji.
const AUTO_REFRESH_PAGES = new Set(['dashboard', 'invoices', 'expenses', 'projects', 'clients', 'time', 'mileage']);
setInterval(() => {
  if (document.hidden || navigator.onLine === false) return;
  const page = currentPage();
  if (AUTO_REFRESH_PAGES.has(page)) navigate(page);
}, 15000);

const initialHash = location.hash.replace('#', '');
navigate(initialHash || 'dashboard');

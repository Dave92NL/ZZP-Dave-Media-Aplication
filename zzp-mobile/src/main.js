import './styles/main.css';
import { registerRoutes, navigate, initRouter, currentPage, currentParam } from './router.js';
import { onAuthStateChange } from './auth.js';
import { initSync } from './data/sync.js';
import { ensurePushSubscription } from './push.js';
import { initTranslateWidget } from './lib/translateWidget.js';

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

// Tłumaczenie opisów (ikonka 🌐 przy polach opisu) — jeden delegowany listener.
initTranslateWidget();

// Po udanej synchronizacji odśwież bieżący widok, by pokazać zaktualizowane dane.
// Nie przeładowujemy ekranów-formularzy, żeby nie skasować wpisywanych danych.
// Odśwież bieżący widok po synchronizacji — ale tylko gdy silnik sync zgłosił
// realną zmianę (wysłano z kolejki albo zmienił się stan chmury). Dzięki temu
// widok nie „mruga" co cykl, tylko faktycznie się aktualizuje po zmianie danych.
const FORM_PAGES = new Set(['login', 'add-expense', 'new-invoice']);
window.addEventListener('zzp-synced', () => {
  const page = currentPage();
  if (FORM_PAGES.has(page)) return;
  const param = currentParam();
  navigate(param ? `${page}/${param}` : page);
});

const initialHash = location.hash.replace('#', '');
navigate(initialHash || 'dashboard');

import './styles/main.css';
import { registerRoutes, navigate, initRouter } from './router.js';
import { onAuthStateChange } from './auth.js';

import * as loginPage from './pages/login.js';
import * as addExpensePage from './pages/addExpense.js';
import * as newInvoicePage from './pages/newInvoice.js';
import * as invoiceListPage from './pages/invoiceList.js';
import * as expenseListPage from './pages/expenseList.js';
import * as invoiceDetailPage from './pages/invoiceDetail.js';
import * as expenseDetailPage from './pages/expenseDetail.js';

registerRoutes({
  login: loginPage.load,
  'add-expense': addExpensePage.load,
  'new-invoice': newInvoicePage.load,
  invoices: invoiceListPage.load,
  expenses: expenseListPage.load,
  'invoice-detail': invoiceDetailPage.load,
  'expense-detail': expenseDetailPage.load
});

initRouter();

onAuthStateChange((session) => {
  if (!session) navigate('login');
});

const initialHash = location.hash.replace('#', '');
navigate(initialHash || 'expenses');

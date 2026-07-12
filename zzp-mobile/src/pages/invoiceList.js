import { navigate } from '../router.js';
import { fmtEur, fmtDateNL, escHtml } from '../lib/format.js';
import * as repo from '../data/repo.js';
import { icon } from '../lib/icons.js';

const STATUS = {
  draft: { label: 'Szkic', pill: 'pill-muted', amount: '' },
  sent: { label: 'Wysłana', pill: 'pill-blue', amount: '' },
  paid: { label: 'Opłacona', pill: 'pill-green', amount: 'text-good' },
  overdue: { label: 'Przeterminowana', pill: 'pill-red', amount: 'text-danger' },
  cancelled: { label: 'Anulowana', pill: 'pill-muted', amount: 'text-muted' }
};

const TABS = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'unpaid', label: 'Nieopłacone' },
  { key: 'paid', label: 'Opłacone' },
  { key: 'cancelled', label: 'Anulowane' }
];

// Stan utrzymywany między odświeżeniami
let _status = 'all';
let _search = '';
let _searchOpen = false;

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <div class="page-head">
        <h1 class="page-title">Faktury</h1>
        <div class="head-actions">
          <button class="icon-btn" id="inv-search-btn" aria-label="Szukaj">${icon('search', { size: 20 })}</button>
        </div>
      </div>
      <div id="inv-search-wrap" class="${_searchOpen ? '' : 'hidden'}" style="margin-bottom:12px">
        <input type="text" id="inv-search" placeholder="Szukaj po kliencie lub numerze…" value="${escHtml(_search)}">
      </div>
      <div class="seg-tabs" id="inv-tabs">
        ${TABS.map(t => `<button class="seg-tab${t.key === _status ? ' active' : ''}" data-status="${t.key}">${t.label}</button>`).join('')}
      </div>
      <div id="inv-summary" class="summary-box hidden"></div>
      <div id="inv-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
    <button class="fab" id="inv-fab" aria-label="Nowa faktura">${icon('plus', { size: 26 })}</button>
  `;

  const wrap = document.getElementById('inv-list-wrap');
  let data = [];
  try {
    data = await repo.listInvoices();
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania faktur: ${escHtml(err.message)}</p>`;
    return;
  }

  document.getElementById('inv-fab').addEventListener('click', () => navigate('new-invoice'));

  document.getElementById('inv-tabs').querySelectorAll('.seg-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _status = btn.dataset.status;
      document.getElementById('inv-tabs').querySelectorAll('.seg-tab').forEach(b => b.classList.toggle('active', b === btn));
      renderList();
    });
  });

  const searchBtn = document.getElementById('inv-search-btn');
  const searchWrap = document.getElementById('inv-search-wrap');
  const searchInput = document.getElementById('inv-search');
  searchBtn.addEventListener('click', () => {
    _searchOpen = !_searchOpen;
    searchWrap.classList.toggle('hidden', !_searchOpen);
    if (_searchOpen) searchInput.focus();
  });
  searchInput.addEventListener('input', () => { _search = searchInput.value; renderList(); });

  renderList();

  function matchStatus(inv) {
    if (_status === 'all') return true;
    if (_status === 'paid') return inv.status === 'paid';
    if (_status === 'cancelled') return inv.status === 'cancelled';
    if (_status === 'unpaid') return inv.status !== 'paid' && inv.status !== 'cancelled';
    return true;
  }

  function matchSearch(inv) {
    if (!_search.trim()) return true;
    const q = _search.trim().toLowerCase();
    const client = (inv.clients?.company_name || inv.clients?.name || '').toLowerCase();
    const num = String(inv.invoice_number || '').toLowerCase();
    return client.includes(q) || num.includes(q);
  }

  function renderList() {
    const rows = data.filter(i => matchStatus(i) && matchSearch(i));
    const summary = document.getElementById('inv-summary');

    if (rows.length) {
      const total = rows.reduce((s, i) => s + Number(i.total_eur ?? i.total ?? 0), 0);
      const paid = rows.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_eur ?? i.total ?? 0), 0);
      summary.classList.remove('hidden');
      summary.innerHTML = `
        <div><span>Faktury</span><strong>${rows.length}</strong></div>
        <div><span>Suma</span><strong>${fmtEur(total)}</strong></div>
        <div><span>Opłacone</span><strong>${fmtEur(paid)}</strong></div>`;
    } else {
      summary.classList.add('hidden');
    }

    if (!rows.length) {
      wrap.innerHTML = `<p class="text-muted">Brak faktur w tym widoku.</p>`;
      return;
    }

    wrap.innerHTML = rows.map(inv => {
      const st = STATUS[inv.status] || STATUS.draft;
      const clientName = inv.clients?.company_name || inv.clients?.name || '—';
      const numberLabel = inv._pending ? 'Faktura offline' : escHtml(inv.invoice_number || 'Faktura');
      const pill = inv._pending
        ? '<span class="pill pill-yellow"><span class="pill-dot"></span>oczekuje</span>'
        : `<span class="pill ${st.pill}"><span class="pill-dot"></span>${st.label}</span>`;
      return `
        <div class="row-card" data-id="${inv.id}" role="button" tabindex="0">
          <div class="row-chip">${icon('file', { size: 20 })}</div>
          <div class="row-main">
            <div class="row-main-title">${numberLabel}</div>
            <div class="row-main-sub">${escHtml(clientName)} · ${fmtDateNL(inv.issue_date)}</div>
          </div>
          <div class="row-end">
            <div class="row-amount ${inv._pending ? '' : st.amount}">${fmtEur(inv.total_eur ?? inv.total)}</div>
            ${pill}
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.row-card[data-id]').forEach(card => {
      card.addEventListener('click', () => navigate(`invoice-detail/${card.dataset.id}`));
    });
  }
}

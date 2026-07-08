import { navigate } from '../router.js';
import { fmtEur, fmtDateNL, escHtml } from '../lib/format.js';
import * as repo from '../data/repo.js';

const STATUS_BADGES = {
  draft: { icon: '📝', label: 'Szkic', cls: 'badge-muted' },
  sent: { icon: '📤', label: 'Wysłana', cls: 'badge-info' },
  paid: { icon: '✅', label: 'Opłacona', cls: 'badge-success' },
  overdue: { icon: '🔴', label: 'Przeterminowana', cls: 'badge-danger' },
  cancelled: { icon: '⛔', label: 'Anulowana', cls: 'badge-muted' }
};

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <h1 class="page-title">📄 Faktury</h1>
      <div id="inv-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;

  const wrap = document.getElementById('inv-list-wrap');
  try {
    const data = await repo.listInvoices();

    if (!data || !data.length) {
      wrap.innerHTML = '<p class="text-muted">Brak faktur.</p>';
      return;
    }

    wrap.innerHTML = data.map(inv => {
      const badge = STATUS_BADGES[inv.status] || STATUS_BADGES.draft;
      const clientName = inv.clients?.company_name || inv.clients?.name || '—';
      const numberLabel = inv._pending ? '⏳ oczekująca' : escHtml(inv.invoice_number);
      return `
        <div class="list-card" data-id="${inv.id}" role="button" tabindex="0">
          <div class="list-card-header">
            <span class="mono">${numberLabel}</span>
            <span class="badge ${inv._pending ? 'badge-pending' : badge.cls}">${inv._pending ? '📥 offline' : `${badge.icon} ${badge.label}`}</span>
          </div>
          <div class="list-card-body">
            <div>${escHtml(clientName)}</div>
            <div class="text-muted">${fmtDateNL(inv.issue_date)}</div>
          </div>
          <div class="list-card-amount">${fmtEur(inv.total_eur ?? inv.total)}</div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.list-card[data-id]').forEach(card => {
      card.addEventListener('click', () => navigate(`invoice-detail/${card.dataset.id}`));
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania faktur: ${escHtml(err.message)}</p>`;
  }
}

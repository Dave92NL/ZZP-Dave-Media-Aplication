import { currentParam, navigate } from '../router.js';
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
  const id = currentParam();

  el.innerHTML = `
    <div class="page">
      <button class="btn btn-secondary btn-sm back-btn" id="detail-back-btn">← Wróć do listy</button>
      <div id="inv-detail-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;
  document.getElementById('detail-back-btn').addEventListener('click', () => navigate('invoices'));

  const wrap = document.getElementById('inv-detail-wrap');
  if (!id) { wrap.innerHTML = '<p class="error-msg">Brak identyfikatora faktury.</p>'; return; }

  try {
    const inv = await repo.getInvoice(id);
    if (!inv) throw new Error('Nie znaleziono faktury (offline — brak w pamięci podręcznej).');

    const badge = STATUS_BADGES[inv.status] || STATUS_BADGES.draft;
    const client = inv.clients || {};
    const items = (inv.invoice_items || []).sort((a, b) => a.sort_order - b.sort_order);
    const numberLabel = inv._pending ? '⏳ oczekująca' : escHtml(inv.invoice_number);
    const pendingBanner = inv._pending
      ? '<div class="info-box">📥 Faktura utworzona offline — numer zostanie nadany, a faktura wysłana do chmury po odzyskaniu połączenia.</div>'
      : '';

    wrap.innerHTML = pendingBanner + `
      <div class="detail-header">
        <div>
          <div class="mono detail-title">${numberLabel}</div>
          <span class="badge ${inv._pending ? 'badge-pending' : badge.cls}">${inv._pending ? '📥 offline' : `${badge.icon} ${badge.label}`}</span>
        </div>
      </div>

      <h3 class="section-title">Klient</h3>
      <div class="detail-block">
        <div>${escHtml(client.company_name || client.name || '—')}</div>
        ${client.address ? `<div class="text-muted">${escHtml(client.address)}</div>` : ''}
        ${client.postcode || client.city ? `<div class="text-muted">${escHtml(client.postcode || '')} ${escHtml(client.city || '')}</div>` : ''}
        ${client.country ? `<div class="text-muted">${escHtml(client.country)}</div>` : ''}
        ${client.vat_number ? `<div class="text-muted">BTW: ${escHtml(client.vat_number)}</div>` : ''}
        ${client.email ? `<div class="text-muted">${escHtml(client.email)}</div>` : ''}
      </div>

      <h3 class="section-title">Daty</h3>
      <div class="detail-block">
        <div class="totals-row"><span>Data wystawienia</span><span>${fmtDateNL(inv.issue_date)}</span></div>
        <div class="totals-row"><span>Termin płatności</span><span>${fmtDateNL(inv.due_date)}</span></div>
        ${inv.paid_date ? `<div class="totals-row"><span>Data zapłaty</span><span>${fmtDateNL(inv.paid_date)}</span></div>` : ''}
      </div>

      <h3 class="section-title">Pozycje</h3>
      ${items.map(it => `
        <div class="item-detail-row">
          <div>${escHtml(it.description)}</div>
          <div class="text-muted">${it.quantity} ${escHtml(it.unit)} × ${fmtEur(it.unit_price)}</div>
          <div class="mono">${fmtEur(it.total)}</div>
        </div>`).join('') || '<p class="text-muted">Brak pozycji.</p>'}

      <div class="totals-box">
        <div class="totals-row"><span>Suma netto</span><span>${fmtEur(inv.subtotal)}</span></div>
        <div class="totals-row"><span>BTW ${inv.btw_reverse_charge ? '(reverse charge)' : `(${inv.btw_rate}%)`}</span><span>${fmtEur(inv.btw_amount)}</span></div>
        <div class="totals-row totals-row-total"><span>Do zapłaty</span><span>${fmtEur(inv.total_eur ?? inv.total)}</span></div>
      </div>

      ${inv.notes ? `<h3 class="section-title">Uwagi</h3><div class="detail-block">${escHtml(inv.notes)}</div>` : ''}

      <div class="detail-origin text-muted">Źródło: ${inv.origin === 'phone' ? '📱 Telefon' : '💻 Desktop'}</div>
    `;
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania faktury: ${escHtml(err.message)}</p>`;
  }
}

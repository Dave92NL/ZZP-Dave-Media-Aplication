import { currentParam, navigate } from '../router.js';
import { fmtEur, fmtDateNL, escHtml, todayStr } from '../lib/format.js';
import * as repo from '../data/repo.js';
import { COMPANY } from '../lib/companyProfile.js';
import { icon } from '../lib/icons.js';

// Stylizowany podgląd dokumentu faktury (odpowiednik generowanego PDF na desktopie).
function _invoiceDocumentHTML(inv, client, items) {
  const seller = [
    COMPANY.address,
    [COMPANY.postcode, COMPANY.city].filter(Boolean).join(' '),
    COMPANY.country,
    COMPANY.btw_number ? `BTW: ${COMPANY.btw_number}` : '',
    COMPANY.kvk_number ? `KvK: ${COMPANY.kvk_number}` : ''
  ].filter(Boolean).map(l => `<div>${escHtml(l)}</div>`).join('');

  const buyer = [
    client.company_name || client.name || '',
    client.address || '',
    [client.postcode, client.city].filter(Boolean).join(' '),
    client.country || '',
    client.vat_number ? `BTW: ${client.vat_number}` : ''
  ].filter(Boolean).map(l => `<div>${escHtml(l)}</div>`).join('');

  const rows = items.map(it => `
    <tr>
      <td>${escHtml(it.description)}</td>
      <td class="num">${it.quantity} ${escHtml(it.unit || '')}</td>
      <td class="num">${fmtEur(it.unit_price)}</td>
      <td class="num">${fmtEur(it.total)}</td>
    </tr>`).join('');

  const btwLabel = inv.btw_reverse_charge ? 'BTW verlegd (reverse charge)' : `BTW (${inv.btw_rate}%)`;
  const numberLabel = inv._pending ? '(numer po synchronizacji)' : escHtml(inv.invoice_number);

  return `
    <div class="invoice-doc">
      <div class="invoice-doc-head">
        <div class="invoice-doc-seller">
          <div class="invoice-doc-seller-name">${escHtml(COMPANY.name)}</div>
          ${seller}
        </div>
        <div class="invoice-doc-title">
          <div class="invoice-doc-word">FACTUUR</div>
          <div class="mono">${numberLabel}</div>
        </div>
      </div>

      <div class="invoice-doc-meta">
        <div class="invoice-doc-buyer">
          <div class="invoice-doc-label">Factuur voor</div>
          ${buyer}
        </div>
        <div class="invoice-doc-dates">
          <div><span>Factuurdatum</span><span>${fmtDateNL(inv.issue_date)}</span></div>
          ${inv.sale_date ? `<div><span>Leverdatum</span><span>${fmtDateNL(inv.sale_date)}</span></div>` : ''}
          <div><span>Vervaldatum</span><span>${fmtDateNL(inv.due_date)}</span></div>
        </div>
      </div>

      <table class="invoice-doc-table">
        <thead>
          <tr><th>Omschrijving</th><th class="num">Aantal</th><th class="num">Prijs</th><th class="num">Totaal</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4">Brak pozycji</td></tr>'}</tbody>
      </table>

      <div class="invoice-doc-totals">
        <div><span>Subtotaal</span><span>${fmtEur(inv.subtotal)}</span></div>
        <div><span>${btwLabel}</span><span>${fmtEur(inv.btw_amount)}</span></div>
        <div class="invoice-doc-total"><span>Te betalen</span><span>${fmtEur(inv.total_eur ?? inv.total)}</span></div>
      </div>

      ${inv.btw_reverse_charge ? '<div class="invoice-doc-note">BTW verlegd — reverse charge (art. 196 BTW-richtlijn / art. 12 Wet OB).</div>' : ''}
      ${COMPANY.iban ? `<div class="invoice-doc-note">Gelieve te betalen op IBAN ${escHtml(COMPANY.iban)} t.n.v. ${escHtml(COMPANY.name)}.</div>` : ''}
    </div>`;
}

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
      <button class="btn btn-secondary btn-sm back-btn" id="detail-back-btn">${icon('arrowLeft', { size: 16 })} Wróć</button>
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

      <h3 class="section-title">Podgląd dokumentu</h3>
      ${_invoiceDocumentHTML(inv, client, items)}

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
        ${inv.sale_date ? `<div class="totals-row"><span>Data sprzedaży (Leverdatum)</span><span>${fmtDateNL(inv.sale_date)}</span></div>` : ''}
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

      <button class="btn btn-secondary btn-block" id="inv-edit-btn" style="margin-top:16px">✏️ Edytuj fakturę</button>

      ${(!inv._pending && inv.status !== 'paid') ? `
        <button class="btn btn-primary btn-block" id="inv-mark-paid-btn" style="margin-top:16px">✅ Oznacz jako zapłaconą</button>
        <div id="inv-paid-msg" class="error-msg hidden" style="margin-top:8px"></div>` : ''}

      <button class="btn btn-danger btn-block" id="inv-delete-btn" style="margin-top:16px">🗑 Usuń fakturę</button>
      <div id="inv-delete-msg" class="error-msg hidden" style="margin-top:8px"></div>

      <div class="detail-origin text-muted">Źródło: ${inv.origin === 'phone' ? '📱 Telefon' : '💻 Desktop'}</div>
    `;

    document.getElementById('inv-edit-btn').addEventListener('click', () => navigate(`new-invoice/${id}`));

    document.getElementById('inv-delete-btn').addEventListener('click', async () => {
      if (!confirm('Usunąć tę fakturę? Zniknie też na komputerze po synchronizacji.')) return;
      const msg = document.getElementById('inv-delete-msg');
      const btn = document.getElementById('inv-delete-btn');
      msg.classList.add('hidden');
      btn.disabled = true; btn.textContent = '⏳ Usuwanie…';
      try {
        await repo.deleteInvoice(id);
        navigate('invoices');
      } catch (err) {
        msg.textContent = err.message; msg.classList.remove('hidden');
        btn.disabled = false; btn.textContent = '🗑 Usuń fakturę';
      }
    });

    const paidBtn = document.getElementById('inv-mark-paid-btn');
    if (paidBtn) {
      paidBtn.addEventListener('click', async () => {
        const msg = document.getElementById('inv-paid-msg');
        msg.classList.add('hidden');
        paidBtn.disabled = true; paidBtn.textContent = '⏳ Zapisywanie…';
        try {
          await repo.markInvoicePaid(id, todayStr());
          navigate(`invoice-detail/${id}`);
        } catch (err) {
          msg.textContent = err.message; msg.classList.remove('hidden');
          paidBtn.disabled = false; paidBtn.textContent = '✅ Oznacz jako zapłaconą';
        }
      });
    }
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania faktury: ${escHtml(err.message)}</p>`;
  }
}

/* Invoices page */
'use strict';

const PageInvoices = (() => {
  let allInvoices = [];
  let clients = [];
  let projects = [];
  let products = [];
  let filters = { year: new Date().getFullYear(), month: '', client_id: '', status: '', search: '' };
  let _importResults = []; // held in closure for import wizard

  // ── Entry point ──────────────────────────────────────────
  async function load() {
    document.getElementById('page-content').innerHTML = `
      <div class="page" id="invoices-page">
        <div class="page-header">
          <h1 class="page-title">📄 Faktury</h1>
          <div class="page-actions">
            <button class="btn btn-secondary" onclick="PageInvoices.openProducts()" title="Katalog produktów/usług do pozycji faktur">📦 Produkty</button>
            <button class="btn btn-secondary" onclick="PageInvoices.openImportWizard()" title="Importuj faktury z efaktura.nl (XML/PDF)">📥 Import XML/PDF</button>
            <button class="btn btn-primary" onclick="PageInvoices.openCreate()">+ Nowa faktura</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:16px;padding:12px 16px">
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
            <select id="f-year" class="filter-select" onchange="PageInvoices.applyFilters()">
              ${yearOptions()}
            </select>
            <select id="f-month" class="filter-select" onchange="PageInvoices.applyFilters()">
              <option value="">Wszystkie miesiące</option>
              ${monthOptions()}
            </select>
            <select id="f-status" class="filter-select" onchange="PageInvoices.applyFilters()">
              <option value="">Wszystkie statusy</option>
              <option value="draft">Robocze</option>
              <option value="sent">Wysłane</option>
              <option value="paid">Zapłacone</option>
              <option value="overdue">Przeterminowane</option>
              <option value="cancelled">Anulowane</option>
            </select>
            <select id="f-client" class="filter-select" onchange="PageInvoices.applyFilters()">
              <option value="">Wszyscy klienci</option>
            </select>
            <input type="text" id="f-search" placeholder="🔍 Szukaj nr / klient…" style="min-width:180px" oninput="PageInvoices.applyFilters()">
            <button class="btn btn-sm btn-secondary" onclick="PageInvoices.clearFilters()">✕ Wyczyść</button>
          </div>
        </div>
        <div class="card" style="overflow-x:auto" id="invoices-table-wrap">
          <div style="padding:40px;text-align:center;color:var(--text-muted)">Ładowanie…</div>
        </div>
        <div id="invoices-summary" style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap"></div>
      </div>`;

    try {
      // Produkty są opcjonalne — ich błąd nie może zablokować klientów/projektów
      [clients, projects, products] = await Promise.all([
        window.api.contacts.getAll(),
        window.api.projects.getAll(),
        Promise.resolve().then(() => window.api.products.getAll({ activeOnly: true })).catch(() => [])
      ]);
      populateClientFilter();
      await refresh();
    } catch (err) {
      console.error('Invoices load error:', err);
    }
  }

  async function refresh() {
    try {
      const f = {};
      if (filters.year) f.year = filters.year;
      if (filters.month) f.month = filters.month;
      if (filters.status) f.status = filters.status;
      if (filters.client_id) f.client_id = filters.client_id;
      allInvoices = await window.api.invoices.getAll(f);
      renderTable();
      renderSummary();
    } catch (err) {
      console.error('Invoices refresh error:', err);
    }
  }

  function applyFilters() {
    const newYear     = document.getElementById('f-year')?.value || '';
    const newMonth    = document.getElementById('f-month')?.value || '';
    const newStatus   = document.getElementById('f-status')?.value || '';
    const newClient   = document.getElementById('f-client')?.value || '';
    filters.search    = document.getElementById('f-search')?.value?.toLowerCase() || '';

    // Server-side filters changed → re-fetch from DB
    if (newYear !== filters.year || newMonth !== filters.month ||
        newStatus !== filters.status || newClient !== filters.client_id) {
      filters.year = newYear;
      filters.month = newMonth;
      filters.status = newStatus;
      filters.client_id = newClient;
      refresh(); // fetches new data from backend
    } else {
      // Only search changed → client-side filter (faster, no DB round-trip)
      renderTable();
      renderSummary();
    }
  }

  function clearFilters() {
    filters = { year: new Date().getFullYear(), month: '', client_id: '', status: '', search: '' };
    document.getElementById('f-year').value = filters.year;
    document.getElementById('f-month').value = '';
    document.getElementById('f-status').value = '';
    document.getElementById('f-client').value = '';
    document.getElementById('f-search').value = '';
    refresh();
  }

  function populateClientFilter() {
    const sel = document.getElementById('f-client');
    if (!sel) return;
    clients.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    if (filters.client_id) sel.value = filters.client_id;
  }

  function getFiltered() {
    let list = allInvoices;
    if (filters.search) {
      list = list.filter(inv =>
        inv.invoice_number?.toLowerCase().includes(filters.search) ||
        inv.client_name?.toLowerCase().includes(filters.search) ||
        inv.project_name?.toLowerCase().includes(filters.search)
      );
    }
    return list;
  }

  function renderTable() {
    const wrap = document.getElementById('invoices-table-wrap');
    if (!wrap) return;
    const list = getFiltered();

    if (!list.length) {
      wrap.innerHTML = '<div style="padding:48px;text-align:center;color:var(--text-muted)">Brak faktur dla wybranych filtrów.</div>';
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead><tr>
          <th>Nr faktury</th><th>Klient</th><th>Data wyst.</th><th>Termin</th>
          <th style="text-align:right">Netto</th><th style="text-align:right">BTW</th>
          <th style="text-align:right">Brutto</th><th>Status</th><th>Akcje</th>
        </tr></thead>
        <tbody>
          ${list.map(inv => `
            <tr data-id="${inv.id}" onclick="PageInvoices.openView(${inv.id})" style="cursor:pointer" title="Kliknij, aby zobaczyć podgląd">
              <td class="mono">${UI.esc(inv.invoice_number)}</td>
              <td>${UI.esc(inv.client_name || '—')}</td>
              <td class="mono">${fmtDate(inv.issue_date)}</td>
              <td class="mono" style="${inv.status === 'overdue' ? 'color:var(--accent-red)' : ''}">${fmtDate(inv.due_date)}</td>
              <td class="mono" style="text-align:right">${fmtAmount(inv.subtotal, inv.currency)}</td>
              <td class="mono" style="text-align:right">${fmtAmount(inv.btw_amount, inv.currency)}</td>
              <td class="mono" style="text-align:right;font-weight:600">${fmtAmount(inv.total, inv.currency)}</td>
              <td>${statusBadge(inv.status)}</td>
              <td>
                <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
                  ${inv.pdf_path ? `<button class="btn btn-icon btn-sm btn-secondary" title="Otwórz PDF" onclick="PageInvoices.openPDF(${inv.id})">👁</button>` : ''}
                  <button class="btn btn-icon btn-sm btn-secondary" title="Edytuj" onclick="PageInvoices.openEdit(${inv.id})">✏️</button>
                  ${inv.status !== 'paid' ? `<button class="btn btn-icon btn-sm btn-success" title="Oznacz zapłaconą" onclick="PageInvoices.markPaid(${inv.id})">✅</button>` : ''}
                  ${(inv.status !== 'paid' && inv.status !== 'cancelled') ? `<button class="btn btn-icon btn-sm btn-secondary" title="Przypomnienie / wezwanie do zapłaty" onclick="PageInvoices.openPaymentEmail(${inv.id})">✉️</button>` : ''}
                  <button class="btn btn-icon btn-sm btn-secondary" title="Duplikuj" onclick="PageInvoices.duplicate(${inv.id})">📋</button>
                  <button class="btn btn-icon btn-sm btn-secondary" title="Eksportuj PDF" onclick="PageInvoices.exportPDF(${inv.id})">📄</button>
                  <button class="btn btn-icon btn-sm btn-secondary" title="Eksportuj UBL XML (e-faktura)" onclick="PageInvoices.exportUBL(${inv.id})">🧾</button>
                  <button class="btn btn-icon btn-sm btn-danger" title="Usuń" onclick="PageInvoices.deleteInvoice(${inv.id})">🗑</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function renderSummary() {
    const el = document.getElementById('invoices-summary');
    if (!el) return;
    const list = getFiltered();
    const total = list.reduce((s, i) => s + (i.total || 0), 0);
    const paid = list.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
    const pending = list.filter(i => ['sent','overdue'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0);
    el.innerHTML = `
      <span class="summary-chip">📊 ${list.length} faktur</span>
      <span class="summary-chip">💰 Łącznie: <strong>${fmtEur(total)}</strong></span>
      <span class="summary-chip" style="color:var(--accent-green)">✅ Zapłacono: <strong>${fmtEur(paid)}</strong></span>
      <span class="summary-chip" style="color:var(--accent-yellow)">⏳ Oczekuje: <strong>${fmtEur(pending)}</strong></span>`;
  }

  // ── Create / Edit ────────────────────────────────────────
  async function openCreate() {
    const nextNum = await window.api.invoices.getNextNumber();
    const today = todayStr();
    const profile = await window.api.profile.get();
    const dueDate = addDays(today, profile.default_payment_days || 30);
    showInvoiceForm(null, {
      invoice_number: nextNum,
      issue_date: today,
      due_date: dueDate,
      currency: 'EUR',
      btw_rate: 0,
      btw_reverse_charge: 1,
      status: 'draft',
      items: [{ description: '', quantity: 1, unit: 'usługa', unit_price: 0, btw_rate: 0 }]
    });
  }

  async function openEdit(id) {
    try {
      const inv = await window.api.invoices.getById(id);
      if (!inv) { UI.toast('Faktura nie znaleziona.', 'error'); return; }
      showInvoiceForm(id, inv);
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  function showInvoiceForm(id, inv) {
    const isEdit = !!id;
    const clientOptions = clients.map(c =>
      `<option value="${c.id}" ${inv.client_id == c.id ? 'selected' : ''}>${UI.esc(c.name)}</option>`
    ).join('');
    const projectOptions = `<option value="">— bez projektu —</option>` + projects.map(p =>
      `<option value="${p.id}" ${inv.project_id == p.id ? 'selected' : ''}>${UI.esc(p.name)}</option>`
    ).join('');

    const itemsHTML = (inv.items || [{}]).map((item, i) => itemRowHTML(i, item)).join('');

    UI.openModal(isEdit ? `Edytuj fakturę ${inv.invoice_number}` : 'Nowa faktura',
      `<div class="form-grid-2" style="margin-bottom:16px">
        <div class="form-group">
          <label>Nr faktury *</label>
          <input type="text" id="inv-number" value="${UI.esc(inv.invoice_number || '')}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="inv-status">
            ${['draft','sent','paid','cancelled'].map(s =>
              `<option value="${s}" ${inv.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Data wystawienia *</label>
          <input type="date" id="inv-issue-date" value="${inv.issue_date || ''}" onchange="PageInvoices.updateDueDate()">
        </div>
        <div class="form-group">
          <label>Termin płatności *</label>
          <input type="date" id="inv-due-date" value="${inv.due_date || ''}">
        </div>
        <div class="form-group">
          <label>Data sprzedaży / dostawy (leverdatum)</label>
          <input type="date" id="inv-sale-date" value="${inv.sale_date || ''}" title="Puste = taka sama jak data wystawienia">
        </div>
        <div class="form-group">
          <label>Data zapłaty (dla zapłaconych)</label>
          <input type="date" id="inv-paid-date" value="${inv.paid_date || ''}" title="Decyduje w którym miesiącu przychód pojawia się w raportach i na dashboardzie. Puste = data wystawienia.">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>Klient *</label>
        <div style="display:flex;gap:8px">
          <select id="inv-client" style="flex:1" onchange="PageInvoices.onClientChange()">
            <option value="">— wybierz klienta —</option>
            ${clientOptions}
          </select>
          <button class="btn btn-sm btn-secondary" onclick="PageInvoices.goToNewClient()">+ Nowy</button>
        </div>
      </div>
      <div id="inv-client-preview" style="background:var(--bg-tertiary);border-radius:var(--radius-sm);padding:10px;font-size:12px;color:var(--text-secondary);margin-bottom:12px;display:${inv.client_id ? 'block' : 'none'}">
        ${clientPreviewHTML(clients.find(c => c.id == inv.client_id))}
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>Projekt (opcjonalnie)</label>
        <select id="inv-project">${projectOptions}</select>
      </div>

      <div style="margin-bottom:8px;font-weight:600;font-size:13px">Pozycje faktury</div>
      <div id="inv-items-wrap">
        <table style="width:100%;font-size:13px">
          <thead><tr>
            <th style="padding:6px 8px">Opis</th>
            <th style="padding:6px 8px;width:60px">Ilość</th>
            <th style="padding:6px 8px;width:80px">Jedn.</th>
            <th style="padding:6px 8px;width:110px">Cena netto</th>
            <th style="padding:6px 8px;width:70px">BTW%</th>
            <th style="padding:6px 8px;width:110px;text-align:right">Suma</th>
            <th style="padding:6px 8px;width:32px"></th>
          </tr></thead>
          <tbody id="inv-items-body">${itemsHTML}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-secondary" onclick="PageInvoices.addItem()">+ Dodaj pozycję</button>
        ${products.length ? `
          <select id="inv-product-pick" style="max-width:260px">
            <option value="">📦 …lub wybierz z katalogu</option>
            ${products.map(p => `<option value="${p.id}">${UI.esc(p.name)} — ${fmtAmount(p.unit_price, 'EUR')}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-secondary" onclick="PageInvoices.addProductItem()">⤵ Wstaw</button>
        ` : ''}
      </div>

      <div style="margin-top:16px;padding:14px;background:var(--bg-tertiary);border-radius:var(--radius-sm)">
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="btw-mode" id="btw-reverse" value="reverse" ${inv.btw_reverse_charge ? 'checked' : ''} onchange="PageInvoices.onBtwModeChange()">
            BTW 0% — Reverse Charge (B2B UE)
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="btw-mode" id="btw-21" value="21" ${!inv.btw_reverse_charge && inv.btw_rate == 21 ? 'checked' : ''} onchange="PageInvoices.onBtwModeChange()">
            BTW 21% (NL)
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="btw-mode" id="btw-none" value="0" ${!inv.btw_reverse_charge && inv.btw_rate == 0 ? 'checked' : ''} onchange="PageInvoices.onBtwModeChange()">
            Brak BTW (eksport)
          </label>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div class="form-group" style="min-width:120px">
            <label>Waluta</label>
            <select id="inv-currency" onchange="PageInvoices.recalc()">
              ${['EUR','USD','GBP','PLN'].map(c => `<option ${inv.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="min-width:100px">
            <label>Kurs EUR</label>
            <input type="number" id="inv-exchange" value="${inv.exchange_rate || 1}" step="0.0001" min="0.0001" onchange="PageInvoices.recalc()">
          </div>
        </div>
      </div>

      <div id="inv-totals" style="margin-top:12px;text-align:right;font-size:13px"></div>

      <div class="form-grid-2" style="margin-top:12px">
        <div class="form-group">
          <label>Nr referencyjny klienta</label>
          <input type="text" id="inv-reference" value="${UI.esc(inv.reference || '')}">
        </div>
        <div class="form-group">
          <label>Notatki</label>
          <textarea id="inv-notes" rows="2">${UI.esc(inv.notes || '')}</textarea>
        </div>
      </div>`,
      {
        size: 'xl',
        footer: `
          <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
          <button class="btn btn-secondary" onclick="PageInvoices.saveInvoice(${id || 'null'},'draft')">💾 Zapisz roboczą</button>
          <button class="btn btn-primary" onclick="PageInvoices.saveAndExportPDF(${id || 'null'})">📄 Zapisz i eksportuj PDF</button>`,
        onOpen: () => {
          recalc();
          // Pre-fill BTW mode
          const mode = inv.btw_reverse_charge ? 'reverse' : String(inv.btw_rate || 0);
          const radio = document.querySelector(`input[name="btw-mode"][value="${mode}"]`);
          if (radio) radio.checked = true;
        }
      }
    );
  }

  function itemRowHTML(i, item = {}) {
    const sum = (Number(item.quantity) || 1) * (Number(item.unit_price) || 0);
    return `<tr data-row="${i}">
      <td style="padding:4px 8px"><input type="text" class="item-desc" value="${UI.esc(item.description || '')}" style="width:100%" oninput="PageInvoices.recalc()"></td>
      <td style="padding:4px 4px"><input type="number" class="item-qty" value="${item.quantity || 1}" min="0.01" step="0.01" style="width:100%" oninput="PageInvoices.recalc()"></td>
      <td style="padding:4px 4px"><input type="text" class="item-unit" value="${UI.esc(item.unit || 'usługa')}" style="width:100%"></td>
      <td style="padding:4px 4px"><input type="number" class="item-price" value="${item.unit_price || 0}" min="0" step="0.01" style="width:100%" oninput="PageInvoices.recalc()"></td>
      <td style="padding:4px 4px"><input type="number" class="item-btw" value="${item.btw_rate || 0}" min="0" max="100" style="width:100%" oninput="PageInvoices.recalc()"></td>
      <td style="padding:4px 8px;text-align:right" class="item-total mono">${fmtAmount(sum, 'EUR')}</td>
      <td style="padding:4px 4px"><button class="btn btn-icon btn-sm btn-danger" onclick="this.closest('tr').remove();PageInvoices.recalc()">✕</button></td>
    </tr>`;
  }

  function addItem() {
    const tbody = document.getElementById('inv-items-body');
    if (!tbody) return;
    const i = tbody.querySelectorAll('tr').length;
    tbody.insertAdjacentHTML('beforeend', itemRowHTML(i));
  }

  // ── Katalog produktów ────────────────────────────────────
  function addProductItem() {
    const select = document.getElementById('inv-product-pick');
    const tbody = document.getElementById('inv-items-body');
    if (!select || !tbody || !select.value) return;
    const p = products.find(x => x.id == select.value);
    if (!p) return;

    // Jeśli jedyny wiersz jest pusty — zastąp go zamiast dokładać
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 1 && !rows[0].querySelector('.item-desc')?.value?.trim()) rows[0].remove();

    const i = tbody.querySelectorAll('tr').length;
    tbody.insertAdjacentHTML('beforeend', itemRowHTML(i, {
      description: p.description ? `${p.name} — ${p.description}` : p.name,
      quantity: 1, unit: p.unit || 'usługa',
      unit_price: p.unit_price || 0, btw_rate: p.btw_rate || 0
    }));
    select.value = '';
    recalc();
  }

  async function openProducts() {
    products = await window.api.products.getAll({});
    const rowsHTML = products.length ? products.map(p => `
      <tr>
        <td style="padding:6px 8px">${UI.esc(p.name)}${p.is_active ? '' : ' <span class="text-muted">(nieaktywny)</span>'}</td>
        <td style="padding:6px 8px" class="text-muted">${UI.esc(p.description || '')}</td>
        <td style="padding:6px 8px">${UI.esc(p.unit)}</td>
        <td style="padding:6px 8px;text-align:right" class="mono">${fmtAmount(p.unit_price, 'EUR')}</td>
        <td style="padding:6px 8px;text-align:right">${p.btw_rate}%</td>
        <td style="padding:6px 4px;text-align:right">
          <button class="btn btn-icon btn-sm btn-danger" title="Usuń" onclick="PageInvoices.deleteProduct(${p.id})">🗑</button>
        </td>
      </tr>`).join('')
      : '<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text-muted)">Brak produktów — dodaj pierwszy poniżej.</td></tr>';

    UI.openModal('📦 Katalog produktów / usług', `
      <p class="text-muted" style="font-size:12px;margin-bottom:12px">
        Produkty pojawiają się jako lista przy dodawaniu pozycji faktury — jedno kliknięcie zamiast wpisywania.
      </p>
      <table style="width:100%;font-size:13px;margin-bottom:16px">
        <thead><tr>
          <th style="padding:6px 8px;text-align:left">Nazwa</th>
          <th style="padding:6px 8px;text-align:left">Opis</th>
          <th style="padding:6px 8px;text-align:left">Jedn.</th>
          <th style="padding:6px 8px;text-align:right">Cena netto</th>
          <th style="padding:6px 8px;text-align:right">BTW</th>
          <th></th>
        </tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
      <div style="border-top:1px solid var(--border);padding-top:12px">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px">Nowy produkt</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div class="form-group" style="flex:2;min-width:160px;margin:0"><label>Nazwa *</label><input type="text" id="prod-name" placeholder="np. Advertentieruimte YouTube"></div>
          <div class="form-group" style="flex:2;min-width:140px;margin:0"><label>Opis</label><input type="text" id="prod-desc"></div>
          <div class="form-group" style="width:90px;margin:0"><label>Jedn.</label><input type="text" id="prod-unit" value="usługa"></div>
          <div class="form-group" style="width:110px;margin:0"><label>Cena netto</label><input type="number" id="prod-price" value="0" min="0" step="0.01"></div>
          <div class="form-group" style="width:80px;margin:0"><label>BTW %</label><input type="number" id="prod-btw" value="0" min="0" max="100"></div>
          <button class="btn btn-primary" onclick="PageInvoices.saveProduct()">💾 Dodaj</button>
        </div>
      </div>`,
      { size: 'lg', footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Zamknij</button>` }
    );
  }

  async function saveProduct() {
    const name = document.getElementById('prod-name')?.value?.trim();
    if (!name) { UI.toast('Nazwa produktu jest wymagana.', 'warning'); return; }
    try {
      await window.api.products.create({
        name,
        description: document.getElementById('prod-desc')?.value?.trim() || '',
        unit: document.getElementById('prod-unit')?.value?.trim() || 'usługa',
        unit_price: parseFloat(document.getElementById('prod-price')?.value) || 0,
        btw_rate: parseFloat(document.getElementById('prod-btw')?.value) || 0
      });
      UI.toast('Produkt dodany.', 'success');
      await openProducts(); // odśwież modal
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  async function deleteProduct(id) {
    try {
      await window.api.products.delete(id);
      UI.toast('Produkt usunięty.', 'success');
      await openProducts();
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  function recalc() {
    const rows = document.querySelectorAll('#inv-items-body tr');
    let subtotal = 0;
    rows.forEach(row => {
      const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
      const price = parseFloat(row.querySelector('.item-price')?.value) || 0;
      const total = qty * price;
      const totalEl = row.querySelector('.item-total');
      if (totalEl) totalEl.textContent = fmtAmount(total, 'EUR');
      subtotal += total;
    });

    const btwMode = document.querySelector('input[name="btw-mode"]:checked')?.value;
    const isReverse = btwMode === 'reverse';
    const btwRate = isReverse ? 0 : (btwMode === '21' ? 21 : 0);
    const btwAmount = isReverse ? 0 : subtotal * btwRate / 100;
    const total = subtotal + btwAmount;

    const totalsEl = document.getElementById('inv-totals');
    if (totalsEl) {
      totalsEl.innerHTML = `
        <div style="display:inline-block;border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 16px;min-width:280px;text-align:right">
          <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:4px">
            <span class="text-muted">Suma netto:</span>
            <span class="mono">${fmtAmount(subtotal, 'EUR')}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:4px">
            <span class="text-muted">BTW (${isReverse ? '0% RC' : btwRate + '%'}):</span>
            <span class="mono">${fmtAmount(btwAmount, 'EUR')}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:24px;font-weight:700;font-size:15px;border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
            <span>DO ZAPŁATY:</span>
            <span class="mono">${fmtAmount(total, 'EUR')}</span>
          </div>
          ${isReverse ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px">BTW verlegd — art. 44/196 BTW-richtlijn</div>` : ''}
        </div>`;
    }
  }

  function onBtwModeChange() { recalc(); }

  function updateDueDate() {
    const issueDate = document.getElementById('inv-issue-date')?.value;
    if (!issueDate) return;
    const profile = { default_payment_days: 30 }; // fallback; real value loaded async
    document.getElementById('inv-due-date').value = addDays(issueDate, 30);
  }

  function onClientChange() {
    const sel = document.getElementById('inv-client');
    const clientId = sel?.value;
    const client = clients.find(c => String(c.id) === String(clientId));
    const preview = document.getElementById('inv-client-preview');
    if (preview) {
      preview.innerHTML = clientPreviewHTML(client);
      preview.style.display = client ? 'block' : 'none';
    }
    // Auto-set BTW reverse charge for EU clients
    if (client?.btw_reverse_charge) {
      const radio = document.querySelector('input[name="btw-mode"][value="reverse"]');
      if (radio) { radio.checked = true; recalc(); }
    }
  }

  function clientPreviewHTML(client) {
    if (!client) return '';
    return `<strong>${UI.esc(client.name)}</strong><br>
      ${UI.esc(client.address || '')} ${UI.esc(client.city || '')} ${UI.esc(client.country || '')}<br>
      ${client.vat_number ? `VAT: ${UI.esc(client.vat_number)}` : ''}
      ${client.btw_reverse_charge ? ' · <span style="color:var(--accent-blue)">Reverse Charge</span>' : ''}`;
  }

  function goToNewClient() {
    UI.closeModal();
    App.navigate('contacts');
    UI.toast('Dodaj klienta, a następnie wróć do faktur.', 'info');
  }

  function collectFormData(status) {
    const rows = document.querySelectorAll('#inv-items-body tr');
    const items = Array.from(rows).map(row => ({
      description: row.querySelector('.item-desc')?.value || '',
      quantity: parseFloat(row.querySelector('.item-qty')?.value) || 1,
      unit: row.querySelector('.item-unit')?.value || 'usługa',
      unit_price: parseFloat(row.querySelector('.item-price')?.value) || 0,
      btw_rate: parseFloat(row.querySelector('.item-btw')?.value) || 0
    })).filter(item => item.description || item.unit_price > 0);

    const btwMode = document.querySelector('input[name="btw-mode"]:checked')?.value;
    const isReverse = btwMode === 'reverse';
    const btwRate = isReverse ? 0 : (btwMode === '21' ? 21 : 0);

    return {
      invoice_number: document.getElementById('inv-number')?.value?.trim(),
      client_id: document.getElementById('inv-client')?.value || null,
      project_id: document.getElementById('inv-project')?.value || null,
      issue_date: document.getElementById('inv-issue-date')?.value,
      due_date: document.getElementById('inv-due-date')?.value,
      sale_date: document.getElementById('inv-sale-date')?.value || null,
      paid_date: document.getElementById('inv-paid-date')?.value || null,
      currency: document.getElementById('inv-currency')?.value || 'EUR',
      exchange_rate: parseFloat(document.getElementById('inv-exchange')?.value) || 1,
      btw_rate: btwRate,
      btw_reverse_charge: isReverse ? 1 : 0,
      notes: document.getElementById('inv-notes')?.value || '',
      reference: document.getElementById('inv-reference')?.value || '',
      status: document.getElementById('inv-status')?.value || status || 'draft',
      items
    };
  }

  async function saveInvoice(id, status) {
    const data = collectFormData(status);
    if (!data.invoice_number) { UI.toast('Nr faktury jest wymagany.', 'warning'); return null; }
    if (!data.issue_date || !data.due_date) { UI.toast('Daty są wymagane.', 'warning'); return null; }

    try {
      let result;
      if (id) {
        result = await window.api.invoices.update(id, data);
        UI.toast('Faktura zaktualizowana.', 'success');
      } else {
        result = await window.api.invoices.create(data);
        UI.toast('Faktura zapisana.', 'success');
      }
      UI.closeModal();
      await refresh();
      return result?.id || id;
    } catch (err) {
      UI.toast('Błąd zapisu: ' + err.message, 'error');
      return null;
    }
  }

  async function saveAndExportPDF(id) {
    const savedId = await saveInvoice(id, 'sent');
    if (savedId) {
      setTimeout(() => exportPDF(savedId), 300);
    }
  }

  // ── Mark paid ────────────────────────────────────────────
  function markPaid(id) {
    const inv = allInvoices.find(i => i.id === id);
    UI.openModal('✅ Oznacz jako zapłaconą', `
      <p style="margin-bottom:16px">Faktura: <strong>${UI.esc(inv?.invoice_number || '')}</strong></p>
      <div class="form-group">
        <label>Data otrzymania płatności</label>
        <input type="date" id="paid-date" value="${todayStr()}">
      </div>`, {
      footer: `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
        <button class="btn btn-success" onclick="PageInvoices.confirmMarkPaid(${id})">✅ Potwierdź</button>`
    });
  }

  async function confirmMarkPaid(id) {
    const date = document.getElementById('paid-date')?.value || todayStr();
    try {
      await window.api.invoices.markPaid(id, date);
      UI.closeModal();
      UI.toast('Faktura oznaczona jako zapłacona.', 'success');
      await refresh();
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  // ── Delete ───────────────────────────────────────────────
  function deleteInvoice(id) {
    const inv = allInvoices.find(i => i.id === id);
    UI.openModal('🗑 Usuń fakturę', `
      <p>Czy na pewno chcesz usunąć fakturę <strong>${UI.esc(inv?.invoice_number || '')}</strong>?</p>
      <p style="color:var(--accent-red);font-size:13px;margin-top:8px">Tej operacji nie można cofnąć.</p>`, {
      footer: `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
        <button class="btn btn-danger" onclick="PageInvoices.confirmDelete(${id})">🗑 Usuń</button>`
    });
  }

  async function confirmDelete(id) {
    try {
      await window.api.invoices.delete(id);
      UI.closeModal();
      UI.toast('Faktura usunięta.', 'success');
      await refresh();
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  // ── Duplicate ────────────────────────────────────────────
  async function duplicate(id) {
    try {
      await window.api.invoices.duplicate(id);
      UI.toast('Faktura zduplikowana.', 'success');
      await refresh();
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  // ── Podgląd faktury (read-only) ──────────────────────────
  async function openView(id) {
    try {
      const inv = await window.api.invoices.getById(id);
      if (!inv) { UI.toast('Faktura nie znaleziona.', 'error'); return; }

      const items = (inv.items || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const clientLines = [
        inv.company_name && inv.company_name !== inv.client_name ? inv.company_name : '',
        inv.client_address,
        [inv.client_postcode, inv.client_city].filter(Boolean).join(' '),
        inv.client_country,
        inv.client_vat ? `BTW: ${inv.client_vat}` : '',
        inv.client_email
      ].filter(Boolean).map(l => `<div class="text-muted" style="font-size:13px">${UI.esc(l)}</div>`).join('');

      const itemsRows = items.length ? items.map(it => `
        <tr>
          <td>${UI.esc(it.description || '—')}</td>
          <td class="mono" style="text-align:right">${Number(it.quantity || 0)}</td>
          <td style="text-align:center">${UI.esc(it.unit || '')}</td>
          <td class="mono" style="text-align:right">${fmtAmount(it.unit_price, inv.currency)}</td>
          <td class="mono" style="text-align:right">${fmtAmount(it.total, inv.currency)}</td>
        </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:12px">Brak pozycji</td></tr>`;

      const btwLabel = inv.btw_reverse_charge ? 'BTW (reverse charge)' : `BTW (${inv.btw_rate || 0}%)`;

      const body = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div class="mono" style="font-size:18px;font-weight:700">${UI.esc(inv.invoice_number)}</div>
          ${statusBadge(inv.status)}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:6px">Klient</div>
            <div style="font-weight:600">${UI.esc(inv.client_name || '—')}</div>
            ${clientLines}
          </div>
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:6px">Daty</div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span class="text-muted">Wystawiona</span><span class="mono">${fmtDate(inv.issue_date)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span class="text-muted">Termin</span><span class="mono">${fmtDate(inv.due_date)}</span></div>
            ${inv.paid_date ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span class="text-muted">Zapłacona</span><span class="mono">${fmtDate(inv.paid_date)}</span></div>` : ''}
            ${inv.project_name ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span class="text-muted">Projekt</span><span>${UI.esc(inv.project_name)}</span></div>` : ''}
          </div>
        </div>

        <table style="width:100%;margin-bottom:16px">
          <thead><tr>
            <th>Opis</th>
            <th style="text-align:right">Ilość</th>
            <th style="text-align:center">Jedn.</th>
            <th style="text-align:right">Cena</th>
            <th style="text-align:right">Wartość</th>
          </tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div style="max-width:280px;margin-left:auto">
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px"><span class="text-muted">Netto</span><span class="mono">${fmtAmount(inv.subtotal, inv.currency)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px"><span class="text-muted">${btwLabel}</span><span class="mono">${fmtAmount(inv.btw_amount, inv.currency)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:16px;font-weight:700;border-top:2px solid var(--border);color:var(--accent-orange)"><span>Do zapłaty</span><span class="mono">${fmtAmount(inv.total, inv.currency)}</span></div>
        </div>

        ${inv.notes ? `<div style="margin-top:16px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:6px">Uwagi</div><div style="font-size:13px">${UI.esc(inv.notes)}</div></div>` : ''}
      `;

      const footer = `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Zamknij</button>
        <button class="btn btn-secondary" onclick="PageInvoices.openEdit(${id})">✏️ Edytuj</button>
        ${inv.pdf_path
          ? `<button class="btn btn-primary" onclick="PageInvoices.openPDF(${id})">👁 Otwórz PDF</button>`
          : `<button class="btn btn-primary" onclick="PageInvoices.exportPDF(${id})">📄 Eksportuj PDF</button>`}
      `;

      UI.openModal(`Podgląd faktury`, body, { size: 'lg', footer });
    } catch (err) {
      UI.toast('Błąd: ' + err.message, 'error');
    }
  }

  // ── PDF export ───────────────────────────────────────────
  async function exportPDF(id) {
    try {
      UI.toast('Generowanie PDF…', 'info');
      const path = await window.api.invoices.exportPDF(id);
      if (path) {
        UI.toast('PDF zapisany!', 'success');
        await refresh();
      }
    } catch (err) {
      UI.toast('Błąd PDF: ' + err.message, 'error');
    }
  }

  async function openPDF(id) {
    const inv = allInvoices.find(i => i.id === id);
    if (inv?.pdf_path) {
      await window.api.util.openFile(inv.pdf_path);
    } else {
      exportPDF(id);
    }
  }

  // ── Przypomnienia / wezwania do zapłaty ──────────────────
  let _payEmailInv = null;
  let _payEmailProfile = null;

  async function openPaymentEmail(id) {
    try {
      _payEmailInv = await window.api.invoices.getById(id);
      _payEmailProfile = await window.api.profile.get();
    } catch (err) { UI.toast('Błąd: ' + err.message, 'error'); return; }
    if (!_payEmailInv) return;

    UI.openModal('✉️ Przypomnienie / wezwanie do zapłaty', `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
        <label style="font-size:13px">Rodzaj:
          <select id="pe-kind" onchange="PageInvoices.refreshPayEmail()" style="margin-left:6px">
            <option value="reminder">Przypomnienie (uprzejme)</option>
            <option value="demand">Wezwanie do zapłaty (stanowcze)</option>
          </select>
        </label>
        <label style="font-size:13px">Język:
          <select id="pe-lang" onchange="PageInvoices.refreshPayEmail()" style="margin-left:6px">
            <option value="nl">Niderlandzki</option>
            <option value="en">Angielski</option>
            <option value="pl">Polski</option>
          </select>
        </label>
      </div>
      <div class="form-group">
        <label>Do (e-mail klienta)</label>
        <input type="text" id="pe-to" value="${UI.esc(_payEmailInv.client_email || '')}" placeholder="brak e-maila w kontakcie">
      </div>
      <div class="form-group">
        <label>Temat</label>
        <input type="text" id="pe-subject">
      </div>
      <div class="form-group">
        <label>Treść</label>
        <textarea id="pe-body" rows="12" style="font-family:inherit"></textarea>
      </div>`,
      {
        size: 'lg',
        footer: `
          <button class="btn btn-secondary" onclick="UI.closeModal()">Zamknij</button>
          <button class="btn btn-secondary" onclick="PageInvoices.copyPayEmail()">📋 Kopiuj treść</button>
          <button class="btn btn-primary" onclick="PageInvoices.openPayEmailInMail()">✉️ Otwórz w programie pocztowym</button>`,
        onOpen: () => refreshPayEmail()
      }
    );
  }

  function refreshPayEmail() {
    const kind = document.getElementById('pe-kind')?.value || 'reminder';
    const lang = document.getElementById('pe-lang')?.value || 'nl';
    const { subject, body } = _buildPayEmail(kind, lang, _payEmailInv, _payEmailProfile);
    const s = document.getElementById('pe-subject'); if (s) s.value = subject;
    const b = document.getElementById('pe-body'); if (b) b.value = body;
  }

  function _daysOverdue(dueDate) {
    if (!dueDate) return 0;
    const diff = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
    return Math.max(0, diff);
  }

  function _buildPayEmail(kind, lang, inv, profile) {
    const nr = inv.invoice_number || '';
    const amount = fmtAmount(inv.total, inv.currency || 'EUR');
    const due = fmtDate(inv.due_date);
    const overdue = _daysOverdue(inv.due_date);
    const iban = profile?.iban || '';
    const company = profile?.name || '';
    const clientName = inv.company_name || inv.client_name || '';

    const T = {
      nl: {
        reminderSubj: `Betalingsherinnering factuur ${nr}`,
        demandSubj: `Aanmaning – openstaande factuur ${nr}`,
        reminder:
`Geachte heer/mevrouw,

Onze administratie geeft aan dat factuur ${nr} van ${amount} nog niet is voldaan. De vervaldatum was ${due}.

Mogelijk is dit aan uw aandacht ontsnapt. Ik verzoek u vriendelijk het bedrag over te maken op ${iban} onder vermelding van factuurnummer ${nr}.

Heeft u de betaling reeds gedaan? Dan kunt u dit bericht als niet verzonden beschouwen.

Met vriendelijke groet,
${company}`,
        demand:
`Geachte heer/mevrouw,

Ondanks eerdere herinnering is factuur ${nr} van ${amount} nog steeds niet voldaan. De factuur is inmiddels ${overdue} dagen over de vervaldatum (${due}).

Ik verzoek u het openstaande bedrag binnen 7 dagen over te maken op ${iban} onder vermelding van factuurnummer ${nr}. Bij uitblijven van betaling zie ik mij genoodzaakt verdere stappen te ondernemen.

Met vriendelijke groet,
${company}`
      },
      en: {
        reminderSubj: `Payment reminder – invoice ${nr}`,
        demandSubj: `Final notice – overdue invoice ${nr}`,
        reminder:
`Dear Sir or Madam,

Our records show that invoice ${nr} for ${amount} has not yet been paid. The due date was ${due}.

This may have escaped your attention. I kindly ask you to transfer the amount to ${iban}, quoting invoice number ${nr}.

If you have already made the payment, please disregard this message.

Kind regards,
${company}`,
        demand:
`Dear Sir or Madam,

Despite an earlier reminder, invoice ${nr} for ${amount} remains unpaid. The invoice is now ${overdue} days overdue (due date ${due}).

Please transfer the outstanding amount within 7 days to ${iban}, quoting invoice number ${nr}. Should payment not be received, I will be obliged to take further action.

Kind regards,
${company}`
      },
      pl: {
        reminderSubj: `Przypomnienie o płatności – faktura ${nr}`,
        demandSubj: `Wezwanie do zapłaty – faktura ${nr}`,
        reminder:
`Szanowni Państwo,

Zgodnie z naszą ewidencją faktura ${nr} na kwotę ${amount} nie została jeszcze opłacona. Termin płatności minął ${due}.

Prawdopodobnie umknęło to Państwa uwadze. Uprzejmie proszę o przelew na konto ${iban} z dopiskiem numeru faktury ${nr}.

Jeśli płatność została już dokonana, proszę zignorować tę wiadomość.

Z poważaniem,
${company}`,
        demand:
`Szanowni Państwo,

Pomimo wcześniejszego przypomnienia faktura ${nr} na kwotę ${amount} nadal pozostaje nieopłacona. Faktura jest przeterminowana o ${overdue} dni (termin: ${due}).

Proszę o uregulowanie należności w ciągu 7 dni na konto ${iban}, z dopiskiem numeru faktury ${nr}. W przypadku braku wpłaty będę zmuszony podjąć dalsze kroki.

Z poważaniem,
${company}`
      }
    };

    const t = T[lang] || T.nl;
    return {
      subject: kind === 'demand' ? t.demandSubj : t.reminderSubj,
      body: kind === 'demand' ? t.demand : t.reminder
    };
  }

  async function copyPayEmail() {
    const subject = document.getElementById('pe-subject')?.value || '';
    const body = document.getElementById('pe-body')?.value || '';
    const text = subject + '\n\n' + body;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      UI.toast('Skopiowano treść.', 'success');
    } catch { UI.toast('Nie udało się skopiować.', 'error'); }
  }

  async function openPayEmailInMail() {
    const to = document.getElementById('pe-to')?.value?.trim() || '';
    const subject = document.getElementById('pe-subject')?.value || '';
    const body = document.getElementById('pe-body')?.value || '';
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const ok = await window.api.util.openExternal(url);
    if (!ok) UI.toast('Nie udało się otworzyć programu pocztowego.', 'warning');
  }

  // ── UBL (XML) export ─────────────────────────────────────
  async function exportUBL(id) {
    try {
      UI.toast('Generowanie UBL XML…', 'info');
      const path = await window.api.invoices.exportUBL(id);
      if (path) UI.toast('XML zapisany!', 'success');
    } catch (err) {
      UI.toast('Błąd XML: ' + err.message, 'error');
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  function statusBadge(status) {
    const map = {
      draft: ['badge-muted', '🔵 Robocza'],
      sent: ['badge-warning', '🟡 Wysłana'],
      paid: ['badge-success', '🟢 Zapłacona'],
      overdue: ['badge-danger', '🔴 Przetermn.'],
      cancelled: ['badge-muted', '⚫ Anulowana']
    };
    const [cls, label] = map[status] || ['badge-muted', status];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function statusLabel(s) {
    return { draft: 'Robocza', sent: 'Wysłana', paid: 'Zapłacona', overdue: 'Przeterminowana', cancelled: 'Anulowana' }[s] || s;
  }

  function fmtDate(d) {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`;
    } catch { return d; }
  }

  function fmtAmount(v, currency = 'EUR') {
    const syms = { EUR:'€', USD:'$', GBP:'£', PLN:'zł' };
    return `${syms[currency] || currency}${Number(v||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',')}`;
  }

  function fmtEur(v) {
    return new Intl.NumberFormat('nl-NL', { style:'currency', currency:'EUR' }).format(v||0);
  }

  function todayStr() { return new Date().toISOString().split('T')[0]; }
  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  // ── eFaktura.nl Import Wizard ────────────────────────────────
  async function openImportWizard() {
    const paths = await window.api.efaktura.pickFiles();
    if (!paths.length) return;
    const btn = document.querySelector('[onclick*="openImportWizard"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Analizuję…'; }
    let results;
    try {
      results = await window.api.efaktura.analyze(paths, 'invoice');
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = '📥 Import XML/PDF'; }
      UI.toast('Błąd analizy plików: ' + err.message, 'error');
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = '📥 Import XML/PDF'; }
    _showImportPreviewModal(results);
  }

  function _showImportPreviewModal(results) {
    _importResults = results;
    const okCount      = results.filter(r => r.status !== 'error' && r.status !== 'skipped').length;
    const errorCount   = results.filter(r => r.status === 'error').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    const rows = results.map((r, idx) => {
      const d = r.data || {};
      let statusIcon, statusTitle, disabled, checked, rowClass;
      if (r.status === 'error') {
        statusIcon = '❌'; statusTitle = r.error || 'Błąd parsowania';
        disabled = 'disabled'; checked = ''; rowClass = 'row-error';
      } else if (r.status === 'skipped') {
        statusIcon = 'ℹ️'; statusTitle = r._skipReason || 'Pominięto — używany plik XML';
        disabled = 'disabled'; checked = ''; rowClass = '';
      } else {
        statusIcon = r.status === 'warn' ? '⚠️' : '✅';
        statusTitle = (r.warnings || []).join('; ') || 'OK';
        disabled = ''; checked = 'checked'; rowClass = '';
      }
      return `
        <tr class="${rowClass}" style="${r.status === 'skipped' ? 'opacity:0.45' : ''}">
          <td style="text-align:center"><input type="checkbox" class="imp-chk" data-idx="${idx}" ${checked} ${disabled}></td>
          <td title="${UI.escHtml(r.file || '')}" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${UI.escHtml(r.basename || r.file || '')}</td>
          <td>${UI.escHtml(d.invoice_number || '—')}</td>
          <td>${UI.escHtml(d.issue_date || '—')}</td>
          <td>${UI.escHtml(d._clientName || '—')}</td>
          <td style="text-align:right">${(d._totalIncl || d._totalExcl) ? '€' + Number(d._totalIncl || d._totalExcl).toFixed(2) : (d.items?.length ? '€' + d.items.reduce((s,i)=>s+Number(i.unit_price||0)*Number(i.quantity||1),0).toFixed(2) : '—')}</td>
          <td style="text-align:center" title="${UI.escHtml(statusTitle)}">${statusIcon}</td>
        </tr>`;
    }).join('');

    const skippedNote = skippedCount > 0
      ? ` · ℹ️ ${skippedCount} pominięte (XML preferowany)`
      : '';
    const html = `
      <div id="import-modal-overlay" class="modal-overlay" style="z-index:9999">
        <div class="modal" style="max-width:820px;width:95vw">
          <div class="modal-header">
            <h3>📥 Import faktur z efaktura.nl</h3>
            <button class="modal-close" onclick="document.getElementById('import-modal-overlay').remove()">×</button>
          </div>
          <div class="modal-body">
            <p style="margin-bottom:8px;color:var(--text-muted)">
              Znaleziono <strong>${results.length}</strong> plików — ✅ ${okCount} gotowe, ❌ ${errorCount} błędy${skippedNote}.<br>
              Odznacz wiersze które chcesz pominąć, a następnie kliknij <em>Importuj zaznaczone</em>.
            </p>
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px;cursor:pointer">
              <input type="checkbox" id="imp-mark-paid" checked style="width:15px;height:15px">
              <span>Importuj jako <strong>zapłacone</strong> (data wystawienia = data wpłaty) — <em>zalecane dla historycznych faktur</em></span>
            </label>
            <div style="overflow-x:auto;max-height:420px;overflow-y:auto">
              <table class="data-table" style="width:100%;font-size:13px">
                <thead>
                  <tr>
                    <th style="width:36px"><input type="checkbox" id="imp-chk-all" checked onchange="document.querySelectorAll('.imp-chk:not(:disabled)').forEach(c=>c.checked=this.checked)"></th>
                    <th>Plik</th>
                    <th>Numer</th>
                    <th>Data</th>
                    <th>Klient</th>
                    <th style="text-align:right">Kwota</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:10px;padding:16px">
            <button class="btn btn-secondary" onclick="document.getElementById('import-modal-overlay').remove()">Anuluj</button>
            <button class="btn btn-primary" id="imp-do-btn" onclick="PageInvoices.doImport()">
              Importuj zaznaczone
            </button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    // Update button label when checkboxes change
    document.getElementById('import-modal-overlay').addEventListener('change', _updateImportBtnLabel);
    _updateImportBtnLabel();
  }

  function _updateImportBtnLabel() {
    const btn = document.getElementById('imp-do-btn');
    if (!btn) return;
    const n = document.querySelectorAll('.imp-chk:checked').length;
    btn.textContent = `Importuj zaznaczone (${n})`;
    btn.disabled = n === 0;
  }

  async function doImport() {
    const checkboxes = document.querySelectorAll('.imp-chk');
    const markPaid = document.getElementById('imp-mark-paid')?.checked !== false;
    const selected = _importResults.filter((_, i) => checkboxes[i]?.checked).map(item => ({
      ...item,
      data: item.data ? { ...item.data, status: markPaid ? 'paid' : 'sent', paid_date: markPaid ? item.data.issue_date : undefined } : item.data
    }));
    if (!selected.length) return;

    document.getElementById('import-modal-overlay')?.remove();
    try {
      const r = await window.api.efaktura.importInvoices(selected);
      const msg = `✅ Zaimportowano ${r.imported} faktur` +
        (r.skipped   ? `, pominięto ${r.skipped}`       : '') +
        (r.errors?.length ? `, błędy: ${r.errors.length}` : '');
      UI.toast(msg, r.errors?.length ? 'warning' : 'success');
      await refresh();
    } catch (err) {
      UI.toast('Błąd importu: ' + err.message, 'error');
    }
  }

  function yearOptions() {
    const cur = new Date().getFullYear();
    return [cur+1, cur, cur-1, cur-2].map(y =>
      `<option value="${y}" ${y == filters.year ? 'selected' : ''}>${y}</option>`
    ).join('');
  }

  function monthOptions() {
    const names = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
                   'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
    return names.map((n, i) =>
      `<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0') == filters.month ? 'selected' : ''}>${n}</option>`
    ).join('');
  }

  return {
    load, refresh, openCreate, openEdit, openView,
    addItem, recalc, onBtwModeChange, updateDueDate,
    onClientChange, goToNewClient,
    saveInvoice, saveAndExportPDF,
    markPaid, confirmMarkPaid,
    deleteInvoice, confirmDelete,
    duplicate, exportPDF, openPDF, exportUBL,
    applyFilters, clearFilters,
    openImportWizard, doImport,
    addProductItem, openProducts, saveProduct, deleteProduct,
    openPaymentEmail, refreshPayEmail, copyPayEmail, openPayEmailInMail
  };
})();

window.PageInvoices = PageInvoices;

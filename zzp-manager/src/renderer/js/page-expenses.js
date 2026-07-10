/* Expenses page */
'use strict';

const PageExpenses = (() => {
  const CATEGORIES = [
    'Sprzęt IT',
    'Internet / Telefon',
    'Oprogramowanie / Licencje',
    'Transport / Paliwo',
    'Biuro / Materiały',
    'Marketing / Reklama',
    'Księgowość / Prawnik',
    'Szkolenia / Kursy',
    'Inne'
  ];

  let allExpenses = [];
  let allProjects = [];
  let editingExpenseId = null;
  let currentFilters = { year: new Date().getFullYear(), month: '', category: '', project_id: '', incomplete: false };
  let _importResults = []; // held in closure for import wizard

  // ── Entry point ──────────────────────────────────────────
  async function load() {
    const now = new Date();
    currentFilters = { year: now.getFullYear(), month: '', category: '', project_id: '' };

    document.getElementById('page-content').innerHTML = renderSkeleton();

    try {
      allProjects = await window.api.projects.getAll();
      await refresh();
      bindToolbar();
    } catch (err) {
      console.error('Expenses load error:', err);
      document.getElementById('page-content').innerHTML +=
        `<div class="alert alert-danger">Błąd ładowania: ${UI.esc(err.message)}</div>`;
    }
  }

  function renderSkeleton() {
    return `
      <div class="page" id="expenses-page">
        <div class="page-header">
          <h1 class="page-title">💸 Koszty firmowe</h1>
          <div class="page-actions">
            <button class="btn btn-secondary" onclick="PageExpenses.openImportWizard()" title="Importuj faktury kosztowe z efaktura.nl (XML/PDF)">📥 Import XML/PDF</button>
            <button class="btn btn-primary" onclick="PageExpenses.openCreate()">+ Dodaj koszt</button>
          </div>
        </div>
        <div class="filter-bar" id="exp-filters"></div>
        <div id="exp-summary"></div>
        <div id="exp-table-wrap"><div class="card" style="padding:40px;text-align:center;color:var(--text-muted)">Ładowanie…</div></div>
      </div>`;
  }

  function bindToolbar() {
    const filtersEl = document.getElementById('exp-filters');
    if (!filtersEl) return;

    const years = [];
    const y = new Date().getFullYear();
    for (let i = y; i >= y - 4; i--) years.push(i);

    const monthNames = ['','Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

    filtersEl.innerHTML = `
      <select class="filter-select" id="exp-f-year">
        ${years.map(yr => `<option value="${yr}" ${yr === currentFilters.year ? 'selected' : ''}>${yr}</option>`).join('')}
      </select>
      <select class="filter-select" id="exp-f-month">
        <option value="">Wszystkie miesiące</option>
        ${monthNames.slice(1).map((n,i) => `<option value="${i+1}" ${currentFilters.month == i+1 ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <select class="filter-select" id="exp-f-cat">
        <option value="">Wszystkie kategorie</option>
        ${CATEGORIES.map(c => `<option value="${c}" ${currentFilters.category === c ? 'selected' : ''}>${UI.esc(c)}</option>`).join('')}
      </select>
      <select class="filter-select" id="exp-f-proj">
        <option value="">Wszystkie projekty</option>
        ${allProjects.map(p => `<option value="${p.id}">${UI.esc(p.name)}</option>`).join('')}
      </select>
      <label class="filter-select" style="display:flex;align-items:center;gap:8px;white-space:nowrap">
        <input type="checkbox" id="exp-f-incomplete" ${currentFilters.incomplete ? 'checked' : ''}>
        Pokaż tylko nieuzupełnione
      </label>
      <input type="text" class="filter-select" id="exp-search" placeholder="🔍 Szukaj…" style="min-width:160px" value="">
    `;

    document.getElementById('exp-f-year').addEventListener('change', e => { currentFilters.year = +e.target.value; refresh(); });
    document.getElementById('exp-f-month').addEventListener('change', e => { currentFilters.month = e.target.value; refresh(); });
    document.getElementById('exp-f-cat').addEventListener('change', e => { currentFilters.category = e.target.value; refresh(); });
    document.getElementById('exp-f-proj').addEventListener('change', e => { currentFilters.project_id = e.target.value; refresh(); });
    document.getElementById('exp-f-incomplete').addEventListener('change', e => { currentFilters.incomplete = e.target.checked; refresh(); });
    document.getElementById('exp-search').addEventListener('input', e => { renderTable(filterLocal(e.target.value)); });
  }

  async function refresh() {
    try {
      const filters = {};
      if (currentFilters.year)       filters.year = currentFilters.year;
      if (currentFilters.month)      filters.month = currentFilters.month;
      if (currentFilters.category)   filters.category = currentFilters.category;
      if (currentFilters.project_id) filters.project_id = currentFilters.project_id;
      if (currentFilters.incomplete) filters.incomplete = true;

      allExpenses = await window.api.expenses.getAll(filters);
      renderSummary();
      renderTable(allExpenses);
    } catch (err) {
      UI.toast('Błąd odczytu kosztów: ' + err.message, 'error');
    }
  }

  function filterLocal(q) {
    if (!q) return allExpenses;
    const lq = q.toLowerCase();
    return allExpenses.filter(e =>
      e.description.toLowerCase().includes(lq) ||
      e.vendor?.toLowerCase().includes(lq) ||
      e.category.toLowerCase().includes(lq)
    );
  }

  function renderSummary() {
    const el = document.getElementById('exp-summary');
    if (!el) return;
    const total = allExpenses.reduce((s, e) => s + (e.amount_eur || 0), 0);
    const btw   = allExpenses.reduce((s, e) => s + (e.btw_deductible ? (e.btw_amount || 0) : 0), 0);
    const ded   = allExpenses.filter(e => e.is_deductible).reduce((s, e) => s + (e.amount_eur || 0), 0);
    const pct   = total > 0 ? Math.round((ded / total) * 100) : 100;

    el.innerHTML = `
      <div class="summary-chips" style="margin-bottom:16px">
        <div class="summary-chip"><span>Suma kosztów</span><strong>${fmt(total)}</strong></div>
        <div class="summary-chip"><span>BTW odliczalna</span><strong style="color:var(--accent-green)">${fmt(btw)}</strong></div>
        <div class="summary-chip"><span>Koszty odliczalne</span><strong>${fmt(ded)} (${pct}%)</strong></div>
        <div class="summary-chip"><span>Wpisów</span><strong>${allExpenses.length}</strong></div>
      </div>`;
  }

  function renderTable(rows) {
    const wrap = document.getElementById('exp-table-wrap');
    if (!wrap) return;

    if (!rows.length) {
      wrap.innerHTML = `<div class="card" style="padding:60px;text-align:center;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:12px">💸</div>
        <div>Brak kosztów dla wybranych filtrów.</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="PageExpenses.openCreate()">+ Dodaj pierwszy koszt</button>
      </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Kategoria</th>
              <th>Opis</th>
              <th class="text-right">Kwota</th>
              <th class="text-right">BTW</th>
              <th>Dostawca</th>
              <th style="text-align:center">Załączniki</th>
              <th>Projekt</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(e => `
              <tr>
                <td class="mono">${UI.formatDate(e.date)}</td>
                <td><span class="badge badge-muted">${UI.esc(e.category)}</span></td>
                <td>${UI.esc(e.description)}</td>
                <td class="text-right amount">${fmt(e.amount_eur)}</td>
                <td class="text-right" style="color:var(--text-muted);font-size:12px">${e.btw_amount > 0 ? fmt(e.btw_amount) : '—'}</td>
                <td style="font-size:12px;color:var(--text-secondary)">${UI.esc(e.vendor || '—')}</td>
                <td style="text-align:center">
                  <button class="btn btn-sm btn-secondary" onclick="PageExpenses.openAttachments(${e.id})">${e.attachment_count || 0} 📎</button>
                </td>
                <td style="font-size:12px;color:var(--text-secondary)">${UI.esc(e.project_name || '—')}</td>
                <td class="table-actions">
                  <button class="btn btn-sm btn-secondary" onclick="PageExpenses.openEdit(${e.id})">✏️</button>
                  <button class="btn btn-sm btn-danger"    onclick="PageExpenses.deleteExpense(${e.id})">🗑</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── Create / Edit ────────────────────────────────────────
  function openCreate() {
    openForm(null);
  }

  async function openEdit(id) {
    const exp = allExpenses.find(e => e.id === id);
    if (!exp) return;
    openForm(exp);
  }

  function openForm(exp = null) {
    const isEdit = !!exp;
    editingExpenseId = exp?.id || null;
    const today = new Date().toISOString().split('T')[0];

    UI.openModal(isEdit ? '✏️ Edytuj koszt' : '+ Dodaj koszt firmowy', `
      <div class="split-view">
        <div class="split-panel doc-panel">
          <div class="doc-thumbs" id="exp-thumbs"></div>
          <div class="doc-viewer" id="exp-doc-viewer"></div>
        </div>
        <div class="split-panel form-panel">
        <div class="form-group">
          <label>Data *</label>
          <input type="date" id="ef-date" value="${exp?.date || today}">
        </div>
        <div class="form-group">
          <label>Kategoria *</label>
          <select id="ef-cat">
            ${CATEGORIES.map(c => `<option value="${c}" ${exp?.category === c ? 'selected' : ''}>${UI.esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group full">
          <label>Opis *</label>
          <input type="text" id="ef-desc" placeholder="np. Licencja Adobe Premiere Pro" value="${UI.esc(exp?.description || '')}">
        </div>
        <div class="form-group">
          <label>Dostawca</label>
          <input type="text" id="ef-vendor" placeholder="np. Adobe Inc." value="${UI.esc(exp?.vendor || '')}">
        </div>
        <div class="form-group">
          <label>Projekt</label>
          <select id="ef-proj">
            <option value="">— brak —</option>
            ${allProjects.map(p => `<option value="${p.id}" ${exp?.project_id == p.id ? 'selected' : ''}>${UI.esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Kwota brutto (€) *</label>
          <input type="number" id="ef-amount" step="0.01" min="0" placeholder="0.00" value="${exp?.amount || ''}">
        </div>
        <div class="form-group">
          <label>Stawka BTW</label>
          <div style="display:flex;gap:12px;align-items:center;padding-top:8px">
            ${[21, 9, 0].map(r => `<label style="display:flex;gap:6px;align-items:center;cursor:pointer">
              <input type="radio" name="ef-btw" value="${r}" ${(exp?.btw_rate ?? 21) == r ? 'checked' : ''}> ${r}%
            </label>`).join('')}
            <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
              <input type="radio" name="ef-btw" value="-1" ${exp?.btw_rate === -1 ? 'checked' : ''}> Brak
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Kwota BTW</label>
          <input type="text" id="ef-btw-amt" readonly placeholder="auto" style="background:var(--bg-tertiary);color:var(--text-muted)">
        </div>
        <div class="form-group">
          <label>Kwota netto</label>
          <input type="text" id="ef-net" readonly placeholder="auto" style="background:var(--bg-tertiary);color:var(--text-muted)">
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="ef-deductible" ${exp?.is_deductible !== 0 ? 'checked' : ''}> Odliczalny podatkowo
          </label>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="ef-btw-ded" ${exp?.btw_deductible !== 0 ? 'checked' : ''}> BTW odliczalna
          </label>
        </div>
        <div class="form-group full">
          <label>Notatki</label>
          <textarea id="ef-notes" rows="2">${UI.esc(exp?.notes || '')}</textarea>
        </div>
        </div>
      </div>
      <div id="ef-err" class="error-msg hidden"></div>
    `, {
      size: 'xl',
      footer: `
        <button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
        <button class="btn btn-primary" onclick="PageExpenses.saveForm(${exp?.id || 'null'})">${isEdit ? '💾 Zapisz zmiany' : '+ Dodaj koszt'}</button>
      `,
      onOpen: () => {
        bindFormCalc();
        recalc();
        loadExpenseDocViewer();
      }
    });
  }

  function bindFormCalc() {
    document.getElementById('ef-amount')?.addEventListener('input', recalc);
    document.querySelectorAll('input[name="ef-btw"]').forEach(r => r.addEventListener('change', recalc));
  }

  function recalc() {
    const amount = parseFloat(document.getElementById('ef-amount')?.value) || 0;
    const btwRate = parseInt(document.querySelector('input[name="ef-btw"]:checked')?.value ?? '21');
    let btwAmt = 0, net = amount;
    if (btwRate > 0) {
      btwAmt = amount * (btwRate / (100 + btwRate));
      net = amount - btwAmt;
    }
    const btwEl = document.getElementById('ef-btw-amt');
    const netEl = document.getElementById('ef-net');
    if (btwEl) btwEl.value = btwRate > 0 ? fmt(btwAmt) : '—';
    if (netEl) netEl.value = fmt(net);
  }

  // ── Viewer dokumentu kosztu (miniatury + duży podgląd), jak w efakturze ──
  let _expAttachments = [];
  let _expSelectedId = null;

  async function loadExpenseDocViewer() {
    const thumbs = document.getElementById('exp-thumbs');
    const viewer = document.getElementById('exp-doc-viewer');
    if (!thumbs || !viewer) return;

    if (!editingExpenseId) {
      thumbs.innerHTML = '';
      viewer.innerHTML = '<div class="doc-viewer-hint">Zapisz koszt, aby dodać i podglądać załączniki (paragon / faktura).</div>';
      return;
    }

    _expAttachments = await window.api.expenses.getAttachments(editingExpenseId);
    renderExpenseThumbs();

    if (_expAttachments.length) {
      const stillSelected = _expAttachments.some(a => a.id === _expSelectedId);
      selectExpenseAttachment(stillSelected ? _expSelectedId : _expAttachments[0].id);
    } else {
      _expSelectedId = null;
      viewer.innerHTML = '<div class="doc-viewer-hint">Brak załączników. Kliknij „+", aby dodać paragon lub fakturę.</div>';
    }
  }

  function renderExpenseThumbs() {
    const thumbs = document.getElementById('exp-thumbs');
    if (!thumbs) return;
    const tiles = _expAttachments.map(a => {
      const isImg = /\.(png|jpe?g|gif)$/i.test(a.file_path);
      const active = a.id === _expSelectedId ? ' active' : '';
      const inner = isImg ? `<img data-thumb="${a.id}" alt="">` : `<div class="thumb-pdf">PDF</div>`;
      return `<div class="doc-thumb${active}" title="${UI.esc(a.file_name)}" onclick="PageExpenses.selectExpenseAttachment(${a.id})">
          ${inner}
          <button class="thumb-del" title="Usuń załącznik" onclick="event.stopPropagation();PageExpenses.deleteAttachmentFromViewer(${a.id})">✕</button>
        </div>`;
    }).join('');
    thumbs.innerHTML = tiles + `<div class="doc-thumb doc-thumb-add" title="Dodaj załącznik" onclick="PageExpenses.addAttachmentToViewer()">＋</div>`;

    // Miniatury obrazów doładowujemy asynchronicznie jako data: URL
    _expAttachments.forEach(async a => {
      if (!/\.(png|jpe?g|gif)$/i.test(a.file_path)) return;
      const url = await window.api.util.readFileAsDataUrl(a.file_path);
      const img = thumbs.querySelector(`img[data-thumb="${a.id}"]`);
      if (img && url) img.src = url;
    });
  }

  async function selectExpenseAttachment(id) {
    _expSelectedId = id;
    renderExpenseThumbs();
    const viewer = document.getElementById('exp-doc-viewer');
    if (!viewer) return;
    const att = _expAttachments.find(a => a.id === id);
    if (!att) return;
    viewer.innerHTML = '<div class="doc-viewer-hint">Ładowanie…</div>';
    const url = await window.api.util.readFileAsDataUrl(att.file_path);
    if (_expSelectedId !== id) return; // wybrano inny w międzyczasie
    if (!url) { viewer.innerHTML = '<div class="doc-viewer-hint">Nie udało się wczytać pliku.</div>'; return; }
    if (/\.pdf$/i.test(att.file_path)) {
      viewer.innerHTML = `<embed src="${url}" type="application/pdf" class="doc-viewer-embed">`;
    } else {
      viewer.innerHTML = `<img src="${url}" class="doc-viewer-img" alt="${UI.esc(att.file_name)}">`;
    }
  }

  async function addAttachmentToViewer() {
    if (!editingExpenseId) { UI.toast('Najpierw zapisz koszt, potem dodasz załączniki.', 'warning'); return; }
    const added = await window.api.expenses.addAttachment(editingExpenseId);
    if (added && added.length) _expSelectedId = added[0].id;
    await loadExpenseDocViewer();
    await refresh();
  }

  async function deleteAttachmentFromViewer(id) {
    const ok = await UI.confirm('Czy na pewno usunąć ten załącznik?', 'Usuń załącznik');
    if (!ok) return;
    await window.api.expenses.deleteAttachment(id);
    if (_expSelectedId === id) _expSelectedId = null;
    await loadExpenseDocViewer();
    await refresh();
  }

  async function saveForm(id) {
    const errEl = document.getElementById('ef-err');
    const date   = document.getElementById('ef-date').value;
    const cat    = document.getElementById('ef-cat').value;
    const desc   = document.getElementById('ef-desc').value.trim();
    const vendor = document.getElementById('ef-vendor').value.trim();
    const proj   = document.getElementById('ef-proj').value;
    const amount = parseFloat(document.getElementById('ef-amount').value);
    const btwRate = parseInt(document.querySelector('input[name="ef-btw"]:checked')?.value ?? '21');
    const isDeductible = document.getElementById('ef-deductible').checked;
    const btwDed = document.getElementById('ef-btw-ded').checked;
    const notes  = document.getElementById('ef-notes').value.trim();

    if (!date)   { showErr(errEl, 'Data jest wymagana.'); return; }
    if (!desc)   { showErr(errEl, 'Opis jest wymagany.'); return; }
    if (isNaN(amount) || amount < 0) { showErr(errEl, 'Podaj prawidłową kwotę.'); return; }

    const data = {
      date, category: cat, description: desc, vendor,
      project_id: proj || null,
      amount, currency: 'EUR', exchange_rate: 1,
      btw_rate: btwRate >= 0 ? btwRate : 0,
      btw_deductible: btwDed,
      is_deductible: isDeductible,
      notes
    };

    try {
      if (id) {
        await window.api.expenses.update(id, data);
        UI.toast('Koszt zaktualizowany.', 'success');
      } else {
        await window.api.expenses.create(data);
        UI.toast('Koszt dodany.', 'success');
      }
      UI.closeModal();
      await refresh();
    } catch (err) {
      showErr(errEl, err.message);
    }
  }

  async function deleteExpense(id) {
    const ok = await UI.confirm('Czy na pewno usunąć ten koszt?', 'Usuń koszt');
    if (!ok) return;
    try {
      await window.api.expenses.delete(id);
      UI.toast('Koszt usunięty.', 'success');
      await refresh();
    } catch (err) {
      UI.toast('Błąd usuwania: ' + err.message, 'error');
    }
  }

  async function uploadReceipt(id) {
    try {
      const path = await window.api.expenses.uploadReceipt(id);
      if (path) {
        UI.toast('Paragon dodany.', 'success');
        await refresh();
      }
    } catch (err) {
      UI.toast('Błąd uploadu: ' + err.message, 'error');
    }
  }

  async function openReceipt(id, receiptPath) {
    try {
      await window.api.util.openFile(receiptPath);
    } catch (err) {
      UI.toast('Nie można otworzyć pliku.', 'error');
    }
  }

  async function openAttachments(expenseId) {
    try {
      const attachments = await window.api.expenses.getAttachments(expenseId);
      const rows = attachments.map(a => `
        <tr>
          <td style="padding:8px 10px">${UI.esc(a.file_name)}</td>
          <td style="padding:8px 10px">${a.mime_type || '—'}</td>
          <td style="padding:8px 10px">${UI.formatDate(a.created_at)}</td>
          <td style="padding:8px 10px;text-align:right;white-space:nowrap">
            <button class="btn btn-sm btn-secondary" onclick="PageExpenses.openReceipt(${expenseId},'${UI.esc(a.file_path)}')">Otwórz</button>
            <button class="btn btn-sm btn-danger" onclick="PageExpenses.deleteAttachment(${a.id}, ${expenseId})">Usuń</button>
          </td>
        </tr>`).join('');

      const html = `
        <div class="modal-body" style="max-height:420px;overflow:auto">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-size:14px;font-weight:600">Załączniki kosztu #${expenseId}</div>
            <button class="btn btn-sm btn-primary" onclick="PageExpenses.addAttachment(${expenseId})">+ Dodaj załącznik</button>
          </div>
          <table style="width:100%;font-size:13px;border-collapse:collapse">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px">Plik</th>
                <th style="text-align:left;padding:8px">Typ</th>
                <th style="text-align:left;padding:8px">Dodano</th>
                <th style="text-align:right;padding:8px">Akcje</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="4" style="padding:16px;text-align:center;color:var(--text-muted)">Brak załączników.</td></tr>`}
            </tbody>
          </table>
        </div>`;

      UI.openModal(`📎 Załączniki kosztu`, html, {
        size: 'lg',
        footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Zamknij</button>`
      });
    } catch (err) {
      UI.toast('Błąd ładowania załączników: ' + err.message, 'error');
    }
  }

  async function addAttachment(expenseId) {
    try {
      const added = await window.api.expenses.addAttachment(expenseId);
      if (added && added.length) {
        UI.toast(`Dodano ${added.length} załącznik(ów).`, 'success');
      }
      await openAttachments(expenseId);
      await refresh();
    } catch (err) {
      UI.toast('Błąd dodawania załącznika: ' + err.message, 'error');
    }
  }

  async function deleteAttachment(attachmentId, expenseId) {
    const ok = await UI.confirm('Czy na pewno usunąć ten załącznik?', 'Usuń załącznik');
    if (!ok) return;
    try {
      await window.api.expenses.deleteAttachment(attachmentId);
      UI.toast('Załącznik usunięty.', 'success');
      await openAttachments(expenseId);
      await refresh();
    } catch (err) {
      UI.toast('Błąd usuwania załącznika: ' + err.message, 'error');
    }
  }

  // ── eFaktura.nl Import Wizard ────────────────────────────────
  async function openImportWizard() {
    const paths = await window.api.efaktura.pickFiles();
    if (!paths.length) return;
    const btn = document.querySelector('[onclick*="openImportWizard"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Analizuję…'; }
    let results;
    try {
      results = await window.api.efaktura.analyze(paths, 'expense');
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
        statusIcon = r.data?._scanned ? '📷' : r.status === 'warn' ? '⚠️' : '✅';
        statusTitle = (r.warnings || []).join('; ') || 'OK';
        disabled = ''; checked = 'checked'; rowClass = '';
      }
      return `
        <tr class="${rowClass}" style="${r.status === 'skipped' ? 'opacity:0.45' : ''}">
          <td style="text-align:center"><input type="checkbox" class="exp-imp-chk" data-idx="${idx}" ${checked} ${disabled}></td>
          <td title="${UI.escHtml(r.file || '')}" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${UI.escHtml(r.basename || r.file || '')}</td>
          <td>${UI.escHtml(d.date || '—')}</td>
          <td>${UI.escHtml(d.vendor || '—')}</td>
          <td>${UI.escHtml(d.description || '—')}</td>
          <td style="text-align:right">${d.amount != null ? '€' + Number(d.amount).toFixed(2) : '—'}</td>
          <td style="text-align:center" title="${UI.escHtml(statusTitle)}">${statusIcon}</td>
        </tr>`;
    }).join('');

    const skippedNote = skippedCount > 0
      ? ` · ℹ️ ${skippedCount} pominięte (XML preferowany)`
      : '';
    const html = `
      <div id="exp-import-modal-overlay" class="modal-overlay" style="z-index:9999">
        <div class="modal" style="max-width:820px;width:95vw">
          <div class="modal-header">
            <h3>📥 Import kosztów z efaktura.nl</h3>
            <button class="modal-close" onclick="document.getElementById('exp-import-modal-overlay').remove()">×</button>
          </div>
          <div class="modal-body">
            <p style="margin-bottom:12px;color:var(--text-muted)">
              Znaleziono <strong>${results.length}</strong> plików — ✅ ${okCount} gotowe, ❌ ${errorCount} błędy${skippedNote}.<br>
              Kategoria zostanie ustawiona na <em>Inne</em> — zmień ją po imporcie jeśli potrzeba.
            </p>
            <div style="overflow-x:auto;max-height:420px;overflow-y:auto">
              <table class="data-table" style="width:100%;font-size:13px">
                <thead>
                  <tr>
                    <th style="width:36px"><input type="checkbox" id="exp-imp-chk-all" checked onchange="document.querySelectorAll('.exp-imp-chk:not(:disabled)').forEach(c=>c.checked=this.checked)"></th>
                    <th>Plik</th>
                    <th>Data</th>
                    <th>Dostawca</th>
                    <th>Opis</th>
                    <th style="text-align:right">Kwota</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:10px;padding:16px">
            <button class="btn btn-secondary" onclick="document.getElementById('exp-import-modal-overlay').remove()">Anuluj</button>
            <button class="btn btn-primary" id="exp-imp-do-btn" onclick="PageExpenses.doImport()">
              Importuj zaznaczone
            </button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('exp-import-modal-overlay').addEventListener('change', _updateImportBtnLabel);
    _updateImportBtnLabel();
  }

  function _updateImportBtnLabel() {
    const btn = document.getElementById('exp-imp-do-btn');
    if (!btn) return;
    const n = document.querySelectorAll('.exp-imp-chk:checked').length;
    btn.textContent = `Importuj zaznaczone (${n})`;
    btn.disabled = n === 0;
  }

  async function doImport() {
    const checkboxes = document.querySelectorAll('.exp-imp-chk');
    const selected = _importResults.filter((_, i) => checkboxes[i]?.checked);
    if (!selected.length) return;

    document.getElementById('exp-import-modal-overlay')?.remove();
    try {
      const r = await window.api.efaktura.importExpenses(selected);
      const msg = `✅ Zaimportowano ${r.imported} kosztów` +
        (r.skipped   ? `, pominięto ${r.skipped}`       : '') +
        (r.errors?.length ? `, błędy: ${r.errors.length}` : '');
      UI.toast(msg, r.errors?.length ? 'warning' : 'success');
      await refresh();
    } catch (err) {
      UI.toast('Błąd importu: ' + err.message, 'error');
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  function fmt(v) {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(v || 0);
  }

  function showErr(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  return { load, openCreate, openEdit, saveForm, deleteExpense, uploadReceipt, openReceipt, openAttachments, addAttachment, deleteAttachment, openImportWizard, doImport, selectExpenseAttachment, addAttachmentToViewer, deleteAttachmentFromViewer };
})();

window.PageExpenses = PageExpenses;

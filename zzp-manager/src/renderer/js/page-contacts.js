/* CRM / Contacts page */
'use strict';

const PageContacts = (() => {
  let allContacts = [];
  let filterStatus = '';
  let searchQ = '';
  let currentClientId = null;
  let currentTab = 'contact';

  const INTERACTION_ICONS = { email: '📧', call: '📞', meeting: '🤝', note: '📄' };
  const INTERACTION_LABELS = { email: 'Email', call: 'Telefon', meeting: 'Spotkanie', note: 'Notatka' };

  // ── Entry point ──────────────────────────────────────────
  async function load() {
    currentClientId = null;
    document.getElementById('page-content').innerHTML = renderShell();
    try {
      allContacts = await window.api.contacts.getAll();
      renderList();
      bindToolbar();
    } catch (err) { console.error(err); }
  }

  function renderShell() {
    return `<div class="page" id="contacts-page">
      <div class="page-header">
        <h1 class="page-title">👥 Kontakty / CRM</h1>
        <button class="btn btn-primary" onclick="PageContacts.openCreate()">+ Nowy kontakt</button>
      </div>
      <div class="filter-bar" id="con-toolbar"></div>
      <div id="con-content"></div>
    </div>`;
  }

  function bindToolbar() {
    const tb = document.getElementById('con-toolbar');
    if (!tb) return;
    tb.innerHTML = `
      <input type="text" class="filter-select" id="con-search" placeholder="🔍 Szukaj po nazwie, emailu, VAT…" style="min-width:260px" value="${UI.esc(searchQ)}">
      <select class="filter-select" id="con-status">
        <option value="">Wszystkie statusy</option>
        <option value="active" ${filterStatus==='active'?'selected':''}>Aktywni</option>
        <option value="inactive" ${filterStatus==='inactive'?'selected':''}>Nieaktywni</option>
      </select>`;
    document.getElementById('con-search')?.addEventListener('input', e => { searchQ = e.target.value; renderList(); });
    document.getElementById('con-status')?.addEventListener('change', e => { filterStatus = e.target.value; renderList(); });
  }

  function filtered() {
    const q = searchQ.toLowerCase();
    return allContacts.filter(c =>
      (!filterStatus || c.status === filterStatus) &&
      (!q || c.name.toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || (c.vat_number||'').toLowerCase().includes(q))
    );
  }

  function renderList() {
    const rows = filtered();
    const el = document.getElementById('con-content');
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = `<div class="card" style="padding:60px;text-align:center;color:var(--text-muted)">
        <div style="font-size:48px;margin-bottom:12px">👥</div>
        <div>${searchQ ? 'Brak wyników wyszukiwania.' : 'Brak kontaktów. Dodaj pierwszego klienta.'}</div>
        ${!searchQ ? `<button class="btn btn-primary" style="margin-top:16px" onclick="PageContacts.openCreate()">+ Nowy kontakt</button>` : ''}
      </div>`;
      return;
    }
    el.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
      <table>
        <thead><tr>
          <th>Nazwa / Firma</th><th>Email</th><th>Kraj</th><th>Status</th>
          <th class="text-right">Faktury</th><th class="text-right">Łączna wartość</th>
          <th>Ostatnia faktura</th><th>Akcje</th>
        </tr></thead>
        <tbody>
          ${rows.map(c => `<tr>
            <td>
              <a href="#" style="color:var(--accent-orange);font-weight:500" onclick="event.preventDefault();PageContacts.openClient(${c.id})">${UI.esc(c.name)}</a>
              ${c.company_name && c.company_name !== c.name ? `<div style="font-size:11px;color:var(--text-muted)">${UI.esc(c.company_name)}</div>` : ''}
            </td>
            <td style="font-size:12px">${c.email ? `<a href="mailto:${UI.esc(c.email)}" style="color:var(--accent-blue)">${UI.esc(c.email)}</a>` : '—'}</td>
            <td style="font-size:12px">${UI.esc(c.country||'—')}</td>
            <td>${UI.statusBadge(c.status)}</td>
            <td class="text-right mono">${c.invoice_count||0}</td>
            <td class="text-right amount">${fmt(c.total_paid)}</td>
            <td style="font-size:12px">${c.last_invoice_date ? UI.formatDate(c.last_invoice_date) : '—'}</td>
            <td class="table-actions">
              <button class="btn btn-sm btn-secondary" onclick="PageContacts.openClient(${c.id})">👁</button>
              <button class="btn btn-sm btn-secondary" onclick="PageContacts.openEdit(${c.id})">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="PageContacts.deleteContact(${c.id})">🗑</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── Single client view ───────────────────────────────────
  async function openClient(id) {
    currentClientId = id;
    currentTab = 'contact';
    const client = await window.api.contacts.getById(id);
    if (!client) return;
    renderClientView(client);
  }

  function renderClientView(c) {
    document.getElementById('page-content').innerHTML = `
      <div class="page" id="client-detail">
        <div style="margin-bottom:16px">
          <button class="btn btn-sm btn-secondary" onclick="PageContacts.load()">← Powrót do listy</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 280px;gap:16px;margin-bottom:16px">
          <div>
            <div class="page-header" style="margin-bottom:8px">
              <div>
                <h1 class="page-title">👤 ${UI.esc(c.name)}</h1>
                ${c.address ? `<div style="font-size:13px;color:var(--text-secondary)">📍 ${UI.esc([c.address,c.postcode,c.city,c.country].filter(Boolean).join(', '))}</div>` : ''}
                ${c.vat_number ? `<div style="font-size:13px;color:var(--text-secondary)">🌐 VAT: ${UI.esc(c.vat_number)} &nbsp;|&nbsp; 💱 ${UI.esc(c.currency||'EUR')}</div>` : ''}
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-secondary" onclick="PageContacts.openEdit(${c.id})">✏️ Edytuj</button>
                <button class="btn btn-secondary" onclick="App.navigate('invoices')">+ Nowa faktura</button>
              </div>
            </div>
          </div>
          <div class="card" style="font-size:13px">
            ${statRow('Faktury razem', c.invoiceCount||0)}
            ${statRow('Suma faktur', fmt(c.totalInvoiced))}
            ${statRow('Zapłacone', fmt(c.totalPaid), 'var(--accent-green)')}
            ${statRow('Zaległe', fmt(c.outstanding), c.outstanding > 0 ? 'var(--accent-red)' : '')}
          </div>
        </div>

        <div class="tabs">
          ${['contact','invoices','projects','interactions','files','notes'].map(t => {
            const labels = {contact:'📋 Kontakt',invoices:'📄 Faktury',projects:'📁 Projekty',interactions:'💬 Interakcje',files:'📎 Pliki',notes:'📝 Notatki'};
            return `<button class="tab-btn ${t===currentTab?'active':''}" onclick="PageContacts.switchTab('${t}',${c.id})">${labels[t]}</button>`;
          }).join('')}
        </div>
        <div id="client-tab-content"></div>
      </div>`;
    switchTab(currentTab, c.id, c);
  }

  async function switchTab(tab, clientId, clientData) {
    currentTab = tab;
    document.querySelectorAll('#client-detail .tab-btn').forEach(b => {
      const tabMap = {contact:'kontakt',invoices:'faktur',projects:'projekt',interactions:'interakcj',files:'plik',notes:'notatk'};
      b.classList.toggle('active', b.textContent.toLowerCase().includes(tabMap[tab]||tab));
    });
    const el = document.getElementById('client-tab-content');
    if (!el) return;
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Ładowanie…</div>`;

    if (tab === 'contact') {
      const c = clientData || await window.api.contacts.getById(clientId);
      el.innerHTML = `<div class="card">
        <div class="form-grid-2">
          <div class="form-group"><label>Imię i nazwisko</label><input type="text" id="cf-name" value="${UI.esc(c.name||'')}"></div>
          <div class="form-group"><label>Nazwa firmy</label><input type="text" id="cf-company" value="${UI.esc(c.company_name||'')}"></div>
          <div class="form-group"><label>Email</label><input type="email" id="cf-email" value="${UI.esc(c.email||'')}"></div>
          <div class="form-group"><label>Telefon</label><input type="tel" id="cf-phone" value="${UI.esc(c.phone||'')}"></div>
          <div class="form-group full"><label>Adres</label><input type="text" id="cf-addr" value="${UI.esc(c.address||'')}"></div>
          <div class="form-group"><label>Postcode</label><input type="text" id="cf-post" value="${UI.esc(c.postcode||'')}"></div>
          <div class="form-group"><label>Miasto</label><input type="text" id="cf-city" value="${UI.esc(c.city||'')}"></div>
          <div class="form-group"><label>Kraj</label><input type="text" id="cf-country" value="${UI.esc(c.country||'')}"></div>
          <div class="form-group"><label>Numer VAT</label><input type="text" id="cf-vat" value="${UI.esc(c.vat_number||'')}"></div>
          <div class="form-group"><label>Waluta</label>
            <select id="cf-cur">${['EUR','USD','GBP','PLN'].map(v=>`<option ${(c.currency||'EUR')===v?'selected':''}>${v}</option>`).join('')}</select></div>
          <div class="form-group"><label>Status</label>
            <select id="cf-status"><option value="active" ${c.status==='active'?'selected':''}>Aktywny</option><option value="inactive" ${c.status==='inactive'?'selected':''}>Nieaktywny</option></select></div>
          <div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="cf-rc" ${c.btw_reverse_charge?'checked':''}> BTW Reverse Charge</label></div>
          <div class="form-group full"><label>Notatki</label><div class="tr-field"><textarea id="cf-notes" rows="3">${UI.esc(c.notes||'')}</textarea>${window.Translator ? Translator.widgetHTML('cf-notes') : ''}</div></div>
        </div>
        <div style="margin-top:16px"><button class="btn btn-primary" onclick="PageContacts.saveContactData(${clientId})">💾 Zapisz zmiany</button></div>
      </div>`;
    } else if (tab === 'invoices') {
      const invs = await window.api.invoices.getAll({ client_id: clientId });
      el.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
        ${!invs.length ? '<p class="text-muted" style="padding:40px;text-align:center">Brak faktur dla tego klienta.</p>' :
        `<table><thead><tr><th>Nr faktury</th><th>Data</th><th>Termin</th><th>Status</th><th class="text-right">Kwota</th></tr></thead>
        <tbody>${invs.map(i=>`<tr>
          <td class="mono">${UI.esc(i.invoice_number)}</td>
          <td class="mono">${UI.formatDate(i.issue_date)}</td>
          <td class="mono">${UI.formatDate(i.due_date)}</td>
          <td>${UI.statusBadge(i.status)}</td>
          <td class="text-right amount">${fmt(i.total_eur||i.total)}</td>
        </tr>`).join('')}</tbody></table>`}
      </div>`;
    } else if (tab === 'projects') {
      const projs = await window.api.projects.getAll({ client_id: clientId });
      el.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" onclick="PageContacts._newProject(${clientId})">+ Nowy projekt</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        ${!projs.length ? '<p class="text-muted" style="padding:40px;text-align:center">Brak projektów.</p>' :
        `<table><thead><tr><th>Nazwa</th><th>Status</th><th class="text-right">Godziny</th><th class="text-right">Przychód</th></tr></thead>
        <tbody>${projs.map(p=>`<tr>
          <td><a href="#" style="color:var(--accent-orange)" onclick="event.preventDefault();App.navigate('projects');setTimeout(()=>PageProjects.openProject(${p.id}),100)">${UI.esc(p.name)}</a></td>
          <td>${UI.statusBadge(p.status==='active'?'active':p.status==='completed'?'done':p.status)}</td>
          <td class="text-right mono">${((p.total_minutes||0)/60).toFixed(1)}h</td>
          <td class="text-right amount">${fmt(p.paid_revenue)}</td>
        </tr>`).join('')}</tbody></table>`}
      </div>`;
    } else if (tab === 'interactions') {
      const ints = await window.api.contacts.getInteractions(clientId);
      el.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" onclick="PageContacts.openAddInteraction(${clientId})">+ Nowa interakcja</button>
      </div>
      <div style="display:grid;gap:8px">
        ${!ints.length ? '<div class="card"><p class="text-muted" style="padding:40px;text-align:center">Brak historii interakcji.</p></div>' :
        ints.map(i => `<div class="card" style="display:flex;gap:12px;align-items:flex-start">
          <span style="font-size:18px">${INTERACTION_ICONS[i.type]||'📄'}</span>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between">
              <span style="font-weight:500;font-size:13px">${UI.esc(i.subject||INTERACTION_LABELS[i.type]||i.type)}</span>
              <span style="font-size:11px;color:var(--text-muted)">${UI.formatDate(i.date?.split('T')[0]||i.date)}</span>
            </div>
            ${i.content ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${UI.esc(i.content)}</div>` : ''}
          </div>
          <button class="btn btn-sm btn-danger" onclick="PageContacts.deleteInteraction(${i.id},${clientId})">🗑</button>
        </div>`).join('')}
      </div>`;
    } else if (tab === 'files') {
      const files = await window.api.contacts.getFiles(clientId);
      el.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" onclick="PageContacts.uploadFile(${clientId})">📎 Dodaj plik</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        ${!files.length ? '<p class="text-muted" style="padding:40px;text-align:center">Brak plików.</p>' :
        `<table><thead><tr><th>Nazwa pliku</th><th>Rozmiar</th><th>Data</th><th>Akcje</th></tr></thead>
        <tbody>${files.map(f=>`<tr>
          <td>${UI.esc(f.filename)}</td>
          <td style="font-size:12px">${fmtSize(f.filesize)}</td>
          <td style="font-size:12px">${UI.formatDate(f.uploaded_at?.split('T')[0]||f.uploaded_at)}</td>
          <td class="table-actions">
            <button class="btn btn-sm btn-secondary" onclick="window.api.util.openFile('${UI.esc(f.filepath)}')">👁</button>
            <button class="btn btn-sm btn-danger" onclick="PageContacts.deleteFile(${f.id},${clientId})">🗑</button>
          </td>
        </tr>`).join('')}</tbody></table>`}
      </div>`;
    } else if (tab === 'notes') {
      const ns = await window.api.notes.getAll({ project_id: undefined });
      el.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" onclick="App.navigate('notes')">📝 Otwórz notatnik</button>
      </div>`;
    }
  }

  async function saveContactData(id) {
    const data = {
      name: document.getElementById('cf-name')?.value.trim(),
      company_name: document.getElementById('cf-company')?.value.trim(),
      email: document.getElementById('cf-email')?.value.trim(),
      phone: document.getElementById('cf-phone')?.value.trim(),
      address: document.getElementById('cf-addr')?.value.trim(),
      postcode: document.getElementById('cf-post')?.value.trim(),
      city: document.getElementById('cf-city')?.value.trim(),
      country: document.getElementById('cf-country')?.value.trim(),
      vat_number: document.getElementById('cf-vat')?.value.trim(),
      currency: document.getElementById('cf-cur')?.value,
      status: document.getElementById('cf-status')?.value,
      btw_reverse_charge: document.getElementById('cf-rc')?.checked ? 1 : 0,
      notes: document.getElementById('cf-notes')?.value.trim()
    };
    if (!data.name) { UI.toast('Nazwa jest wymagana.', 'warning'); return; }
    try {
      await window.api.contacts.update(id, data);
      UI.toast('Dane klienta zapisane.', 'success');
      allContacts = await window.api.contacts.getAll();
    } catch (err) { UI.toast('Błąd: ' + err.message, 'error'); }
  }

  function openAddInteraction(clientId) {
    UI.openModal('+ Nowa interakcja', `
      <div class="form-group"><label>Typ</label>
        <div style="display:flex;gap:16px;padding-top:8px">
          ${Object.entries(INTERACTION_LABELS).map(([v,l])=>`<label style="display:flex;gap:6px;align-items:center;cursor:pointer">
            <input type="radio" name="int-type" value="${v}" ${v==='note'?'checked':''}> ${INTERACTION_ICONS[v]} ${l}
          </label>`).join('')}
        </div>
      </div>
      <div class="form-group"><label>Temat</label><div style="display:flex;align-items:center;gap:6px"><input type="text" id="int-subject" placeholder="Temat interakcji" style="flex:1">${window.Translator ? Translator.widgetHTML('int-subject') : ''}</div></div>
      <div class="form-group"><label>Treść</label><div class="tr-field"><textarea id="int-content" rows="3" placeholder="Szczegóły…"></textarea>${window.Translator ? Translator.widgetHTML('int-content') : ''}</div></div>
      <div class="form-group"><label>Data</label><input type="date" id="int-date" value="${new Date().toISOString().split('T')[0]}"></div>
    `, {
      footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
               <button class="btn btn-primary" onclick="PageContacts.saveInteraction(${clientId})">Zapisz</button>`
    });
  }

  async function saveInteraction(clientId) {
    const type = document.querySelector('input[name="int-type"]:checked')?.value || 'note';
    const subject = document.getElementById('int-subject')?.value.trim();
    const content = document.getElementById('int-content')?.value.trim();
    const date = document.getElementById('int-date')?.value;
    try {
      await window.api.contacts.addInteraction({ client_id: clientId, type, subject, content, date });
      UI.closeModal();
      UI.toast('Interakcja dodana.', 'success');
      switchTab('interactions', clientId);
    } catch (err) { UI.toast('Błąd: ' + err.message, 'error'); }
  }

  async function deleteInteraction(id, clientId) {
    const ok = await UI.confirm('Usunąć tę interakcję?');
    if (!ok) return;
    await window.api.contacts.deleteInteraction(id);
    switchTab('interactions', clientId);
  }

  async function uploadFile(clientId) {
    try {
      const result = await window.api.contacts.uploadFile(clientId);
      if (result) { UI.toast('Plik dodany.', 'success'); switchTab('files', clientId); }
    } catch (err) { UI.toast('Błąd uploadu: ' + err.message, 'error'); }
  }

  async function deleteFile(id, clientId) {
    const ok = await UI.confirm('Usunąć plik?');
    if (!ok) return;
    await window.api.contacts.deleteFile(id);
    switchTab('files', clientId);
  }

  // ── Create / Edit ────────────────────────────────────────
  function openCreate() { openForm(null); }
  async function openEdit(id) {
    const c = await window.api.contacts.getById(id);
    if (c) openForm(c);
  }

  function openForm(c) {
    UI.openModal(c ? '✏️ Edytuj klienta' : '+ Nowy klient', `
      <div class="form-grid-2">
        <div class="form-group"><label>Imię i nazwisko *</label><input type="text" id="nf-name" value="${UI.esc(c?.name||'')}"></div>
        <div class="form-group"><label>Nazwa firmy</label><input type="text" id="nf-company" value="${UI.esc(c?.company_name||'')}"></div>
        <div class="form-group"><label>Email</label><input type="email" id="nf-email" value="${UI.esc(c?.email||'')}"></div>
        <div class="form-group"><label>Telefon</label><input type="tel" id="nf-phone" value="${UI.esc(c?.phone||'')}"></div>
        <div class="form-group full"><label>Adres</label><input type="text" id="nf-addr" value="${UI.esc(c?.address||'')}"></div>
        <div class="form-group"><label>Postcode</label><input type="text" id="nf-post" value="${UI.esc(c?.postcode||'')}"></div>
        <div class="form-group"><label>Miasto</label><input type="text" id="nf-city" value="${UI.esc(c?.city||'')}"></div>
        <div class="form-group"><label>Kraj</label><input type="text" id="nf-country" value="${UI.esc(c?.country||'')}"></div>
        <div class="form-group"><label>Numer VAT</label>
          <div style="display:flex;gap:6px">
            <input type="text" id="nf-vat" value="${UI.esc(c?.vat_number||'')}" style="flex:1" placeholder="np. IE6388047V">
            <button class="btn btn-sm btn-secondary" type="button" onclick="PageContacts.checkVies()" title="Sprawdź w bazie VIES (UE)">🔍 VIES</button>
          </div>
          <div id="nf-vies-result" style="font-size:12px;margin-top:4px;min-height:16px"></div>
        </div>
        <div class="form-group"><label>Waluta</label>
          <select id="nf-cur">${['EUR','USD','GBP','PLN'].map(v=>`<option ${(c?.currency||'EUR')===v?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="nf-rc" ${c?.btw_reverse_charge?'checked':''}> BTW Reverse Charge</label></div>
        <div class="form-group full"><label>Notatki</label><div class="tr-field"><textarea id="nf-notes" rows="2">${UI.esc(c?.notes||'')}</textarea>${window.Translator ? Translator.widgetHTML('nf-notes') : ''}</div></div>
      </div>
    `, {
      size: 'lg',
      footer: `<button class="btn btn-secondary" onclick="UI.closeModal()">Anuluj</button>
               <button class="btn btn-primary" onclick="PageContacts.saveForm(${c?.id||'null'})">${c?'💾 Zapisz':'+ Utwórz'}</button>`
    });
  }

  async function saveForm(id) {
    const name = document.getElementById('nf-name')?.value.trim();
    if (!name) { UI.toast('Nazwa jest wymagana.', 'warning'); return; }
    const data = {
      name, company_name: document.getElementById('nf-company')?.value.trim(),
      email: document.getElementById('nf-email')?.value.trim(),
      phone: document.getElementById('nf-phone')?.value.trim(),
      address: document.getElementById('nf-addr')?.value.trim(),
      postcode: document.getElementById('nf-post')?.value.trim(),
      city: document.getElementById('nf-city')?.value.trim(),
      country: document.getElementById('nf-country')?.value.trim(),
      vat_number: document.getElementById('nf-vat')?.value.trim(),
      currency: document.getElementById('nf-cur')?.value,
      btw_reverse_charge: document.getElementById('nf-rc')?.checked ? 1 : 0,
      notes: document.getElementById('nf-notes')?.value.trim()
    };
    try {
      if (id) {
        await window.api.contacts.update(id, data);
        UI.toast('Klient zaktualizowany.', 'success');
        UI.closeModal();
        openClient(id);
      } else {
        const r = await window.api.contacts.create(data);
        allContacts = await window.api.contacts.getAll();
        UI.toast('Klient dodany.', 'success');
        UI.closeModal();
        openClient(r.id);
      }
    } catch (err) { UI.toast('Błąd: ' + err.message, 'error'); }
  }

  async function deleteContact(id) {
    const ok = await UI.confirm('Usunąć tego klienta?', 'Usuń klienta');
    if (!ok) return;
    await window.api.contacts.delete(id);
    allContacts = allContacts.filter(c => c.id !== id);
    UI.toast('Klient usunięty.', 'success');
    renderList();
  }

  async function _newProject(clientId) {
    UI.closeModal();
    App.navigate('projects');
    setTimeout(() => PageProjects.openCreate(), 150);
  }

  // ── Helpers ──────────────────────────────────────────────
  function fmt(v) { return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v||0); }
  function fmtSize(b) { if (!b) return '—'; if (b<1024) return b+'B'; if (b<1048576) return (b/1024).toFixed(0)+'KB'; return (b/1048576).toFixed(1)+'MB'; }
  function statRow(label, value, color='') {
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-secondary)">${label}</span>
      <span class="mono" ${color?`style="color:${color}"`:''}>${value}</span>
    </div>`;
  }

  // ── VIES — weryfikacja numeru VAT ────────────────────────
  let _viesData = null;

  async function checkVies() {
    const vat = document.getElementById('nf-vat')?.value?.trim();
    const el = document.getElementById('nf-vies-result');
    if (!el) return;
    if (!vat) { el.innerHTML = '<span style="color:var(--accent-yellow)">Wpisz numer VAT.</span>'; return; }
    el.innerHTML = '⏳ Sprawdzam w bazie VIES…';
    try {
      const r = await window.api.vies.check(vat);
      if (r.error) { el.innerHTML = `<span style="color:var(--accent-red)">⚠️ ${UI.esc(r.error)}</span>`; return; }
      if (r.valid) {
        _viesData = r;
        const fillBtn = (r.name || r.address)
          ? ` <button class="btn btn-sm btn-secondary" type="button" style="padding:2px 8px;font-size:11px" onclick="PageContacts.fillFromVies()">⤵ Wypełnij dane z VIES</button>`
          : '';
        el.innerHTML = `<span style="color:var(--accent-green)">✅ Ważny numer VAT${r.name ? ' — ' + UI.esc(r.name) : ''}</span>${fillBtn}`;
      } else {
        el.innerHTML = '<span style="color:var(--accent-red)">❌ Numer VAT nieważny lub nieznany w VIES</span>';
      }
    } catch (e) {
      el.innerHTML = `<span style="color:var(--accent-red)">Błąd: ${UI.esc(e.message)}</span>`;
    }
  }

  function fillFromVies() {
    if (!_viesData) return;
    const setIf = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    if (_viesData.name) setIf('nf-company', _viesData.name);

    // Adres VIES to jeden wieloliniowy string; spróbuj wydzielić kod/miasto.
    // VIES zwraca numer domu z zerami wiodącymi (np. "WAGENMAKER 00115") —
    // usuwamy je, żeby zostało "WAGENMAKER 115".
    const addr = String(_viesData.address || '').replace(/\r/g, '')
      .replace(/(\s)0+(\d)/g, '$1$2')
      .trim();
    if (addr) {
      const lines = addr.split('\n').map(l => l.trim()).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      // NL: "1234 AB PLAATS" | ogólnie: "<kod> <miasto>"
      const m = last.match(/^([0-9]{4}\s?[A-Z]{2}|[0-9]{4,6})\s+(.+)$/i);
      if (m && lines.length > 1) {
        setIf('nf-post', m[1].trim());
        setIf('nf-city', m[2].trim());
        setIf('nf-addr', lines.slice(0, -1).join(', '));
      } else {
        setIf('nf-addr', lines.join(', '));
      }
    }
    UI.toast('Uzupełniono dane z VIES — sprawdź i zapisz.', 'success');
  }

  return { load, openClient, switchTab, openCreate, openEdit, saveForm, saveContactData, openAddInteraction, saveInteraction, deleteInteraction, uploadFile, deleteFile, deleteContact, _newProject, checkVies, fillFromVies };
})();

window.PageContacts = PageContacts;

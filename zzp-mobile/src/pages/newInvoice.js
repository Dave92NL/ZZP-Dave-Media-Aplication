import { calculateTotals } from '../lib/invoiceMath.js';
import { todayStr, addDays, fmtEur, escHtml } from '../lib/format.js';
import { navigate } from '../router.js';
import * as repo from '../data/repo.js';
import { translateWidgetHTML } from '../lib/translateWidget.js';

let _clientsMap = {};
let _itemRowCount = 0;

// Gotowe opisy usług (KvK Dave Media YT) — identyczne z desktopem, w 3 językach.
const SERVICE_PRESETS = [
  { nl: 'Beschikbaar stellen van advertentieruimte op YouTube-platform', en: 'Providing advertising space on the YouTube platform', pl: 'Udostępnianie powierzchni reklamowej na platformie YouTube' },
  { nl: 'Het creëren en bewerken van audiotracks', en: 'Creating and editing audio tracks', pl: 'Tworzenie i edycja ścieżek audio' },
  { nl: "Het maken van video's voor filmproducties", en: 'Creating videos for film productions', pl: 'Produkcja filmów na potrzeby produkcji filmowych' },
  { nl: 'Het repareren en onderhouden van computers, laptops en aanverwante onderdelen', en: 'Repair and maintenance of computers, laptops and related components', pl: 'Naprawa i konserwacja komputerów, laptopów i podzespołów' }
];

function _presetSelectHTML() {
  const langs = [['nl', 'Nederlands'], ['en', 'English'], ['pl', 'Polski']];
  const groups = langs.map(([lang, label]) =>
    `<optgroup label="${label}">${SERVICE_PRESETS.map((p, i) => `<option value="${i}|${lang}">${escHtml(p[lang])}</option>`).join('')}</optgroup>`
  ).join('');
  return `<select id="inv-preset-pick"><option value="">📝 …wstaw gotowy opis usługi</option>${groups}</select>`;
}

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <h1 class="page-title">🧾 Nowa faktura</h1>

      <div class="info-box">
        ℹ️ Numeracja bazuje na danych zsynchronizowanych z desktopem — jeśli ostatnio
        wystawiałeś faktury na komputerze, zsynchronizuj je najpierw (Ustawienia → Synchronizacja → Wyślij zmiany).
      </div>

      <div class="form-group">
        <label>Klient *</label>
        <select id="inv-client">
          <option value="">Ładowanie…</option>
        </select>
      </div>

      <div class="form-group">
        <label>Stawka BTW</label>
        <div class="radio-row">
          <label><input type="radio" name="inv-btw" value="21" checked> 21%</label>
          <label><input type="radio" name="inv-btw" value="9"> 9%</label>
          <label><input type="radio" name="inv-btw" value="0"> Brak BTW (eksport)</label>
          <label><input type="radio" name="inv-btw" value="reverse"> Reverse Charge (B2B UE)</label>
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label>Data wystawienia</label>
          <input type="date" id="inv-issue-date" value="${todayStr()}">
        </div>
        <div class="form-group">
          <label>Termin płatności</label>
          <input type="date" id="inv-due-date" value="${addDays(todayStr(), 30)}">
        </div>
      </div>

      <div class="form-group">
        <label>Data sprzedaży / dostawy (Leverdatum)</label>
        <input type="date" id="inv-sale-date" value="${todayStr()}">
      </div>

      <h3 class="section-title">Pozycje faktury</h3>
      <div class="form-group">${_presetSelectHTML()}</div>
      <div id="inv-items"></div>
      <button class="btn btn-secondary btn-sm" id="inv-add-item-btn">+ Dodaj pozycję</button>

      <div class="totals-box">
        <div class="totals-row"><span>Suma netto</span><span id="inv-subtotal-display">€ 0,00</span></div>
        <div class="totals-row"><span>BTW</span><span id="inv-btw-display">€ 0,00</span></div>
        <div class="totals-row totals-row-total"><span>Do zapłaty</span><span id="inv-total-display">€ 0,00</span></div>
      </div>

      <div id="inv-error" class="error-msg hidden"></div>

      <div class="button-row">
        <button class="btn btn-secondary btn-block" id="inv-save-draft-btn">Zapisz jako szkic</button>
        <button class="btn btn-primary btn-block" id="inv-save-sent-btn">Zapisz i oznacz jako wysłaną</button>
      </div>
    </div>
  `;

  _itemRowCount = 0;
  _addItemRow();

  document.getElementById('inv-add-item-btn').addEventListener('click', _addItemRow);
  document.getElementById('inv-preset-pick').addEventListener('change', _insertPreset);
  document.getElementById('inv-items').addEventListener('input', _recalc);
  document.querySelectorAll('input[name="inv-btw"]').forEach(r => r.addEventListener('change', _recalc));

  document.getElementById('inv-save-draft-btn').addEventListener('click', () => _save('draft'));
  document.getElementById('inv-save-sent-btn').addEventListener('click', () => _save('sent'));

  await _loadClients();
  _recalc();
}

async function _loadClients() {
  const select = document.getElementById('inv-client');
  try {
    const data = await repo.listActiveClients();

    _clientsMap = {};
    (data || []).forEach(c => { _clientsMap[c.id] = c; });

    select.innerHTML = data && data.length
      ? data.map(c => `<option value="${c.id}">${escHtml(c.company_name || c.name)}</option>`).join('')
      : '<option value="">Brak klientów — dodaj klienta na desktopie i zsynchronizuj</option>';
  } catch (err) {
    select.innerHTML = `<option value="">Błąd wczytywania klientów</option>`;
  }
}

function _addItemRow() {
  const container = document.getElementById('inv-items');
  const idx = _itemRowCount++;
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.idx = idx;
  row.innerHTML = `
    <span class="tr-field" style="flex:2;display:flex;align-items:center;gap:4px">
      <input type="text" class="item-desc" placeholder="Opis pozycji" style="flex:1;min-width:0">
      ${translateWidgetHTML()}
    </span>
    <input type="number" class="item-qty" value="1" min="1" step="1" style="width:60px" placeholder="Ilość">
    <input type="text" class="item-unit" value="szt" style="width:50px">
    <input type="number" class="item-price" value="0" min="0" step="0.01" style="width:80px" placeholder="Cena">
    <button type="button" class="btn btn-icon btn-sm btn-danger item-remove-btn">✕</button>
  `;
  row.querySelector('.item-remove-btn').addEventListener('click', () => {
    if (container.children.length > 1) {
      row.remove();
      _recalc();
    }
  });
  container.appendChild(row);
}

function _insertPreset(ev) {
  const raw = ev.target.value;
  ev.target.value = '';
  if (!raw) return;
  const [idx, lang] = raw.split('|');
  const preset = SERVICE_PRESETS[Number(idx)];
  if (!preset) return;
  const desc = preset[lang];

  // Wpisz opis do pierwszej pustej pozycji; jeśli brak — dodaj nową.
  const rows = Array.from(document.querySelectorAll('#inv-items .item-row'));
  let target = rows.find(r => !r.querySelector('.item-desc').value.trim());
  if (!target) { _addItemRow(); target = document.querySelector('#inv-items .item-row:last-child'); }
  target.querySelector('.item-desc').value = desc;
  _recalc();
}

function _readItems() {
  return Array.from(document.querySelectorAll('#inv-items .item-row')).map(row => ({
    description: row.querySelector('.item-desc').value.trim(),
    quantity: parseFloat(row.querySelector('.item-qty').value) || 1,
    unit: row.querySelector('.item-unit').value.trim() || 'szt',
    unit_price: parseFloat(row.querySelector('.item-price').value) || 0
  }));
}

function _readBtwMode() {
  const mode = document.querySelector('input[name="inv-btw"]:checked').value;
  if (mode === 'reverse') return { btwRate: 0, btwReverseCharge: true };
  return { btwRate: parseFloat(mode), btwReverseCharge: false };
}

function _recalc() {
  const items = _readItems();
  const { btwRate, btwReverseCharge } = _readBtwMode();
  const { subtotal, btwAmount, total } = calculateTotals(items, { btwRate, btwReverseCharge });
  document.getElementById('inv-subtotal-display').textContent = fmtEur(subtotal);
  document.getElementById('inv-btw-display').textContent = fmtEur(btwAmount);
  document.getElementById('inv-total-display').textContent = fmtEur(total);
}

async function _save(status) {
  const clientId = document.getElementById('inv-client').value;
  const issueDate = document.getElementById('inv-issue-date').value;
  const dueDate = document.getElementById('inv-due-date').value;
  const saleDate = document.getElementById('inv-sale-date').value || null;
  const items = _readItems().filter(i => i.description);
  const { btwRate, btwReverseCharge } = _readBtwMode();
  const errorEl = document.getElementById('inv-error');

  errorEl.classList.add('hidden');

  if (!clientId) { _showError('Wybierz klienta.'); return; }
  if (!items.length) { _showError('Dodaj co najmniej jedną pozycję z opisem.'); return; }
  if (!issueDate || !dueDate) { _showError('Uzupełnij daty.'); return; }

  const draftBtn = document.getElementById('inv-save-draft-btn');
  const sentBtn = document.getElementById('inv-save-sent-btn');
  draftBtn.disabled = true; sentBtn.disabled = true;
  const activeBtn = status === 'draft' ? draftBtn : sentBtn;
  const originalText = activeBtn.textContent;
  activeBtn.textContent = '⏳ Zapisywanie…';

  const { subtotal, btwAmount, total, totalEur } = calculateTotals(items, { btwRate, btwReverseCharge });

  const header = {
    client_id: clientId, issue_date: issueDate, due_date: dueDate, sale_date: saleDate,
    subtotal, btw_rate: btwRate, btw_amount: btwAmount, total, total_eur: totalEur,
    btw_reverse_charge: btwReverseCharge
  };

  try {
    await repo.createInvoice(header, items, status);
    navigate('invoices');
  } catch (err) {
    _showError(err.message);
  } finally {
    draftBtn.disabled = false; sentBtn.disabled = false;
    activeBtn.textContent = originalText;
  }
}

function _showError(msg) {
  const errorEl = document.getElementById('inv-error');
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

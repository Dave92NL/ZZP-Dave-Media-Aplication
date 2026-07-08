import { calculateTotals } from '../lib/invoiceMath.js';
import { todayStr, addDays, fmtEur, escHtml } from '../lib/format.js';
import { navigate } from '../router.js';
import * as repo from '../data/repo.js';

let _clientsMap = {};
let _itemRowCount = 0;

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

      <h3 class="section-title">Pozycje faktury</h3>
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
    <input type="text" class="item-desc" placeholder="Opis pozycji" style="flex:2">
    <input type="number" class="item-qty" value="1" min="0" step="0.01" style="width:60px" placeholder="Ilość">
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
    client_id: clientId, issue_date: issueDate, due_date: dueDate,
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

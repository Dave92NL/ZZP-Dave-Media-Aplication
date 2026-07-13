import { CATEGORIES } from '../lib/categories.js';
import { calculateExpense } from '../lib/expenseMath.js';
import { todayStr, escHtml } from '../lib/format.js';
import { currentParam, navigate } from '../router.js';
import * as repo from '../data/repo.js';

// Tryb edycji: trasa 'add-expense/<id>' (null = nowy koszt).
let _editId = null;

export async function load() {
  _editId = currentParam() || null;
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <h1 class="page-title">${_editId ? '✏️ Edytuj koszt' : '📷 Dodaj koszt'}</h1>

      <div class="form-group">
        <label>Kategoria</label>
        <select id="exp-category">
          ${CATEGORIES.map(c => `<option value="${escHtml(c)}" ${c === 'Inne' ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Opis *</label>
        <input type="text" id="exp-description" placeholder="np. Kabel USB-C">
      </div>

      <div class="form-group">
        <label>Kwota brutto (€) *</label>
        <input type="number" id="exp-amount" step="0.01" min="0" placeholder="0.00" inputmode="decimal">
      </div>

      <div class="form-group">
        <label>Stawka BTW</label>
        <div class="radio-row">
          <label><input type="radio" name="exp-btw" value="21" checked> 21%</label>
          <label><input type="radio" name="exp-btw" value="9"> 9%</label>
          <label><input type="radio" name="exp-btw" value="0"> 0%</label>
        </div>
      </div>

      <div class="form-group">
        <label>Data</label>
        <input type="date" id="exp-date" value="${todayStr()}">
      </div>

      <div class="form-group">
        <label>Sprzedawca (opcjonalnie)</label>
        <input type="text" id="exp-vendor" placeholder="np. MediaMarkt">
      </div>

      <div class="form-group">
        <label>${_editId ? 'Zdjęcie paragonu (nowe = wymiana istniejącego)' : 'Zdjęcie paragonu'}</label>
        <input type="file" id="exp-photo" accept="image/*" capture="environment">
        <div id="exp-photo-preview" class="photo-preview hidden">
          <img id="exp-photo-img" alt="Podgląd paragonu">
        </div>
      </div>

      <div id="exp-error" class="error-msg hidden"></div>

      <button class="btn btn-primary btn-block" id="exp-save-btn">${_editId ? '💾 Zapisz zmiany' : '💾 Zapisz koszt'}</button>
    </div>
  `;

  // Tryb edycji — wypełnij formularz danymi kosztu.
  if (_editId) {
    const exp = await repo.getExpense(_editId);
    if (!exp) { _showError('Nie znaleziono kosztu do edycji.'); return; }
    document.getElementById('exp-category').value = exp.category || 'Inne';
    document.getElementById('exp-description').value = exp.description || '';
    document.getElementById('exp-amount').value = exp.amount ?? '';
    document.getElementById('exp-date').value = String(exp.date || '').slice(0, 10);
    document.getElementById('exp-vendor').value = exp.vendor || '';
    const btw = document.querySelector(`input[name="exp-btw"][value="${Number(exp.btw_rate) || 0}"]`);
    if (btw) btw.checked = true;
  }

  document.getElementById('exp-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById('exp-photo-preview');
    const img = document.getElementById('exp-photo-img');
    if (file) {
      img.src = URL.createObjectURL(file);
      preview.classList.remove('hidden');
    } else {
      preview.classList.add('hidden');
    }
  });

  document.getElementById('exp-save-btn').addEventListener('click', _save);
}

async function _save() {
  const category = document.getElementById('exp-category').value;
  const description = document.getElementById('exp-description').value.trim();
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const btwRate = parseFloat(document.querySelector('input[name="exp-btw"]:checked').value);
  const date = document.getElementById('exp-date').value;
  const vendor = document.getElementById('exp-vendor').value.trim();
  const photoFile = document.getElementById('exp-photo').files[0] || null;
  const errorEl = document.getElementById('exp-error');
  const btn = document.getElementById('exp-save-btn');

  errorEl.classList.add('hidden');

  if (!description) { _showError('Opis jest wymagany.'); return; }
  if (!amount || amount <= 0) { _showError('Podaj prawidłową kwotę.'); return; }
  if (!date) { _showError('Data jest wymagana.'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ Zapisywanie…';

  try {
    const { btwAmount, amountEur } = calculateExpense(amount, btwRate, 1);

    const payload = {
      category, description, amount, currency: 'EUR', exchange_rate: 1, amount_eur: amountEur,
      btw_rate: btwRate, btw_amount: btwAmount, btw_deductible: true,
      date, vendor, is_deductible: true, notes: ''
    };

    if (_editId) {
      const { synced } = await repo.updateExpense(_editId, payload, photoFile);
      _showToast(synced ? '✅ Zmiany zapisane!' : '📥 Zapisano offline — wyślę po połączeniu');
      navigate(`expense-detail/${_editId}`);
      return;
    }

    const { synced } = await repo.createExpense(payload, photoFile);

    _resetForm();
    _showToast(synced ? '✅ Koszt zapisany!' : '📥 Zapisano offline — wyślę po połączeniu');
  } catch (err) {
    _showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = _editId ? '💾 Zapisz zmiany' : '💾 Zapisz koszt';
  }
}

function _showError(msg) {
  const errorEl = document.getElementById('exp-error');
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function _showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function _resetForm() {
  document.getElementById('exp-description').value = '';
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-vendor').value = '';
  document.getElementById('exp-photo').value = '';
  document.getElementById('exp-photo-preview').classList.add('hidden');
  document.getElementById('exp-date').value = todayStr();
}

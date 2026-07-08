import { supabase } from '../supabase.js';
import { navigate } from '../router.js';
import { fmtEur, fmtDateNL, escHtml } from '../lib/format.js';

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page">
      <h1 class="page-title">💸 Koszty</h1>
      <div id="exp-list-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;

  const wrap = document.getElementById('exp-list-wrap');
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })
      .limit(200);
    if (error) throw error;

    if (!data || !data.length) {
      wrap.innerHTML = '<p class="text-muted">Brak kosztów.</p>';
      return;
    }

    wrap.innerHTML = data.map(exp => `
      <div class="list-card" data-id="${exp.id}" role="button" tabindex="0">
        <div class="list-card-header">
          <span class="badge badge-info">${escHtml(exp.category)}</span>
          ${exp.receipt_storage_path ? '<span title="Ma zdjęcie paragonu">📷</span>' : ''}
        </div>
        <div class="list-card-body">
          <div>${escHtml(exp.description)}</div>
          <div class="text-muted">${escHtml(exp.vendor || '')} ${exp.vendor ? '·' : ''} ${fmtDateNL(exp.date)}</div>
        </div>
        <div class="list-card-amount">${fmtEur(exp.amount_eur ?? exp.amount)}</div>
      </div>`).join('');

    wrap.querySelectorAll('.list-card[data-id]').forEach(card => {
      card.addEventListener('click', () => navigate(`expense-detail/${card.dataset.id}`));
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania kosztów: ${escHtml(err.message)}</p>`;
  }
}

import { supabase } from '../supabase.js';
import { currentParam, navigate } from '../router.js';
import { fmtEur, fmtDateNL, escHtml } from '../lib/format.js';

export async function load() {
  const el = document.getElementById('page-content');
  const id = currentParam();

  el.innerHTML = `
    <div class="page">
      <button class="btn btn-secondary btn-sm back-btn" id="detail-back-btn">← Wróć do listy</button>
      <div id="exp-detail-wrap"><p class="text-muted">Ładowanie…</p></div>
    </div>
  `;
  document.getElementById('detail-back-btn').addEventListener('click', () => navigate('expenses'));

  const wrap = document.getElementById('exp-detail-wrap');
  if (!id) { wrap.innerHTML = '<p class="error-msg">Brak identyfikatora kosztu.</p>'; return; }

  try {
    const { data: exp, error } = await supabase.from('expenses').select('*').eq('id', id).single();
    if (error) throw error;

    let photoHtml = '';
    if (exp.receipt_storage_path) {
      const { data: signed, error: signErr } = await supabase.storage
        .from('receipts')
        .createSignedUrl(exp.receipt_storage_path, 60 * 10); // 10 min ważności
      if (!signErr && signed?.signedUrl) {
        photoHtml = `
          <h3 class="section-title">Zdjęcie paragonu</h3>
          <div class="detail-block">
            <img src="${signed.signedUrl}" alt="Paragon" class="receipt-full-photo">
          </div>`;
      } else {
        photoHtml = `<p class="text-muted">⚠️ Nie udało się wczytać zdjęcia paragonu.</p>`;
      }
    }

    wrap.innerHTML = `
      <div class="detail-header">
        <div>
          <span class="badge badge-info">${escHtml(exp.category)}</span>
        </div>
        <div class="detail-title">${escHtml(exp.description)}</div>
      </div>

      <div class="totals-box">
        <div class="totals-row"><span>Kwota brutto</span><span>${fmtEur(exp.amount)}</span></div>
        <div class="totals-row"><span>BTW (${exp.btw_rate}%)</span><span>${fmtEur(exp.btw_amount)}</span></div>
        <div class="totals-row totals-row-total"><span>Kwota EUR</span><span>${fmtEur(exp.amount_eur ?? exp.amount)}</span></div>
      </div>

      <h3 class="section-title">Szczegóły</h3>
      <div class="detail-block">
        <div class="totals-row"><span>Data</span><span>${fmtDateNL(exp.date)}</span></div>
        ${exp.vendor ? `<div class="totals-row"><span>Sprzedawca</span><span>${escHtml(exp.vendor)}</span></div>` : ''}
        <div class="totals-row"><span>Odliczalny koszt</span><span>${exp.is_deductible ? '✅ Tak' : '❌ Nie'}</span></div>
        <div class="totals-row"><span>BTW odliczalny</span><span>${exp.btw_deductible ? '✅ Tak' : '❌ Nie'}</span></div>
      </div>

      ${photoHtml}

      ${exp.notes ? `<h3 class="section-title">Uwagi</h3><div class="detail-block">${escHtml(exp.notes)}</div>` : ''}

      <div class="detail-origin text-muted">Źródło: ${exp.origin === 'phone' ? '📱 Telefon' : '💻 Desktop'}</div>
    `;
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania kosztu: ${escHtml(err.message)}</p>`;
  }
}

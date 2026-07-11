import { currentParam, navigate } from '../router.js';
import { fmtEur, fmtDateNL, escHtml } from '../lib/format.js';
import * as repo from '../data/repo.js';
import { renderPdf, fetchArrayBuffer } from '../lib/pdfPreview.js';

function _isPdf(path) {
  return /\.pdf(\?|$)/i.test(String(path || ''));
}

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
    const exp = await repo.getExpense(id);
    if (!exp) throw new Error('Nie znaleziono kosztu (offline — brak w pamięci podręcznej).');

    // Podgląd dokumentu paragonu: obraz → <img>, PDF → render pdf.js (po wstawieniu DOM).
    let photoHtml = '';
    let pdfToRender = null; // { url } — dorysowany po ustawieniu innerHTML
    if (exp._pending && exp._receiptBlob) {
      const localUrl = URL.createObjectURL(exp._receiptBlob);
      photoHtml = `
        <h3 class="section-title">Dokument paragonu</h3>
        <div class="detail-block"><img src="${localUrl}" alt="Paragon" class="receipt-full-photo"></div>`;
    } else if (exp.receipt_storage_path) {
      const signedUrl = await repo.getReceiptUrl(exp.receipt_storage_path);
      if (signedUrl && _isPdf(exp.receipt_storage_path)) {
        pdfToRender = { url: signedUrl };
        photoHtml = `
          <h3 class="section-title">Dokument paragonu</h3>
          <div class="detail-block">
            <div id="exp-pdf-view" class="pdf-view"></div>
            <a href="${signedUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm btn-block" style="margin-top:8px">↗ Otwórz PDF w nowej karcie</a>
          </div>`;
      } else if (signedUrl) {
        photoHtml = `
          <h3 class="section-title">Dokument paragonu</h3>
          <div class="detail-block"><img src="${signedUrl}" alt="Paragon" class="receipt-full-photo"></div>`;
      } else {
        photoHtml = `<p class="text-muted">⚠️ Nie udało się wczytać dokumentu paragonu (offline?).</p>`;
      }
    }

    const pendingBanner = exp._pending
      ? '<div class="info-box">⏳ Ten koszt czeka na wysłanie do chmury — zostanie zsynchronizowany po odzyskaniu połączenia.</div>'
      : '';

    wrap.innerHTML = pendingBanner + `
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

      <button class="btn btn-danger btn-block" id="exp-delete-btn" style="margin-top:16px">🗑 Usuń koszt</button>
      <div id="exp-delete-msg" class="error-msg hidden" style="margin-top:8px"></div>

      <div class="detail-origin text-muted">Źródło: ${exp.origin === 'phone' ? '📱 Telefon' : '💻 Desktop'}</div>
    `;

    document.getElementById('exp-delete-btn').addEventListener('click', async () => {
      if (!confirm('Usunąć ten koszt? Zniknie też na komputerze po synchronizacji.')) return;
      const msg = document.getElementById('exp-delete-msg');
      const btn = document.getElementById('exp-delete-btn');
      msg.classList.add('hidden');
      btn.disabled = true; btn.textContent = '⏳ Usuwanie…';
      try {
        await repo.deleteExpense(id);
        navigate('expenses');
      } catch (err) {
        msg.textContent = err.message; msg.classList.remove('hidden');
        btn.disabled = false; btn.textContent = '🗑 Usuń koszt';
      }
    });

    if (pdfToRender) {
      const cont = document.getElementById('exp-pdf-view');
      try {
        const buf = await fetchArrayBuffer(pdfToRender.url);
        await renderPdf(cont, buf);
      } catch (e) {
        if (cont) cont.innerHTML = `<p class="text-muted">⚠️ Nie udało się wczytać PDF: ${escHtml(e.message)}. Użyj przycisku poniżej.</p>`;
      }
    }
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg">Błąd wczytywania kosztu: ${escHtml(err.message)}</p>`;
  }
}

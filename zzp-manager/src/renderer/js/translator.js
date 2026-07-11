'use strict';

// Tłumaczenie opisu na żywo (PL → NL/EN). Zamiast rozwijanego menu (które psuło się
// przez pozycjonowanie w modalu) — dwa zawsze widoczne przyciski „🌐 NL" / „🌐 EN"
// obok pola opisu. Klik = od razu tłumaczy przez window.api.translate.text.
(function () {
  function notify(msg, type) {
    if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, type);
    else alert(msg);
  }

  // Pole powiązane z przyciskiem: po data-tr-for (id) albo pierwsze pole tekstowe
  // w najbliższym kontenerze.
  function resolveInput(widget) {
    const id = widget.getAttribute('data-tr-for');
    if (id) { const el = document.getElementById(id); if (el) return el; }
    const scope = widget.closest('.tr-field, td, .form-group, .inv-item, tr') || widget.parentElement;
    return scope ? scope.querySelector('input[type="text"], textarea') : null;
  }

  async function doTranslate(btn) {
    const widget = btn.closest('.tr-widget');
    const input = resolveInput(widget);
    if (!input) { notify('Nie znaleziono pola opisu do tłumaczenia.', 'error'); return; }
    const text = (input.value || '').trim();
    if (!text) { notify('Najpierw wpisz opis, potem kliknij tłumaczenie.', 'warning'); return; }

    const prev = btn.textContent;
    btn.textContent = '⏳'; btn.disabled = true;
    try {
      if (!window.api || !window.api.translate || typeof window.api.translate.text !== 'function') {
        throw new Error('Brak mostu do tłumacza — zamknij aplikację i uruchom ponownie (npm start).');
      }
      const res = await window.api.translate.text(text, btn.dataset.lang);
      const out = res && res.text ? res.text : (typeof res === 'string' ? res : '');
      if (!out) throw new Error('pusta odpowiedź tłumaczenia');
      input.value = out;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (err) {
      notify('Tłumaczenie nie powiodło się: ' + (err && err.message ? err.message : err), 'error');
    } finally {
      btn.textContent = prev; btn.disabled = false;
    }
  }

  // Faza przechwytywania (true) — odporne na stopPropagation rodziców.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.tr-lang');
    if (btn) { e.preventDefault(); e.stopPropagation(); doTranslate(btn); }
  }, true);

  window.Translator = {
    // targetId opcjonalny — bez niego pole znajdowane jest po sąsiedztwie.
    widgetHTML(targetId) {
      const attr = targetId ? ` data-tr-for="${targetId}"` : '';
      return `<span class="tr-widget"${attr}>` +
        `<button type="button" class="tr-lang" data-lang="nl" title="Przetłumacz opis na niderlandzki">🌐 NL</button>` +
        `<button type="button" class="tr-lang" data-lang="en" title="Przetłumacz opis na angielski">🌐 EN</button>` +
        `</span>`;
    }
  };
})();

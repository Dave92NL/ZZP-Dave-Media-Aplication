// Widget tłumaczenia opisu (PL → NL/EN) na telefonie. Ikonka 🌐 obok pola opisu;
// klik rozwija wybór języka, po którym treść pola zostaje zastąpiona tłumaczeniem.
// initTranslateWidget() instaluje jeden delegowany listener (wołane raz w main.js).

import { translate } from './translate.js';

export function translateWidgetHTML(targetId) {
  return `<span class="tr-widget"${targetId ? ` data-tr-for="${targetId}"` : ''}>` +
    `<button type="button" class="tr-btn" title="Przetłumacz opis (NL / EN)">🌐</button>` +
    `<span class="tr-menu hidden">` +
    `<button type="button" data-lang="nl">🇳🇱 Niderlandzki</button>` +
    `<button type="button" data-lang="en">🇬🇧 Angielski</button>` +
    `</span></span>`;
}

function closeMenus() {
  document.querySelectorAll('.tr-menu').forEach(m => m.classList.add('hidden'));
}

// Pole powiązane z widgetem: po data-tr-for (id) albo pierwsze pole tekstowe
// w najbliższym kontenerze (wiersz pozycji / grupa formularza).
function resolveInput(widget) {
  const id = widget.getAttribute('data-tr-for');
  if (id) { const el = document.getElementById(id); if (el) return el; }
  const scope = widget.closest('.item-row, .form-group, .tr-field') || widget.parentElement;
  return scope ? scope.querySelector('input[type="text"], textarea') : null;
}

let _installed = false;
export function initTranslateWidget() {
  if (_installed) return;
  _installed = true;

  document.addEventListener('click', async (e) => {
    const trigger = e.target.closest('.tr-btn');
    if (trigger) {
      e.preventDefault();
      const menu = trigger.parentElement.querySelector('.tr-menu');
      const willOpen = menu.classList.contains('hidden');
      closeMenus();
      if (willOpen) menu.classList.remove('hidden');
      return;
    }

    const langBtn = e.target.closest('.tr-menu [data-lang]');
    if (langBtn) {
      e.preventDefault();
      const widget = langBtn.closest('.tr-widget');
      widget.querySelector('.tr-menu').classList.add('hidden');
      const input = resolveInput(widget);
      if (!input) return;
      const text = (input.value || '').trim();
      if (!text) { alert('Najpierw wpisz opis do przetłumaczenia.'); return; }

      const btn = widget.querySelector('.tr-btn');
      const prev = btn.textContent;
      btn.textContent = '⏳'; btn.disabled = true;
      try {
        const out = await translate(text, langBtn.dataset.lang);
        input.value = out;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        alert('Tłumaczenie nie powiodło się: ' + err.message);
      } finally {
        btn.textContent = prev; btn.disabled = false;
      }
      return;
    }

    if (!e.target.closest('.tr-widget')) closeMenus();
  });
}

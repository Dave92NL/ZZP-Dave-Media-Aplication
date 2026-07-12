// Tłumaczenie opisu (PL → NL/EN) na telefonie. Dwa zawsze widoczne przyciski
// „🌐 NL" / „🌐 EN" obok pola — klik od razu tłumaczy (bez rozwijanego menu, które
// bywało niewidoczne). initTranslateWidget() instaluje jeden listener (raz w main.js).

import { translate } from './translate.js';

export function translateWidgetHTML(targetId) {
  const attr = targetId ? ` data-tr-for="${targetId}"` : '';
  return `<span class="tr-widget"${attr}>` +
    `<button type="button" class="tr-lang" data-lang="pl" title="Przetłumacz na polski">🌐 PL</button>` +
    `<button type="button" class="tr-lang" data-lang="nl" title="Przetłumacz na niderlandzki">🌐 NL</button>` +
    `<button type="button" class="tr-lang" data-lang="en" title="Przetłumacz na angielski">🌐 EN</button>` +
    `</span>`;
}

function resolveInput(widget) {
  const id = widget.getAttribute('data-tr-for');
  if (id) { const el = document.getElementById(id); if (el) return el; }
  const scope = widget.closest('.tr-field, .item-row, .form-group') || widget.parentElement;
  return scope ? scope.querySelector('input[type="text"], textarea') : null;
}

async function doTranslate(btn) {
  const widget = btn.closest('.tr-widget');
  const input = resolveInput(widget);
  if (!input) { alert('Nie znaleziono pola opisu do tłumaczenia.'); return; }
  const text = (input.value || '').trim();
  if (!text) { alert('Najpierw wpisz opis, potem kliknij tłumaczenie.'); return; }

  const prev = btn.textContent;
  btn.textContent = '⏳'; btn.disabled = true;
  try {
    const out = await translate(text, btn.dataset.lang);
    if (!out) throw new Error('pusta odpowiedź');
    input.value = out;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (err) {
    alert('Tłumaczenie nie powiodło się: ' + (err && err.message ? err.message : err));
  } finally {
    btn.textContent = prev; btn.disabled = false;
  }
}

let _installed = false;
export function initTranslateWidget() {
  if (_installed) return;
  _installed = true;
  // Faza przechwytywania — odporne na stopPropagation rodziców.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.tr-lang');
    if (btn) { e.preventDefault(); e.stopPropagation(); doTranslate(btn); }
  }, true);
}

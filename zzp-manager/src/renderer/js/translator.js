'use strict';

// Widget tłumaczenia opisu na żywo (PL → NL/EN). Ikonka 🌐 obok pola opisu;
// klik rozwija wybór języka, po którym treść pola zostaje zastąpiona tłumaczeniem.
// Silnik (DeepL/MyMemory) obsługuje proces główny przez window.api.translate.text.
(function () {
  function closeMenus(except) {
    document.querySelectorAll('.tr-menu').forEach(m => { if (m !== except) m.classList.add('hidden'); });
  }

  // Pole powiązane z widgetem: najpierw po data-tr-for (id), a jak brak/nie ma —
  // pierwsze pole tekstowe w najbliższym kontenerze (komórka tabeli / form-group).
  function resolveInput(widget) {
    const id = widget.getAttribute('data-tr-for');
    if (id) { const el = document.getElementById(id); if (el) return el; }
    const scope = widget.closest('td, .form-group, .tr-field, tr') || widget.parentElement;
    return scope ? scope.querySelector('input[type="text"], textarea') : null;
  }

  document.addEventListener('click', async (e) => {
    // 1) Klik w ikonkę → przełącz menu. Pozycjonujemy je jako fixed od przycisku,
    //    żeby nie przycinał go overflow tabeli/modala (inaczej menu bywa niewidoczne).
    const trigger = e.target.closest('.tr-btn');
    if (trigger) {
      e.preventDefault();
      const menu = trigger.parentElement.querySelector('.tr-menu');
      const willOpen = menu.classList.contains('hidden');
      closeMenus();
      if (willOpen) {
        const r = trigger.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (r.bottom + 4) + 'px';
        menu.style.right = 'auto';
        menu.classList.remove('hidden');
        const mw = menu.offsetWidth || 170;
        menu.style.left = Math.max(8, r.right - mw) + 'px';
      }
      return;
    }

    // 2) Klik w język w menu → tłumacz i wstaw
    const langBtn = e.target.closest('.tr-menu [data-lang]');
    if (langBtn) {
      e.preventDefault();
      const widget = langBtn.closest('.tr-widget');
      const menu = widget.querySelector('.tr-menu');
      menu.classList.add('hidden');
      const input = resolveInput(widget);
      if (!input) return;
      const text = (input.value || '').trim();
      if (!text) { window.UI?.toast?.('Najpierw wpisz opis do przetłumaczenia.', 'warning'); return; }

      const btn = widget.querySelector('.tr-btn');
      const prev = btn.textContent;
      btn.textContent = '⏳'; btn.disabled = true;
      try {
        const res = await window.api.translate.text(text, langBtn.dataset.lang);
        if (res && res.text) {
          input.value = res.text;
          // wyzwól input/change, by odświeżyć podgląd/przeliczenia
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (err) {
        window.UI?.toast?.('Tłumaczenie nie powiodło się: ' + err.message, 'error');
      } finally {
        btn.textContent = prev; btn.disabled = false;
      }
      return;
    }

    // 3) Klik poza widgetem → zamknij menu
    if (!e.target.closest('.tr-widget')) closeMenus();
  });

  window.Translator = {
    // HTML widgetu. targetId opcjonalny — bez niego pole znajdowane jest po
    // sąsiedztwie (pierwsze pole tekstowe w tej samej komórce/form-group).
    widgetHTML(targetId) {
      return `<span class="tr-widget"${targetId ? ` data-tr-for="${targetId}"` : ''}>` +
        `<button type="button" class="tr-btn" title="Przetłumacz opis (Niderlandzki / Angielski)">🌐</button>` +
        `<span class="tr-menu hidden">` +
        `<button type="button" data-lang="nl">🇳🇱 Niderlandzki</button>` +
        `<button type="button" data-lang="en">🇬🇧 Angielski</button>` +
        `</span></span>`;
    }
  };
})();

/* UI — shared components and helpers */
'use strict';

const UI = (() => {
  // ── Toast ───────────────────────────────────────────────
  function toast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;

    // #toast-container żyje poza #page-content, więc MutationObserver z
    // translations.js go nie widzi — tłumaczymy treść ręcznie przed wstawieniem.
    const translated = window.i18n?.translateText ? window.i18n.translateText(message) : message;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escHtml(translated)}</span>`;

    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(30px)';
      el.style.transition = 'all 0.25s ease';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ── Modal ───────────────────────────────────────────────
  let currentModalCallback = null;

  function openModal(title, bodyHTML, options = {}) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;

    const footer = document.getElementById('modal-footer');
    const box = document.getElementById('modal-box');

    box.className = 'modal';
    if (options.size) box.classList.add(`modal-${options.size}`);

    if (options.footer) {
      footer.innerHTML = options.footer;
      footer.classList.remove('hidden');
    } else {
      footer.innerHTML = '';
      footer.classList.add('hidden');
    }

    document.getElementById('modal-overlay').classList.remove('hidden');

    if (options.onOpen) options.onOpen();
  }

  function closeModal(event) {
    if (event && event.target !== document.getElementById('modal-overlay')) return;
    document.getElementById('modal-overlay').classList.add('hidden');
    currentModalCallback = null;
  }

  function confirm(message, title = 'Potwierdź') {
    return new Promise(resolve => {
      openModal(title, `<p style="font-size:14px;color:var(--text-secondary)">${escHtml(message)}</p>`, {
        footer: `
          <button class="btn btn-secondary" onclick="UI.closeModal();window._confirmResolve(false)">Anuluj</button>
          <button class="btn btn-danger" onclick="UI.closeModal();window._confirmResolve(true)">Potwierdź</button>
        `,
        size: 'sm'
      });
      window._confirmResolve = resolve;
    });
  }

  // Custom prompt modal — native window.prompt() is unreliable inside Electron
  // BrowserWindows, so all text/PIN input dialogs must go through this instead.
  function prompt(message, title = 'Potwierdź', options = {}) {
    return new Promise(resolve => {
      const inputType = options.password ? 'password' : 'text';
      const inputMode = options.numeric ? 'numeric' : 'text';
      openModal(title, `
        <p style="font-size:14px;color:var(--text-secondary);margin-bottom:12px">${escHtml(message)}</p>
        <input type="${inputType}" id="ui-prompt-input" class="form-control" inputmode="${inputMode}"
          style="width:100%;padding:8px 10px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:6px;color:var(--text-primary)"
          autofocus>
      `, {
        footer: `
          <button class="btn btn-secondary" onclick="UI.closeModal();window._promptResolve(null)">Anuluj</button>
          <button class="btn btn-primary" onclick="UI._promptSubmit()">OK</button>
        `,
        size: 'sm',
        onOpen: () => {
          const input = document.getElementById('ui-prompt-input');
          input?.focus();
          input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); _promptSubmit(); }
          });
        }
      });
      window._promptResolve = resolve;
    });
  }

  function _promptSubmit() {
    const input = document.getElementById('ui-prompt-input');
    const value = input ? input.value : null;
    closeModal();
    window._promptResolve(value);
  }

  // ── Date helpers ────────────────────────────────────────
  function today() {
    return new Date().toISOString().split('T')[0];
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}.${m}.${y}`;
    } catch { return dateStr; }
  }

  function formatDateTime(dtStr) {
    if (!dtStr) return '—';
    try {
      const d = new Date(dtStr);
      return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { return dtStr; }
  }

  // ── Amount helpers ──────────────────────────────────────
  function formatAmount(amount, currency = 'EUR') {
    const num = Number(amount) || 0;
    const symbols = { EUR: '€', USD: '$', GBP: '£', PLN: 'zł' };
    const sym = symbols[currency] || currency;
    return `${sym}${num.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatHours(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}min`;
  }

  // ── HTML escaping ────────────────────────────────────────
  function escHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ── Status badge ────────────────────────────────────────
  function statusBadge(status) {
    const labels = {
      draft: 'Robocza', sent: 'Wysłana', paid: 'Zapłacona',
      overdue: 'Przeterminowana', cancelled: 'Anulowana',
      active: 'Aktywny', inactive: 'Nieaktywny',
      todo: 'Do zrobienia', in_progress: 'W toku', done: 'Ukończone',
      urgent: 'Pilne', high: 'Wysoki', medium: 'Średni', low: 'Niski',
      completed: 'Ukończony', paused: 'Wstrzymany'
    };
    const lbl = labels[status] || status;
    return `<span class="badge badge-${status}">${escHtml(lbl)}</span>`;
  }

  // ── Build select options ──────────────────────────────────
  function buildOptions(items, valueKey, labelKey, selectedValue = '', placeholder = '— wybierz —') {
    let html = `<option value="">${escHtml(placeholder)}</option>`;
    for (const item of items) {
      const val = item[valueKey];
      const lbl = item[labelKey];
      html += `<option value="${escHtml(String(val))}" ${String(val) === String(selectedValue) ? 'selected' : ''}>${escHtml(lbl)}</option>`;
    }
    return html;
  }

  // ── Loading spinner ──────────────────────────────────────
  function setLoading(container, loading) {
    if (loading) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div>Ładowanie...</div></div>';
    }
  }

  // ── Days until / overdue text ─────────────────────────────
  function daysUntil(dateStr) {
    if (!dateStr) return '—';
    const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
    if (diff < 0) return `<span class="text-danger">${Math.abs(diff)} dni temu</span>`;
    if (diff === 0) return '<span class="text-warning">Dziś</span>';
    if (diff <= 7) return `<span class="text-warning">Za ${diff} dni</span>`;
    return `Za ${diff} dni`;
  }

  // ── Table sort helper ─────────────────────────────────────
  function makeSortable(tableEl, data, renderFn) {
    let sortKey = null, sortAsc = true;
    tableEl.querySelectorAll('thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) sortAsc = !sortAsc;
        else { sortKey = key; sortAsc = true; }
        tableEl.querySelectorAll('thead th').forEach(t => t.textContent = t.textContent.replace(/ [▲▼]$/, ''));
        th.textContent += sortAsc ? ' ▲' : ' ▼';
        const sorted = [...data].sort((a, b) => {
          const av = a[key] ?? '', bv = b[key] ?? '';
          if (av < bv) return sortAsc ? -1 : 1;
          if (av > bv) return sortAsc ? 1 : -1;
          return 0;
        });
        renderFn(sorted);
      });
    });
  }

  // Konwersja data: URL → blob: URL. Wbudowany viewer PDF Chromium (PDFium)
  // renderuje <embed> tylko z blob:/file:, nie z data: — dlatego zamieniamy.
  function dataUrlToBlobUrl(dataUrl) {
    try {
      const comma = dataUrl.indexOf(',');
      const meta = dataUrl.slice(0, comma);
      const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
      const bin = atob(dataUrl.slice(comma + 1));
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: mime }));
    } catch {
      return dataUrl;
    }
  }

  return {
    toast, openModal, closeModal, confirm, prompt, _promptSubmit,
    today, addDays, formatDate, formatDateTime,
    formatAmount, formatHours, escHtml, esc: escHtml,
    statusBadge, buildOptions, setLoading, daysUntil, makeSortable,
    dataUrlToBlobUrl
  };
})();

window.UI = UI;

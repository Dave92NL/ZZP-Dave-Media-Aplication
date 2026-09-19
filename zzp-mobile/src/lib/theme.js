// Motyw wyglądu aplikacji.
//  ui:     'original' (obecny ciemny wygląd, bez zmian) | 'modern' (nowy wygląd)
//  scheme: 'light' | 'dark' | 'system' — dotyczy tylko 'modern'
// Stan trafia na <html> jako data-ui / data-scheme; style w styles/modern.css.
// Źródło prawdy: IndexedDB (data/settings.js, działa offline). Lustro w localStorage
// czytane synchronicznie przez inline skrypt w index.html → brak błysku przy starcie.

import { getSettings, saveSettings } from '../data/settings.js';

const LS_KEY = 'zzp-theme';
const DEFAULT = { ui: 'original', scheme: 'system' };
const BAR_COLOR = { original: '#0A0E14', light: '#F7F9FC', dark: '#0B1220' };

const clean = (v) => ({
  ui: v?.ui === 'modern' ? 'modern' : 'original',
  scheme: ['light', 'dark', 'system'].includes(v?.scheme) ? v.scheme : 'system'
});

let _theme = (() => {
  try { return clean(JSON.parse(localStorage.getItem(LS_KEY))); } catch { return { ...DEFAULT }; }
})();

const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function resolveScheme(t) {
  if (t.ui !== 'modern') return 'dark';
  if (t.scheme === 'light' || t.scheme === 'dark') return t.scheme;
  return mq && !mq.matches ? 'light' : 'dark';
}

export function getTheme() { return { ..._theme }; }
export const isModern = () => _theme.ui === 'modern';

export function applyTheme() {
  const root = document.documentElement;
  const scheme = resolveScheme(_theme);
  root.dataset.ui = _theme.ui;
  root.dataset.scheme = scheme;
  // color-scheme (natywne kontrolki) tylko w Nowoczesnym — Oryginalny ma zostać bez zmian.
  root.style.colorScheme = _theme.ui === 'modern' ? scheme : '';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', BAR_COLOR[_theme.ui === 'modern' ? scheme : 'original']);
}

function mirror() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(_theme)); } catch { /* tryb prywatny */ }
}

export async function setTheme(patch) {
  _theme = clean({ ..._theme, ...patch });
  mirror();
  applyTheme();
  window.dispatchEvent(new CustomEvent('zzp-theme', { detail: getTheme() }));
  try { await saveSettings({ theme: _theme }); } catch { /* lustro wystarczy do następnego startu */ }
}

// Wołane raz w main.js (przed pierwszym renderem strony).
export async function initTheme() {
  applyTheme();
  if (mq) mq.addEventListener('change', () => { if (_theme.scheme === 'system') applyTheme(); });
  try {
    const stored = (await getSettings()).theme;
    if (stored) {
      const next = clean(stored);
      if (JSON.stringify(next) !== JSON.stringify(_theme)) {
        _theme = next;
        mirror();
        applyTheme();
        window.dispatchEvent(new CustomEvent('zzp-theme', { detail: getTheme() }));
      }
    }
  } catch { /* IndexedDB niedostępne → zostaje lustro */ }
}

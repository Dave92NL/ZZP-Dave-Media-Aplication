// Aktualizacje PWA (vite-plugin-pwa, registerType 'prompt'): nowy service worker
// czeka na zgodę zamiast aktualizować się po cichu. `initAppUpdates()` woła się raz
// w main.js; `checkForUpdateNow()` obsługuje przycisk „Sprawdź aktualizacje" (Więcej).
import { registerSW } from 'virtual:pwa-register';

let _registration = null;
let _updateSW = null;

function _showUpdateBar() {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.className = 'update-bar';
  bar.innerHTML = `
    <span>🎉 Nowa wersja aplikacji</span>
    <button type="button" id="update-bar-btn">Odśwież</button>
    <button type="button" id="update-bar-close" aria-label="Ukryj">✕</button>`;
  document.body.appendChild(bar);
  document.getElementById('update-bar-btn').addEventListener('click', () => {
    document.getElementById('update-bar-btn').textContent = '⏳';
    _updateSW(true);
  });
  document.getElementById('update-bar-close').addEventListener('click', () => bar.remove());
}

export function initAppUpdates() {
  _updateSW = registerSW({
    onNeedRefresh: _showUpdateBar,
    onRegisteredSW(_url, reg) {
      _registration = reg;
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }
  });
}

// Ręczne sprawdzenie (przycisk w „Więcej"). Zwraca:
//  'found'       — jest nowa wersja, pasek u góry już widoczny
//  'not-found'   — masz najnowszą wersję
//  'unsupported' — brak zarejestrowanego service workera (np. pierwsze uruchomienie)
export async function checkForUpdateNow() {
  if (!_registration) return 'unsupported';
  try {
    await _registration.update();
  } catch {
    return 'unsupported';
  }
  // onNeedRefresh (gdy jest nowsza wersja) jest wołane asynchronicznie przez plugin
  // PWA po zainstalowaniu nowego workera — dajemy mu chwilę przed oceną wyniku.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  return document.getElementById('update-bar') ? 'found' : 'not-found';
}

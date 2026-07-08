// Pasek stanu połączenia/synchronizacji (#net-status) — pokazuje tryb offline
// oraz liczbę zmian oczekujących na wysłanie. Ukryty, gdy online i outbox pusty.

import * as outbox from './outbox.js';
import { isOnline } from './repo.js';

export async function updateStatusBar() {
  const el = document.getElementById('net-status');
  if (!el) return;
  const pending = await outbox.count();

  if (!isOnline()) {
    el.textContent = pending
      ? `🔌 Offline — ${pending} zmian(y) czeka na wysłanie`
      : '🔌 Offline — zmiany zapiszą się lokalnie';
    el.className = 'net-status net-offline';
  } else if (pending > 0) {
    el.textContent = `⏳ Synchronizacja — ${pending} do wysłania`;
    el.className = 'net-status net-pending';
  } else {
    el.className = 'net-status hidden';
  }
}

export function initStatusBar() {
  window.addEventListener('online', updateStatusBar);
  window.addEventListener('offline', updateStatusBar);
  window.addEventListener('zzp-outbox-changed', updateStatusBar);
  updateStatusBar();
}

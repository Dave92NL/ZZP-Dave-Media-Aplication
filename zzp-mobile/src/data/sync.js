// Silnik synchronizacji — opróżnia outbox (zmiany zrobione offline) do Supabase,
// odświeża cache i emituje zdarzenie 'zzp-synced', gdy coś zostało wysłane.
// Wyzwalacze: start aplikacji, powrót online, powrót do widoczności karty.

import * as repo from './repo.js';
import * as outbox from './outbox.js';
import { updateStatusBar, initStatusBar } from './status.js';

let _syncing = false;

// Mapa lokalny_localId → serwerowe UUID dla encji utworzonych offline w tej sesji
// flush. Pozwala powiązać np. fakturę (klient utworzony offline) po wysłaniu klienta.
function _remap(value, idMap) {
  return (value && idMap[value]) ? idMap[value] : value;
}

export async function flushOutbox() {
  if (!repo.isOnline()) return { flushed: 0, remaining: await outbox.count() };

  const entries = await outbox.all(); // FIFO: rodzice (klient/projekt) przed dziećmi
  const idMap = {};
  let flushed = 0;
  for (const e of entries) {
    try {
      if (e.type === 'insert-client') {
        const row = await repo.pushClient(e.payload);
        idMap[e.localId] = row.id;
      } else if (e.type === 'insert-project') {
        const payload = { ...e.payload, client_id: _remap(e.payload.client_id, idMap) };
        const row = await repo.pushProject(payload);
        idMap[e.localId] = row.id;
      } else if (e.type === 'insert-expense') {
        const payload = { ...e.payload, project_id: _remap(e.payload.project_id, idMap) };
        await repo.pushExpense(payload, e.receiptBlob);
      } else if (e.type === 'insert-invoice') {
        const payload = {
          ...e.payload,
          client_id: _remap(e.payload.client_id, idMap),
          project_id: _remap(e.payload.project_id, idMap)
        };
        const invoiceId = await repo.pushInvoice(payload, e.items);
        idMap[e.localId] = invoiceId;
      } else if (e.type === 'insert-time-entry') {
        const payload = {
          ...e.payload,
          project_id: _remap(e.payload.project_id, idMap),
          invoice_id: _remap(e.payload.invoice_id, idMap)
        };
        await repo.pushTimeEntry(payload);
      } else {
        throw new Error('Nieznany typ operacji: ' + e.type);
      }
      await outbox.remove(e.localId);
      flushed++;
    } catch (err) {
      // Zostaw wpis w kolejce i zapisz błąd — spróbujemy przy następnej synchronizacji.
      await outbox.setError(e.localId, err.message);
    }
  }
  return { flushed, remaining: await outbox.count() };
}

export async function syncNow() {
  if (_syncing || !repo.isOnline()) return;
  _syncing = true;
  try {
    await repo.refreshCoreCaches();
    const res = await flushOutbox();
    await updateStatusBar();
    if (res.flushed > 0) {
      window.dispatchEvent(new CustomEvent('zzp-synced', { detail: res }));
    }
  } catch {
    // brak sieci / przejściowy błąd — spróbujemy przy kolejnym wyzwalaczu
  } finally {
    _syncing = false;
  }
}

export function initSync() {
  initStatusBar();
  window.addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  syncNow();
}

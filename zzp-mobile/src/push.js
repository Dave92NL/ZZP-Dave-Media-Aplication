// Powiadomienia push (Web Push) — subskrypcja i zapis do Supabase.
// Klucz publiczny VAPID pochodzi z VITE_VAPID_PUBLIC_KEY (patrz docs/push-setup.md).
// iOS: push działa TYLKO dla PWA zainstalowanej na ekranie głównym (iOS 16.4+).

import { supabase } from './supabase.js';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

async function _saveSubscription(sub) {
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent
  }, { onConflict: 'endpoint' });
  if (error) throw new Error(error.message);
}

// Wywołanie „ciche" przy starcie — jeśli użytkownik już wcześniej wyraził zgodę,
// odśwież/zapisz subskrypcję bez pokazywania monitu.
export async function ensurePushSubscription() {
  if (!VAPID_PUBLIC || !pushSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (isIOS() && !isStandalone()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC)
      });
    }
    await _saveSubscription(sub);
  } catch (_) { /* offline lub SW jeszcze nieaktywny — spróbujemy później */ }
}

// Wywołanie z gestu użytkownika (przycisk) — prosi o zgodę i subskrybuje.
// Zwraca { ok, reason } do pokazania komunikatu.
export async function enablePush() {
  if (!VAPID_PUBLIC) return { ok: false, reason: 'Powiadomienia nie są skonfigurowane (brak klucza VAPID).' };
  if (!pushSupported()) return { ok: false, reason: 'Ta przeglądarka nie obsługuje powiadomień push.' };
  if (isIOS() && !isStandalone()) {
    return { ok: false, reason: 'Na iPhone najpierw dodaj aplikację do ekranu głównego (Udostępnij → „Do ekranu początkowego"), otwórz ją stamtąd i spróbuj ponownie.' };
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'Nie udzielono zgody na powiadomienia.' };
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC)
      });
    }
    await _saveSubscription(sub);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'Nie udało się włączyć powiadomień: ' + err.message };
  }
}

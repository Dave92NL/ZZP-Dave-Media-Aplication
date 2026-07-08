/* Handler powiadomień push — dołączany do generowanego service workera
   (vite-plugin-pwa → workbox.importScripts). Odbiera pushe wysłane przez
   funkcję Supabase 'send-due-reminders' i wyświetla powiadomienie systemowe.

   Uwaga: aplikacja jest hostowana w podkatalogu (GitHub Pages), więc ikonę i
   adres docelowy rozwiązujemy względem scope service workera, a nie od "/". */

function _scope() {
  return (self.registration && self.registration.scope) || self.location.href;
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : '' };
  }

  const scope = _scope();
  const title = data.title || 'ZZP Manager';
  const targetUrl = new URL(data.url || './', scope).href;
  const options = {
    body: data.body || '',
    icon: new URL('icons/icon-192.png', scope).href,
    badge: new URL('icons/icon-192.png', scope).href,
    tag: data.tag || 'zzp-reminder',
    data: { url: targetUrl }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || _scope();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ('focus' in win) {
          win.navigate?.(targetUrl);
          return win.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

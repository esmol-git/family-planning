/* Family Calendar — Web Push service worker */
self.addEventListener('push', (event) => {
  let data = { title: 'Семейный календарь', body: '', url: '/' };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    data.body = event.data ? event.data.text() : '';
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Семейный календарь', {
      body: data.body || '',
      data: { url: data.url || '/' },
      tag: data.notificationId || 'family-calendar',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});

// public/sw.js — Web Push handler. Plain JS, no build step.

self.addEventListener('push', event => {
  let payload = { title: 'ShareMoney', body: '', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch (_) { /* keep defaults */ }

  // Open-redirect guard: only ever navigate to internal paths.
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/'

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url
  const target = typeof url === 'string' && url.startsWith('/') ? url : '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        let path = ''
        try { path = new URL(client.url).pathname } catch (_) {}
        if (path === target && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})

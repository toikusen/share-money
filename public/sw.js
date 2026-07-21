// public/sw.js — static app-shell cache + Web Push. Plain JS, no build step.

const STATIC_CACHE = 'share-money-static-v2'
// OpenNext serves public/offline.html at the clean URL /offline.
const OFFLINE_URL = '/offline'
const PRECACHE_URLS = [OFFLINE_URL, '/icon-192.png', '/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(
      names
        .filter(name => name.startsWith('share-money-static-') && name !== STATIC_CACHE)
        .map(name => caches.delete(name)),
    )
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable()
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Next's hashed assets are immutable and contain no user data. Cache only
  // these files (plus icons), never authenticated HTML or RSC responses.
  const isStaticAsset = url.pathname.startsWith('/_next/static/')
    || url.pathname === '/favicon.ico'
    || url.pathname === '/apple-icon.png'
    || url.pathname === '/icon-192.png'
    || url.pathname === '/icon-512.png'

  if (isStaticAsset) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached

      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(STATIC_CACHE)
        await cache.put(request, response.clone())
      }
      return response
    })())
    return
  }

  // Navigation preload starts the network request in parallel with service
  // worker startup. Only the generic offline page is cached as a fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse
        return preloaded || await fetch(request)
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error()
      }
    })())
  }
})

self.addEventListener('push', event => {
  let payload = { title: 'ShareMoney', body: '', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch { /* keep defaults */ }

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
        try { path = new URL(client.url).pathname } catch {}
        if (path === target && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})

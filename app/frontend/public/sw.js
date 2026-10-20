/* AVAGYM service worker — runtime caching (works with Vite's hashed asset names).
   Media (img/gif) cache-first; everything else network-first with offline fallback. */
// V4.1: o nome do cache leva o id do build (trocado no build) → versão nova = SW novo = PWA atualiza sozinho
const BUILD = '__BUILD_ID__'
const CACHE = 'avagym-rt-v41-' + BUILD

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting() })
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
})
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {}
  e.waitUntil(self.registration.showNotification(data.title || 'ORNY', {
    body: data.body || '',
    icon: 'icon-512.png',
    badge: 'icon-180.png',
    tag: data.tag || 'avagym',
    renotify: true
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(clients => {
    const c = clients.find(c => 'focus' in c)
    return c ? c.focus() : self.clients.openWindow('./')
  }))
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return    // never cache auth/data
  // Video: o player pede faixas (Range) e cache.put de uma resposta 206 lanca
  // "Partial response unsupported". Deixa passar direto para a rede/cache HTTP.
  if (url.pathname.startsWith('/video/') || e.request.headers.has('range')) return

  const isMedia = url.pathname.includes('/img/') || url.pathname.includes('/gif/')
  if (isMedia) {
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res })
    )))
  } else {
    // navegação/index.html e version.json: sempre da rede, sem cache HTTP (a versão nova aparece na hora)
    const fresh = e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/version.json')
    e.respondWith(fetch(fresh ? new Request(e.request, { cache: 'no-store' }) : e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
      return res
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))))
  }
})

// v3 — estrategia de caché arreglada.
//
// El problema anterior (v1): el HTML de entrada ("/") se servía cache-first, o
// sea que el navegador se quedaba con el index.html de la PRIMERA visita para
// siempre. Cada despliegue cambia el hash de los .js (`index-abc123.js`), así
// que ese index.html viejo terminaba apuntando a archivos que ya no existen en
// el alias de producción → 404 → pantalla en blanco. Solo funcionaba abriendo
// una URL de despliegue nueva (otro origen, sin service worker registrado).
//
// Ahora:
//  - navegaciones (el HTML)      → network-first (siempre la versión actual si
//                                  hay internet; cae al cache solo offline)
//  - /assets/* (hash inmutable)  → cache-first (el hash cambia = URL nueva, es
//                                  seguro cachear para siempre)
//  - /api/* y Supabase           → network-first
//  - resto (iconos, manifest)    → cache-first con actualización en segundo plano

const CACHE = 'finanzas-hogar-v3';
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/manifest.json', '/icon-192.png', '/icon-512.png']).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) Navegaciones (HTML): network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(OFFLINE_URL, copy));
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL).then((r) => r || caches.match(req))),
    );
    return;
  }

  // 2) API / Supabase: network-first
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 3) Assets con hash: cache-first (inmutables)
  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
      ),
    );
    return;
  }

  // 4) Resto (iconos, manifest, fuentes): cache-first + refresco en segundo plano
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }).catch(() => cached);
        return cached || network;
      }),
    );
  }
});

// ---- Recordatorios push ----
self.addEventListener('push', (event) => {
  let data = { title: 'Finanzas del Hogar', body: '¿Ya registraste tus movimientos de hoy?' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Finanzas del Hogar', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    }),
  );
});

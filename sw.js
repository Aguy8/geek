const CACHE_NAME = 'tempo-pro-v4';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png', './vendor/supabase.js', './vendor/html2pdf.bundle.min.js'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

// Clic sur une notification (le seul canal disponible sur Android) : on remet la fenêtre
// de l'app au premier plan, puis on lui relaie l'action pour qu'elle démarre le suivi de
// la tâche concernée — l'équivalent exact d'un appui sur « Démarrer ».
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const action = event.action || '';
  event.notification.close();
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    let client = clientList.find((c) => 'focus' in c) || null;
    if (client) {
      try { await client.focus(); } catch (e) {}
    } else if (self.clients.openWindow) {
      client = await self.clients.openWindow('./index.html');
    }
    if (!client || !data.appAction) return;
    // Une fenêtre tout juste ouverte n'écoute pas encore : on laisse l'app démarrer.
    if (!clientList.length) await new Promise((r) => setTimeout(r, 1500));
    client.postMessage({
      type: 'notification-action',
      appAction: data.appAction,
      action,
      taskId: data.taskId || null
    });
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stratégie "réseau prioritaire, repli sur le cache hors-ligne" : on reste à jour
// tant qu'il y a du réseau, et l'app reste utilisable sans connexion.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return; // laisse passer les requêtes externes (CDN, Supabase...) normalement
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});

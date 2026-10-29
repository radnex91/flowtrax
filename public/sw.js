/* FlowTrax — service worker minimal.
   Objectif : que l'écran de saisie s'ouvre même si le réseau tombe,
   pas de synchronisation hors-ligne (l'écriture exige le serveur). */

const CACHE = 'flowtrax-v12';

const SHELL = [
  './index.html',
  './depart.html',
  './dashboard.html',
  './admin.html',
  './rapports.html',
  './bordereau.html',
  './manifest.webmanifest',
  './assets/app.css',
  './assets/wa.js',
  './assets/supa.js',
  './assets/ident.js',
  './assets/nav.js',
  './assets/theme.js',
  './assets/theme-boot.js',
  './assets/login.js',
  './assets/depart.js',
  './assets/dashboard.js',
  './assets/admin.js',
  './assets/rapports.js',
  './assets/bordereau.js',
  './assets/csv.js',
  './assets/hist.js',
  './assets/logo.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // la configuration ne doit jamais être servie depuis le cache
  if (url.pathname.endsWith('/assets/config.js')) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // stale-while-revalidate : on sert le cache, on rafraîchit derrière
  e.respondWith(
    caches.match(req).then((cached) => {
      const reseau = fetch(req)
        .then((r) => {
          if (r && r.ok) {
            const copie = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copie));
          }
          return r;
        })
        .catch(() => cached);
      return cached || reseau;
    })
  );
});

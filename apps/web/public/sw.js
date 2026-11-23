// FATI UNIVERS — service worker minimal.
// Rôle : permettre l'installation et afficher une page claire quand il n'y a pas de réseau.
// Les données (élèves, notes, paiements) ne sont JAMAIS mises en cache ici.
const CACHE = 'fati-univers-v2';
const OFFLINE_URL = '/hors-ligne';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

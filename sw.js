// Service worker: cachea el "app shell" para que la app funcione sin conexión.
// IMPORTANTE: sube CACHE_VERSION cada vez que cambies cualquier archivo de la
// app. Es lo único que hace que el navegador detecte una versión nueva y
// muestre el aviso "Actualizar"; si no, el móvil sigue sirviendo la caché vieja.
const CACHE_VERSION = 'gasolina-v2';
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/utils.js',
  './js/state.js',
  './js/ui.js',
  './js/calc.js',
  './js/registro.js',
  './js/resumen.js',
  './js/historial.js',
  './js/config.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  // No se llama a skipWaiting() aquí: la nueva versión se queda "esperando"
  // hasta que app.js pida activarla (ver mensaje SKIP_WAITING), para poder
  // avisar antes de recargar en vez de cambiar el código bajo los pies del usuario.
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Las pruebas (tests.html y los scripts que carga) siempre van a la red:
  // si no, probarían el código en caché y no el que se acaba de cambiar.
  if (/\/tests(\.html|\/)/.test(event.request.url) || /\/tests\.html/.test(event.request.referrer)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      // Cache-first para respuesta instantánea offline; refresca la caché en segundo plano.
      return cached || network;
    })
  );
});

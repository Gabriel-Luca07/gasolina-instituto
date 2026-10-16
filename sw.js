// Service worker: la app funciona sin conexión y se actualiza sola.
//
// Cómo se actualiza (pensado para la app añadida a la pantalla de inicio de iPhone):
//  - Con conexión, SIEMPRE se pide la versión más reciente a la red (nunca se
//    sirve primero lo guardado) y se guarda una copia para cuando no haya red.
//  - Sin conexión, o si la red tarda más de NETWORK_TIMEOUT_MS, se usa la copia.
//  - Una versión nueva del service worker se activa sola (skipWaiting + claim)
//    y la página se recarga cuando no hay nada a medias (ver app.js).
//
// IMPORTANTE: sube CACHE_VERSION cada vez que cambies cualquier archivo de la
// app (el hook .githooks/pre-commit lo hace solo). Es lo que hace que el
// navegador detecte el service worker nuevo; la app también lo compara con el
// del servidor para forzar la actualización si el móvil no se entera.
const CACHE_VERSION = 'gasolina-v4';
const NETWORK_TIMEOUT_MS = 4000;
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/icons.js',
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
  // cache: 'reload' salta la caché HTTP del navegador (GitHub Pages guarda los
  // archivos 10 minutos): así la copia nueva nunca mezcla archivos de versiones
  // distintas. skipWaiting: no esperar a que se cierren las pestañas viejas.
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
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
  // La app pregunta qué versión está corriendo para compararla con la del servidor.
  if (event.data === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: CACHE_VERSION });
});

function fetchFresh(request) {
  // no-cache: se revalida siempre con el servidor (una respuesta 304 es casi gratis).
  const target = request.mode === 'navigate' ? request.url : request;
  const network = fetch(target, { cache: 'no-cache' });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS));
  return Promise.race([network, timeout]);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetchFresh(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true })
      || (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Las pruebas (tests.html, tests-ui.html y los scripts que cargan) siempre van a la red.
  if (/\/tests(-ui)?(\.html|\/)/.test(request.url) || /\/tests(-ui)?\.html/.test(request.referrer)) return;

  event.respondWith(networkFirst(request));
});

const CACHE_NAME = 'pdf-unlocker-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './ui/styles.css',
    './ui/app.js',
    './services/pdfService.js',
    './favicon.svg',
    'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js',
    'https://unpkg.com/@neslinesli93/qpdf-wasm@0.3.0/dist/qpdf.js',
    'https://unpkg.com/@neslinesli93/qpdf-wasm@0.3.0/dist/qpdf.wasm',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600;700&display=swap'
];

// Install Event - Caching basic assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching all: app shell and content');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate Event - Cleaning up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// Fetch Event - Network-First Strategy
// Always tries network for fresh content; falls back to cache when offline.
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).then((networkResponse) => {
            // Update cache with fresh response
            return caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
                return networkResponse;
            });
        }).catch(() => {
            // Network unavailable — serve from cache (offline mode)
            return caches.match(event.request);
        })
    );
});
